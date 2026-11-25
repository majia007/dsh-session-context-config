import type { HostContext, AgentLike } from '../types.ts'
import type { ToolDefinitionLike } from './tools.ts'

/** 会话与 agent 的小工具集:身份解析、空白/根判定、schema 与定义读取。 */
export interface SessionKit {
  sessionOf(agent: AgentLike | undefined | null): { id?: unknown; header?: Record<string, unknown> } | null
  sessionIdOf(agent: AgentLike | undefined | null): string | null
  /** 会话工作区(header.cwd,宿主保证是绝对路径);拿不到返回 null。 */
  cwdOf(agent: AgentLike | undefined | null): string | null
  isBlank(agent: AgentLike | undefined | null): boolean
  isRootAgent(agent: AgentLike | undefined | null): boolean
  visibleSchemas(agent: AgentLike | undefined | null): Array<{ name: string; description?: unknown; parameters?: unknown }>
  definitionsOf(agent: AgentLike | undefined | null): ToolDefinitionLike[]
  /** 一条消息里的文本块(skill 正文与其它注入正文都按逐字相等比对)。 */
  messageTexts(message: unknown): string[]
  /**
   * 本会话「将要发送」的历史里出现过的文本块。
   * 必须走 `session.deriveMessages()`:它只按 surface 派生,压缩/替换掉的节点不在结果里,
   * 所以被压缩后查不到、注入会补上(宁可重复,不丢指令)。拿不到会话或派生失败返回 null。
   */
  visibleTexts(agent: AgentLike | undefined | null): Set<string> | null
  agentFor(sessionId: string | null): AgentLike | null
}

export function createSessionKit(ctx: HostContext, note: (source: string, error: unknown) => void): SessionKit {
  function sessionOf(agent: AgentLike | undefined | null) {
    const direct = agent?.session
    if (direct && typeof direct === 'object' && typeof direct.id === 'string') return direct as { id?: unknown; header?: Record<string, unknown> }
    const sessionId = agent?.sessionId ?? direct?.id
    if (!sessionId) return null
    try {
      return (ctx.get('sessions') as { get?: (id: unknown) => { id?: unknown; header?: Record<string, unknown> } | undefined } | undefined)?.get?.(sessionId) ?? null
    } catch (error) {
      note('sessions', error)
      return null
    }
  }

  function sessionIdOf(agent: AgentLike | undefined | null): string | null {
    const id = agent?.sessionId ?? agent?.session?.id ?? agent?.session?.sessionId
    return id != null ? String(id) : null
  }

  /** 新会话默认档位按工作区分开记,判据就是会话头的 cwd(见 host/state.ts 的 lastUsedFor)。 */
  function cwdOf(agent: AgentLike | undefined | null): string | null {
    const cwd = sessionOf(agent)?.header?.cwd
    return typeof cwd === 'string' && cwd.length > 0 ? cwd : null
  }

  function isBlank(agent: AgentLike | undefined | null): boolean {
    const session = sessionOf(agent)
    if (!session) return false
    try {
      const boundary = (ctx.agents as { turnBoundaryOf?: (session: unknown) => { openTurnStartSeq?: unknown; lastTurn?: unknown; lastStepStartSeq?: unknown } | null }).turnBoundaryOf?.(session)
      if (boundary) {
        if (boundary.openTurnStartSeq != null) return false
        if (typeof boundary.lastTurn === 'number') return boundary.lastTurn <= 0
        return boundary.lastStepStartSeq == null
      }
    } catch (error) {
      note('turnBoundaryOf', error)
    }
    return false
  }

  /**
   * 根会话判定。宿主没有 `ctx.agents.roots()`(rc.1 / rc.2 的 AgentRegistry 都只有
   * list / turnBoundaryOf / initiator 面),旧实现每次调用都抛 TypeError、被吞后恒返回
   * true,档位与通道过滤于是套到了子代理头上。唯一可靠的信号是会话头:子代理带
   * `origin: 'subagent'`;fork 会话虽带 `parentSession` 但没有 origin,仍是根会话。
   */
  function isRootAgent(agent: AgentLike | undefined | null): boolean {
    const header = sessionOf(agent)?.header
    if (header === null || header === undefined) return true
    return header.origin !== 'subagent'
  }

  function visibleSchemas(agent: AgentLike | undefined | null) {
    try {
      return ctx.tools.schemas(agent) as Array<{ name: string; description?: unknown; parameters?: unknown }>
    } catch (error) {
      note('schemas', error)
      return []
    }
  }

  function definitionsOf(agent: AgentLike | undefined | null): ToolDefinitionLike[] {
    try {
      return ctx.tools.definitions(agent) as ToolDefinitionLike[]
    } catch (error) {
      note('definitions', error)
      return []
    }
  }

  function messageTexts(message: unknown): string[] {
    const content = (message as { content?: unknown } | null)?.content
    if (!Array.isArray(content)) return []
    const texts: string[] = []
    for (const block of content) {
      const item = block as { type?: unknown; text?: unknown }
      if (item?.type === 'text' && typeof item.text === 'string' && item.text.length > 0) texts.push(item.text)
    }
    return texts
  }

  function visibleTexts(agent: AgentLike | undefined | null): Set<string> | null {
    const session = agent?.session
    const derive = session?.deriveMessages
    if (typeof derive !== 'function') return null
    let messages: unknown
    try {
      messages = derive.call(session)
    } catch (error) {
      note('deriveMessages', error)
      return null
    }
    if (!Array.isArray(messages)) return null
    const texts = new Set<string>()
    for (const message of messages) for (const text of messageTexts(message)) texts.add(text)
    return texts
  }

  function agentFor(sessionId: string | null): AgentLike | null {
    if (!sessionId) return null
    for (const agent of ctx.agents.list()) {
      if (sessionIdOf(agent) === sessionId) return agent
    }
    return null
  }

  return { sessionOf, sessionIdOf, cwdOf, isBlank, isRootAgent, visibleSchemas, definitionsOf, messageTexts, visibleTexts, agentFor }
}

import type { HostContext, AgentLike } from '../types.ts'
import type { ToolDefinitionLike } from './tools.ts'

/** 会话与 agent 的小工具集:身份解析、空白/根判定、schema 与定义读取。 */
export interface SessionKit {
  sessionOf(agent: AgentLike | undefined | null): { id?: unknown; header?: Record<string, unknown> } | null
  sessionIdOf(agent: AgentLike | undefined | null): string | null
  isBlank(agent: AgentLike | undefined | null): boolean
  isRootAgent(agent: AgentLike | undefined | null): boolean
  visibleSchemas(agent: AgentLike | undefined | null): Array<{ name: string; description?: unknown; parameters?: unknown }>
  definitionsOf(agent: AgentLike | undefined | null): ToolDefinitionLike[]
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

  function agentFor(sessionId: string | null): AgentLike | null {
    if (!sessionId) return null
    for (const agent of ctx.agents.list()) {
      if (sessionIdOf(agent) === sessionId) return agent
    }
    return null
  }

  return { sessionOf, sessionIdOf, isBlank, isRootAgent, visibleSchemas, definitionsOf, agentFor }
}

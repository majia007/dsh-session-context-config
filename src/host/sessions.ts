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

  function isRootAgent(agent: AgentLike | undefined | null): boolean {
    try {
      const roots = ctx.agents.roots()
      if (!Array.isArray(roots)) return true
      const sessionId = sessionIdOf(agent)
      return roots.some((root: unknown) => root === agent || sessionIdOf(root as AgentLike) === sessionId)
    } catch (error) {
      note('roots', error)
      return true
    }
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

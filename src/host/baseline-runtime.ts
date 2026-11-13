import { baselineSections, type BaselineFlags } from '../baseline.ts'
import type { AgentLike, HostContext } from '../types.ts'
import type { ProfileRuntime } from './profiles.ts'
import type { SessionKit } from './sessions.ts'
import type { StateStore } from './state-store.ts'

/**
 * 附加规则的 per-agent 注册面。
 *
 * 为什么不是全局段:baseline 现在按档位存(state.profiles[].baseline),而宿主
 * system-prompt 的 section 文本函数只拿 AssembleContext(没有 agent)。把四段注册
 * 进 agent 作用域,用同名 scoped section 遮住全局兜底段,就能在每次装配时按该
 * agent 所属根会话的档位取值。子代理沿 header.parentSession 找根会话,跟随根档位。
 */
export interface BaselineRuntime {
  /** 注册/重注册某个 agent 的四段;重复调用会先撤旧注册。 */
  apply(agent: AgentLike): void
  /** 只撤该 agent 的注册;同 sessionId 已被新 agent 接管时不动。 */
  release(agent: AgentLike): void
  /** 解析某 agent 最终使用的附加规则(根档位;找不到时回落顶层兜底)。 */
  baselineFor(agent: AgentLike): BaselineFlags
  dispose(): void
}

interface Entry {
  agent: AgentLike
  disposers: Array<() => void>
}

export function createBaselineRuntime(
  ctx: HostContext,
  store: StateStore,
  kit: SessionKit,
  profiles: ProfileRuntime,
  note: (source: string, error: unknown) => void,
): BaselineRuntime {
  const entries = new Map<string, Entry>()

  function sessionById(sessionId: string): { header?: Record<string, unknown> } | null {
    try {
      const sessions = ctx.get('sessions') as { get?: (id: unknown) => { header?: Record<string, unknown> } | undefined } | undefined
      return sessions?.get?.(sessionId) ?? null
    } catch (error) {
      note('baseline parent session', error)
      return null
    }
  }

  function profileIdForSession(sessionId: string | null): string | null {
    if (!sessionId) return null
    const applied = profiles.applied.get(sessionId)?.profileId
    const recorded = store.state.sessions[sessionId]
    const id = applied ?? recorded ?? null
    return id && id !== 'none' ? id : null
  }

  /** 子代理沿 parentSession 找根;fork 会话没有 origin,本身按根处理。 */
  function rootSessionIdOf(agent: AgentLike): string | null {
    let sessionId = kit.sessionIdOf(agent)
    let session = kit.sessionOf(agent)
    let guard = 0
    while (
      session?.header?.origin === 'subagent'
      && typeof session.header.parentSession === 'string'
      && session.header.parentSession
      && guard < 16
    ) {
      sessionId = session.header.parentSession
      session = sessionById(sessionId)
      guard += 1
    }
    return sessionId
  }

  function baselineFor(agent: AgentLike): BaselineFlags {
    const profileId = profileIdForSession(rootSessionIdOf(agent))
    const profile = profileId ? profiles.profileById(profileId) : null
    return profile?.baseline ?? store.state.baseline
  }

  function disposeEntry(sessionId: string): void {
    const entry = entries.get(sessionId)
    if (!entry) return
    entries.delete(sessionId)
    for (const dispose of entry.disposers.reverse()) {
      try {
        dispose()
      } catch (error) {
        note('baseline section dispose', error)
      }
    }
  }

  function apply(agent: AgentLike): void {
    const sessionId = kit.sessionIdOf(agent)
    const systemPrompt = agent.ctx?.systemPrompt
    if (!sessionId || !systemPrompt?.section) return
    disposeEntry(sessionId)
    const disposers: Array<() => void> = []
    for (const section of baselineSections(() => baselineFor(agent))) {
      try {
        const dispose = systemPrompt.section(section)
        if (typeof dispose === 'function') disposers.push(dispose as () => void)
      } catch (error) {
        note('baseline section', error)
      }
    }
    if (disposers.length > 0) entries.set(sessionId, { agent, disposers })
  }

  function release(agent: AgentLike): void {
    const sessionId = kit.sessionIdOf(agent)
    if (!sessionId) return
    const entry = entries.get(sessionId)
    if (!entry || entry.agent !== agent) return
    disposeEntry(sessionId)
  }

  function dispose(): void {
    for (const sessionId of [...entries.keys()]) disposeEntry(sessionId)
  }

  return { apply, release, baselineFor, dispose }
}

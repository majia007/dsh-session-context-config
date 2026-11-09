import { ENVIRONMENT_CONTEXT, ENVIRONMENT_CONTEXT_ORDER } from './constants.ts'
import { environmentFactsText, probeEnvironment, type EnvironmentFacts } from './environment-facts.ts'
import type { SessionKit } from './sessions.ts'
import type { AgentLike, HostContext } from '../types.ts'

/**
 * 环境事实按 agent 注册成运行时上下文,并且**所有 agent 都装**——子代理同样需要
 * platform/shell/git,否则它在 Windows 上会按 POSIX 习惯写命令。是否进入请求由
 * 档位的 contexts 逐项过滤;子代理没有档位,因此默认一直保留。
 *
 * 探测在注册时同步做一次并固定:这段文本每次变化都会让宿主追加一条新的快照
 * 消息,等于每次 git 变化都重写请求前缀。会话内不再复测是有意取舍。
 */
export interface EnvironmentRuntime {
  applyEnvironment(agent: AgentLike): void
  releaseEnvironment(agent: AgentLike): void
  dispose(): void
}

export function createEnvironmentRuntime(ctx: HostContext, kit: SessionKit, note: (source: string, error: unknown) => void): EnvironmentRuntime {
  const envApplied = new Map<string, { dispose: () => void; facts: EnvironmentFacts }>()

  function applyEnvironment(agent: AgentLike): void {
    const sessionId = kit.sessionIdOf(agent)
    if (!sessionId || envApplied.has(sessionId)) return
    if (!agent?.ctx?.systemPrompt?.context) return
    try {
      const session = kit.sessionOf(agent)
      const cwd = typeof session?.header?.cwd === 'string' ? session.header.cwd : undefined
      const names = new Set(kit.visibleSchemas(agent).map((schema) => schema.name))
      const shellTool = names.has('pwsh') ? 'pwsh' : names.has('bash') ? 'bash' : null
      const facts = probeEnvironment({ cwd, shellTool })
      const text = environmentFactsText(facts)
      const dispose = agent.ctx.systemPrompt.context({
        name: ENVIRONMENT_CONTEXT,
        order: ENVIRONMENT_CONTEXT_ORDER,
        interpolate: false,
        text: () => text,
      })
      envApplied.set(sessionId, { dispose: dispose as () => void, facts })
    } catch (error) {
      note('environment', error)
    }
  }

  function releaseEnvironment(agent: AgentLike): void {
    const sessionId = kit.sessionIdOf(agent)
    const entry = sessionId ? envApplied.get(sessionId) : null
    if (!entry) return
    envApplied.delete(sessionId as string)
    try {
      entry.dispose()
    } catch (error) {
      note('environment dispose', error)
    }
  }

  function dispose(): void {
    for (const entry of envApplied.values()) {
      try {
        entry.dispose()
      } catch (error) {
        note('environment dispose', error)
      }
    }
    envApplied.clear()
  }

  return { applyEnvironment, releaseEnvironment, dispose }
}

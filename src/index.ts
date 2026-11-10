/**
 * 上下文档位 · Host(v0.2)——插件面与装配。
 *
 * 模型:档位持有一份「组 / server / 工具」三级状态表,应用时解析成每个工具的三态:
 *   注入(on) / 延迟(defer) / 隐藏(off)
 *
 * - 隐藏:`agent.ctx.tools.restrict({ deny })`,不发 schema、也调不到。
 * - 延迟:不删除工具,只在系统提示装配时把它的 description 换成一句功能摘要、
 *   parameters 只剥说明文本、保留每个参数的类型;完整定义由 `tool_search` 以工具结果的形式追加进历史。
 *   tools 数组在整个会话里保持不变,因此前缀缓存不会被加载动作打断。
 *
 * 只作用于根会话;已开始的会话只有在用户确认切换档位时才会重算。
 *
 * 结构:基线层(baseline)、常量/状态/解析(host/constants|state|tools)、
 * 状态存取(state-store)、会话工具(sessions)、档位应用(profiles)、环境事实
 * (environment)、目录(catalog)、HTTP 路由(routes)各占一个模块;本文件只做装配。
 */
import { BASELINE_SECTION_NAME, baselineSections, type BaselineFlags } from './baseline.ts'
import { CHANNELS, OFF, PERSONA_SECTION, PERSONA_SUFFIX_SECTION } from './host/constants.ts'
import { createEnvironmentRuntime } from './host/environment.ts'
import { createProfileRuntime } from './host/profiles.ts'
import { ROUTES, createRoutes } from './host/routes.ts'
import { createSessionKit } from './host/sessions.ts'
import { messageOf, recordSession } from './host/state.ts'
import { createStateStore } from './host/state-store.ts'
import { createTranslationRuntime } from './host/translations.ts'
import type { AgentContext, AgentLike, HostContext } from './types.ts'

export const name = 'session-context-config'
export const inject = ['agents', 'tools', 'systemPrompt']

/** 人设段(前缀+后缀)与附加规则段由专用开关控制,不参与 profile.sections 的通配过滤。 */
const PROTECTED_SECTION_NAMES = new Set<string>([PERSONA_SECTION, PERSONA_SUFFIX_SECTION, ...Object.values(BASELINE_SECTION_NAME)])

export function apply(ctx: HostContext): void {
  /** 诊断:进程内环形缓冲 + console.warn。 */
  const diagnostics: Array<{ at: string; source: string; message: string }> = []
  const note = (source: string, error: unknown): void => {
    diagnostics.unshift({ at: new Date().toISOString(), source, message: messageOf(error) })
    diagnostics.length = Math.min(diagnostics.length, 20)
    console.warn(`[session-context-config] ${source}: ${messageOf(error)}`)
  }

  const store = createStateStore(note)
  const kit = createSessionKit(ctx, note)
  const profiles = createProfileRuntime(ctx, store, kit, note)
  const environment = createEnvironmentRuntime(ctx, kit, note)
  const translations = createTranslationRuntime(ctx, note)
  const routes = createRoutes({ ctx, store, kit, profiles, translations, note, diagnostics })

  store.load()

  // 基线三段是全局段:与档位无关,每个 agent 的装配都会带上;开关关闭时段文本为空,
  // 装配层会丢弃空段。用函数读 state,所以面板改开关不需要重新注册。
  const baselineSectionDisposers: Array<() => void> = []
  for (const section of baselineSections((): BaselineFlags => store.state.baseline)) {
    try {
      baselineSectionDisposers.push(ctx.systemPrompt.section(section) as () => void)
    } catch (error) {
      note('baseline section', error)
    }
  }

  // webServer 是宿主补挂的服务:插件启动时它可能还没就绪,必须用 inject 等它出现。
  ctx.inject(['webServer'], (sctx) => {
    try {
      const web = sctx.get('webServer') as { register?: (route: { kind: string; path: string; handler: unknown }) => unknown } | undefined
      if (!web?.register) {
        note('webServer', new Error('webServer 没有 register'))
        return
      }
      const disposers = [
        web.register({ kind: 'exact', path: ROUTES.STATE, handler: routes.handleState }),
        web.register({ kind: 'exact', path: ROUTES.SESSION, handler: routes.handleSession }),
        web.register({ kind: 'exact', path: ROUTES.PREVIEW, handler: routes.handlePreview }),
        web.register({ kind: 'exact', path: ROUTES.ASSEMBLE, handler: routes.handleAssemble }),
        web.register({ kind: 'exact', path: ROUTES.TRANSLATE, handler: routes.handleTranslate }),
      ] as Array<() => void>
      sctx.effect(
        () => () => {
          for (const dispose of disposers) {
            try {
              dispose()
            } catch (error) {
              note('route dispose', error)
            }
          }
        },
        'session-context-config: routes',
      )
    } catch (error) {
      note('webServer', error)
    }
  })

  ctx.on('agent/created', (...args: never[]) => {
    try {
      const payload = args[0] as { agent?: AgentLike } | undefined
      const agent = payload?.agent as AgentLike
      environment.applyEnvironment(agent)
      if (!kit.isRootAgent(agent)) return
      ensureChannelFilter(agent)
      const sessionId = kit.sessionIdOf(agent)
      if (!sessionId) return
      const recorded = store.state.sessions[sessionId]
      if (recorded) {
        profiles.applyTo(agent, recorded)
        return
      }
      if (!kit.isBlank(agent)) return
      profiles.applyTo(agent, store.state.lastUsedId)
      recordSession(store.state, sessionId, store.state.lastUsedId)
      store.persistSoon()
    } catch (error) {
      note('agent/created', error)
    }
  })

  ctx.on('agent/disposed', (...args: never[]) => {
    const payload = args[0] as { agent?: AgentLike } | undefined
    const agent = payload?.agent as AgentLike
    releaseChannelFilter(agent)
    environment.releaseEnvironment(agent)
    profiles.release(agent)
  })

  // 工具表变化只做增量刷新(不走 applyTo):整份 release→重注册会让当前 step 的准入集
  // 失效,该 step 内所有延迟工具都会报 unknown tool(见 host/profiles.ts 的 refresh)。
  let changeTimer: ReturnType<typeof setTimeout> | null = null
  ctx.on('tools/change', () => {
    if (profiles.isApplying) return
    if (changeTimer) clearTimeout(changeTimer)
    changeTimer = setTimeout(() => {
      changeTimer = null
      for (const entry of [...profiles.applied.values()]) {
        if (!entry.agent || entry.profileId === 'none') continue
        try {
          profiles.refresh(entry.agent)
        } catch (error) {
          note('tools/change', error)
        }
      }
    }, 300)
  })

  /* 通道拦截 */

  function profileOf(agent: AgentLike) {
    const sessionId = kit.sessionIdOf(agent)
    if (!sessionId) return null
    const entry = profiles.applied.get(sessionId)
    const profileId = entry?.profileId ?? store.state.sessions[sessionId]
    if (!profileId || profileId === 'none') return null
    return profiles.profileById(profileId)
  }

  /** 档位只记录关掉的上下文;缺省=注入。 */
  function disabledContexts(profile: ReturnType<typeof profileOf>): Set<string> {
    const disabled = new Set<string>()
    for (const [name, enabled] of Object.entries(profile?.contexts ?? {})) {
      if (enabled === false) disabled.add(name)
    }
    return disabled
  }

  /** 档位只记录关掉的系统段;缺省=包含。受保护段由人设/附加规则开关单独控制。
   *  tool:* 是工具引导段,跟随工具可用性(工具隐藏时宿主不会再产出文本),不在这里过滤。 */
  function disabledSections(profile: ReturnType<typeof profileOf>): Set<string> {
    const disabled = new Set<string>()
    for (const [name, enabled] of Object.entries(profile?.sections ?? {})) {
      if (enabled === false && !PROTECTED_SECTION_NAMES.has(name) && !name.startsWith('tool:')) disabled.add(name)
    }
    return disabled
  }

  const channelFilter = (async (...args: never[]) => {
    const payload = args[0] as { agent?: AgentLike; signal?: AbortSignal | undefined }
    const next = args[1] as () => Promise<{ kind?: unknown; messages: Array<{ source?: { kind?: unknown } }> }>
    const decision = await next()
    if (decision.kind === 'reject' || payload.signal?.aborted || !payload.agent) return decision
    const profile = profileOf(payload.agent)
    const blocked = new Set<unknown>()
    for (const channel of CHANNELS) {
      if ((profile as { channels?: Record<string, string> } | null)?.channels?.[channel.id] === OFF) blocked.add(channel.source)
    }
    if (blocked.size === 0) return decision
    const messages = decision.messages.filter((message) => !blocked.has(message?.source?.kind))
    return messages.length === decision.messages.length ? decision : { ...decision, messages }
  }) as unknown as (...args: never[]) => unknown

  /**
   * 按 agent 注册通道过滤器。
   *
   * time-context 属于 agent preset,在会话创建时挂载,且用 prepend 追加时间消息;
   * 它晚于本插件的全局注册,所以会排到全局过滤器**前面**,全局过滤器就看不到它
   * 刚追加的消息(实测:关掉时间采样仍会漏进一条 time-context user 消息)。
   * agent/created 时预设插件已挂载完毕,此时再 prepend 注册一次,过滤器才真正
   * 落在链头。注册进 agent 自己的作用域,随 agent 释放;插件卸载时由 teardown
   * 统一撤销。
   */
  const channelFilters = new Map<string, { agent: object; dispose: () => void }>()

  function ensureChannelFilter(agent: AgentLike | undefined | null): void {
    const sessionId = kit.sessionIdOf(agent)
    if (!sessionId || !agent) return
    const existing = channelFilters.get(sessionId)
    // 同一 sessionId 可能换 agent(空白会话重组合):旧监听器随旧 agent 释放,这里补新的。
    if (existing && existing.agent === agent) return
    if (existing) releaseChannelFilter(existing.agent as AgentLike)
    const agentCtx = agent.ctx as (AgentContext & {
      on?: (name: string, listener: (...args: never[]) => unknown, options?: { prepend?: boolean }) => unknown
    }) | null | undefined
    if (typeof agentCtx?.on !== 'function') return
    try {
      // 原样经 ctx 调用(不解构方法),否则丢 this。
      const dispose = agentCtx.on('agent/pre-step', channelFilter, { prepend: true })
      if (typeof dispose === 'function') channelFilters.set(sessionId, { agent, dispose: dispose as () => void })
    } catch (error) {
      note('channel filter', error)
    }
  }

  function releaseChannelFilter(agent: AgentLike | undefined | null): void {
    const sessionId = kit.sessionIdOf(agent)
    if (!sessionId) return
    const existing = channelFilters.get(sessionId)
    // 旧 agent 的 disposed 迟到时,不要撤掉同 sessionId 新 agent 的过滤器。
    if (!existing || (agent && existing.agent !== agent)) return
    channelFilters.delete(sessionId)
    try {
      existing.dispose()
    } catch (error) {
      note('channel filter dispose', error)
    }
  }

  // 兜底:拿不到 agent.ctx.on 的宿主仍靠全局过滤器(代价是对预设里 prepend 的
  // time-context 无效,见 ensureChannelFilter)。
  ctx.on('agent/pre-step', channelFilter, { prepend: true })

  // 按档位逐个过滤运行时上下文与系统段。agent 作用域里的同名非 required 空上下文
  // (host/profiles.ts)负责让 refreshContext 不把 required 段补回;工作目录服务
  // 会在 next() 之后写入真实 cwd,所以过滤器必须用 prepend 包在它外面。
  // sections 过滤放在这里而不是注册同名空段:它同时覆盖工具/MCP/其他插件注册的任意段,
  // 且 refreshContext 不会重跑 sections,不需要 shadow 那份兜底。
  // sccFullSections 是给面板列目录用的私有旁路:返回未过滤的完整段名单,不改请求路径。
  // ⚠️ global:true 必须带:assemble 走 scopeTarget(按 agent scope 过滤派发),普通
  // 监听器会被 Cordis 的 context filter 挡掉,单测直接调 listener 发现不了。
  ctx.on('system-prompt/assemble', (async (...args: never[]) => {
    const assembly = args[0] as { sections?: Array<{ name?: unknown }>; contexts?: Array<{ name?: unknown }> }
    const context = args[1] as { agent?: AgentLike; sccFullSections?: unknown } | undefined
    const next = args[2] as (() => Promise<{ sections?: Array<{ name?: unknown }>; contexts?: Array<{ name?: unknown }> }>) | undefined
    const result = typeof next === 'function' ? await next() : assembly
    const agent = context?.agent
    if (!agent) return result
    if (context?.sccFullSections === true) return result
    const profile = profileOf(agent)
    const disabledCtx = disabledContexts(profile)
    const disabledSec = disabledSections(profile)
    if (disabledCtx.size === 0 && disabledSec.size === 0) return result
    if (!result) return result
    let changed = false
    let sections = result.sections
    if (disabledSec.size > 0 && Array.isArray(result.sections)) {
      sections = result.sections.filter((entry) => !disabledSec.has(String(entry?.name)))
      changed = sections.length !== result.sections.length
    }
    let contexts = result.contexts
    if (disabledCtx.size > 0 && Array.isArray(result.contexts)) {
      contexts = result.contexts.filter((entry) => !disabledCtx.has(String(entry?.name)))
      changed = changed || contexts.length !== result.contexts.length
    }
    return changed ? { ...result, sections, contexts } : result
  }) as unknown as (...args: never[]) => unknown, { prepend: true, global: true })

  // 插件重载后,已有会话的 restriction 会随旧 ctx 一起撤销,这里补一次。
  for (const agent of ctx.agents.list()) {
    try {
      environment.applyEnvironment(agent)
      if (!kit.isRootAgent(agent)) continue
      ensureChannelFilter(agent)
      const sessionId = kit.sessionIdOf(agent)
      const recorded = sessionId ? store.state.sessions[sessionId] : undefined
      if (recorded) profiles.applyTo(agent, recorded)
    } catch (error) {
      note('reapply', error)
    }
  }

  ctx.effect(() => () => {
    for (const entry of channelFilters.values()) {
      try {
        entry.dispose()
      } catch (error) {
        note('channel filter dispose', error)
      }
    }
    channelFilters.clear()
    for (const dispose of baselineSectionDisposers) {
      try {
        dispose()
      } catch (error) {
        note('baseline section dispose', error)
      }
    }
    environment.dispose()
    translations.dispose()
    store.flush()
    profiles.dispose()
    if (changeTimer) clearTimeout(changeTimer)
  }, 'session-context-config: teardown')
}

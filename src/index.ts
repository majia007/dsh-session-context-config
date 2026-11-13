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
import { createBaselineRuntime } from './host/baseline-runtime.ts'
import { CHANNELS, OFF, PERSONA_SECTION, PERSONA_SUFFIX_SECTION } from './host/constants.ts'
import { createEnvironmentRuntime } from './host/environment.ts'
import { createInjectedMessages } from './host/injected.ts'
import { createProfileRuntime } from './host/profiles.ts'
import { ROUTES, createRoutes } from './host/routes.ts'
import { createSessionKit } from './host/sessions.ts'
import { createSourceIndex } from './host/sources.ts'
import { messageOf, recordSession } from './host/state.ts'
import { createStateStore } from './host/state-store.ts'
import { createTranslationRuntime } from './host/translations.ts'
import { hiddenToolGuide } from './host/tools.ts'
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

  // 来源拦截必须最先装:本插件装载后注册的工具才能被捕获(见 host/sources.ts)。
  const sources = createSourceIndex(ctx, note)
  const store = createStateStore(note)
  const kit = createSessionKit(ctx, note)
  const profiles = createProfileRuntime(ctx, store, kit, note)
  const baseline = createBaselineRuntime(ctx, store, kit, profiles, note)
  const environment = createEnvironmentRuntime(ctx, kit, note)
  const translations = createTranslationRuntime(ctx, note)
  // 自动发现的注入消息清单:通道白名单之外的内容(第三方插件/未来版本)也能在面板里看到。
  const injected = createInjectedMessages()
  const routes = createRoutes({ ctx, store, kit, profiles, sources, translations, injected, note, diagnostics })

  store.load()

  // 全局 baseline 段只作兜底:每个 agent 在 baseline-runtime 里注册同名 scoped 段,
  // 按所属根会话的档位取值并遮住这里;只有注册失败/拿不到 agent 时才回落到顶层 baseline。
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
      // 子代理也要注册:四段按所属根会话的档位取值,没有 scoped 段就落到全局兜底。
      baseline.apply(agent)
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
    baseline.release(agent)
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
   *  `tool:*` 强绑定工具状态,**不接受** `sections` 单独控制:隐藏逻辑统一由
   *  host/tools.ts 的 hiddenToolGuide 按工具/组终态推导,状态里的残留也忽略。 */
  function disabledSections(profile: ReturnType<typeof profileOf>): Set<string> {
    const disabled = new Set<string>()
    for (const [name, enabled] of Object.entries(profile?.sections ?? {})) {
      if (enabled === false && !PROTECTED_SECTION_NAMES.has(name) && !name.startsWith('tool:')) disabled.add(name)
    }
    return disabled
  }

  // 全局过滤器与 agent 作用域过滤器会各看一遍同一批消息,按对象身份去重,避免计数翻倍。
  const observedMessages = new WeakSet<object>()

  /** 消息里的文本块;技能注入只有一块,工具结果也可能带正文。 */
  function textBlocks(message: unknown): string[] {
    const content = (message as { content?: unknown } | null)?.content
    if (!Array.isArray(content)) return []
    const texts: string[] = []
    for (const block of content) {
      const item = block as { type?: unknown; text?: unknown }
      if (item?.type === 'text' && typeof item.text === 'string' && item.text.length > 0) texts.push(item.text)
    }
    return texts
  }

  /**
   * 本会话「将要发送」的历史里出现过的文本块,供技能注入去重比对。
   *
   * 必须用 `session.deriveMessages()` 而不是会话日志:它只走 surface 派生,压缩/替换掉的
   * 节点不在结果里——正文已被压缩掉时这里就查不到,注入照旧补上(绝不丢指令)。
   * 拿不到会话或派生失败时返回 null(= 不做去重):宁可重复,不误删。
   * 原样经 `call` 调用,避免方法解构后丢 this。
   */
  function visibleTexts(agent: AgentLike): Set<string> | null {
    const session = agent.session
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
    for (const message of messages) for (const text of textBlocks(message)) texts.add(text)
    return texts
  }

  const channelFilter = (async (...args: never[]) => {
    const payload = args[0] as { agent?: AgentLike; signal?: AbortSignal | undefined }
    const next = args[1] as () => Promise<{ kind?: unknown; messages: Array<{ role?: unknown; source?: { kind?: unknown }; content?: unknown }> }>
    const decision = await next()
    if (decision.kind === 'reject' || payload.signal?.aborted || !payload.agent) return decision
    // 过滤前先记账:被关掉的通道也要能在面板清单里看到内容,否则用户不知道自己
    // 挡掉了什么。只记根会话(档位也只作用于根会话)。
    if (kit.isRootAgent(payload.agent) && Array.isArray(decision.messages)) {
      const fresh = decision.messages.filter((message) => {
        if (!message || typeof message !== 'object') return false
        if (observedMessages.has(message)) return false
        observedMessages.add(message)
        return true
      })
      injected.observe(fresh, profileOf(payload.agent)?.id ?? 'none')
    }
    const profile = profileOf(payload.agent)
    const blocked = new Set<unknown>()
    const channels = (profile as { channels?: Record<string, string> } | null)?.channels ?? {}
    // 已知两条通道的键是界面 id,映射到 source.kind;其余键本身就是 source.kind,
    // 这样第三方插件注入的消息也能被档位关掉。
    for (const channel of CHANNELS) {
      if (channels[channel.id] === OFF) blocked.add(channel.source)
    }
    const knownIds = new Set(CHANNELS.map((channel) => channel.id))
    for (const [kind, state] of Object.entries(channels)) {
      if (state === OFF && !knownIds.has(kind)) blocked.add(kind)
    }
    let messages = blocked.size === 0
      ? decision.messages
      : decision.messages.filter((message) => !blocked.has(message?.source?.kind))
    // 技能注入去重(档位开关,默认注入):injectDuplicateSkills=false 时,同正文已在可见
    // 历史里就跳过这次注入。判据是正文逐字相等——skill 工具结果与手势注入共用
    // renderSkillContent,同一技能就是同一串文本。
    const injectDuplicates = (profile as { injectDuplicateSkills?: unknown } | null)?.injectDuplicateSkills !== false
    if (!injectDuplicates && messages.some((message) => message?.source?.kind === 'skill-invocation')) {
      const visible = visibleTexts(payload.agent)
      if (visible) {
        messages = messages.filter((message) => message?.source?.kind !== 'skill-invocation'
          || !textBlocks(message).some((text) => visible.has(text)))
      }
    }
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
    if (!result) return result
    // 工具/组隐藏时自动连带其 tool:* 引导段;复合段(jobs/goal/schedule)走别名组。
    const hiddenGuides = new Set<string>()
    if (Array.isArray(result.sections)) {
      for (const entry of result.sections) {
        const name = String(entry?.name ?? '')
        if (name && hiddenToolGuide(profile, name)) hiddenGuides.add(name)
      }
    }
    if (disabledCtx.size === 0 && disabledSec.size === 0 && hiddenGuides.size === 0) return result
    let changed = false
    let sections = result.sections
    if ((disabledSec.size > 0 || hiddenGuides.size > 0) && Array.isArray(result.sections)) {
      sections = result.sections.filter((entry) => {
        const name = String(entry?.name)
        return !disabledSec.has(name) && !hiddenGuides.has(name)
      })
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
      baseline.apply(agent)
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
    baseline.dispose()
    translations.dispose()
    sources.dispose()
    store.flush()
    profiles.dispose()
    if (changeTimer) clearTimeout(changeTimer)
  }, 'session-context-config: teardown')
}

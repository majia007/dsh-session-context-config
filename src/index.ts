/**
 * 上下文档位 · Host(v0.2)——插件面与装配。
 *
 * 模型:档位持有一份「组 / server / 工具」三级状态表(各层都可取 force),应用时解析成每个工具的三态:
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
import { CHANNELS, LEADING_CONTEXT_KINDS, OFF, PERSONA_SECTION, PERSONA_SUFFIX_SECTION } from './host/constants.ts'
import { createEnvironmentRuntime } from './host/environment.ts'
import { createForkInheritance } from './host/fork-inherit.ts'
import { createInjectedMessages } from './host/injected.ts'
import { createReadInstructionTracker, pruneInstructionMessages } from './host/instructions.ts'
import { createProfileRuntime } from './host/profiles.ts'
import { ROUTES, createRoutes } from './host/routes.ts'
import { createSessionKit } from './host/sessions.ts'
import { createSourceIndex } from './host/sources.ts'
import { lastUsedFor, messageOf, recordSession } from './host/state.ts'
import { createStateStore } from './host/state-store.ts'
import { createTranslationRuntime } from './host/translations.ts'
import { hiddenCompanionSection } from './host/tools.ts'
import type { AgentContext, AgentLike, HostContext } from './types.ts'

export const name = 'session-context-config'
export const inject = ['agents', 'tools', 'systemPrompt']

/** 人设段(前缀+后缀)与附加规则段由专用开关控制,不参与 profile.sections 的通配过滤。 */
const PROTECTED_SECTION_NAMES = new Set<string>([PERSONA_SECTION, PERSONA_SUFFIX_SECTION, ...Object.values(BASELINE_SECTION_NAME)])

/** 前移白名单的集合形态:每个 pre-step 都要查,不在过滤器里重建。 */
const LEADING_CONTEXT_SET = new Set(LEADING_CONTEXT_KINDS)

/** 宿主的 `skill` 工具名:工具结果去重只认这一个名字。 */
const SKILL_TOOL_NAME = 'skill'

/** 命中重复时替换进工具结果的正文:提示模型参考上文,不再重复整份技能正文。 */
const SKILL_ALREADY_LOADED = 'The full body of this skill is already in the visible conversation (injected earlier). Refer to that block instead of sending it again; request it only if it is no longer visible.'

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
  // 已读工作区指令去重:记录模型完整读过的文件与内容摘要(见 host/instructions.ts)。
  const readInstructions = createReadInstructionTracker(kit, note)
  const profiles = createProfileRuntime(ctx, store, kit, note)
  // fork 认亲:宿主不写来源会话 id,只能按继承前缀的日志指纹反查(见 host/fork-inherit.ts)。
  const forkInheritance = createForkInheritance({
    ctx,
    kit,
    recordedProfile: (sessionId) => profiles.applied.get(sessionId)?.profileId ?? store.state.sessions[sessionId] ?? null,
    recordedIds: () => Object.keys(store.state.sessions),
    note,
  })
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

  ctx.on('agent/created', async (...args: never[]) => {
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
      if (!kit.isBlank(agent)) {
        // 不是新会话:fork 先按继承前缀找回来源会话的档位(见 host/fork-inherit.ts);
        // 不是 fork、或来源已不可读时显式记成「不处理」——留空会让客户端回落到
        // lastUsedId 冒充它的档位(实测 fork 后 chip 写着「完整」,而该会话一条延迟
        // 占位都没有)。记录之后 UI 直接标「未套用」,由用户自己点一下切换。
        const inherited = await forkInheritance.inheritedProfile(agent)
        // 来源记录的档位可能已经被删掉(用户删了自定义档位):认不出这个 id 就按
        // 「不处理」——记一个不存在的档位会让 applyTo 给出空 plan,而 UI 却显示那个名字。
        const profileId = inherited === null
          ? 'none'
          : inherited === 'none' || profiles.profileById(inherited) !== null ? inherited : 'none'
        profiles.applyTo(agent, profileId)
        recordSession(store.state, sessionId, profileId)
        store.persistSoon()
        return
      }
      // 新会话的默认档位按会话工作区取:该工作区没有记录时按「不处理」起步,
      // 不回落其它工作区的 lastUsedId(那会把在别的工作区选的档位带过来)。
      const initial = lastUsedFor(store.state, kit.cwdOf(agent))
      profiles.applyTo(agent, initial)
      recordSession(store.state, sessionId, initial)
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
    const sessionId = kit.sessionIdOf(agent)
    if (sessionId) readInstructions.release(sessionId)
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

  // 已读工作区指令去重(档位开关 dedupeReadInstructions,默认关):read 的结果只在
  // 工具执行后出现,pre-step 看不到,所以先按 tools/result 记录「完整读取 + 内容摘要」。
  ctx.on('tools/result', (...args: never[]) => {
    readInstructions.observe(args[0], args[1])
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
   *  `tool:*` 与 `mcp:<server>` 都强绑定其来源状态,**不接受** `sections` 单独控制:
   *  隐藏逻辑统一由 host/tools.ts 的 hiddenCompanionSection 按工具/组/server 终态推导,
   *  状态里的残留也忽略。 */
  function disabledSections(profile: ReturnType<typeof profileOf>): Set<string> {
    const disabled = new Set<string>()
    for (const [name, enabled] of Object.entries(profile?.sections ?? {})) {
      if (enabled === false && !PROTECTED_SECTION_NAMES.has(name) && !name.startsWith('tool:') && !name.startsWith('mcp:')) {
        disabled.add(name)
      }
    }
    return disabled
  }

  // 全局过滤器与 agent 作用域过滤器会各看一遍同一批消息,按对象身份去重,避免计数翻倍。
  const observedMessages = new WeakSet<object>()

  /** 消息里的文本块;技能注入只有一块,工具结果也可能带正文。 */
  const textBlocks = kit.messageTexts

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
      const visible = kit.visibleTexts(payload.agent)
      if (visible) {
        messages = messages.filter((message) => message?.source?.kind !== 'skill-invocation'
          || !textBlocks(message).some((text) => visible.has(text)))
      }
    }
    // 已读工作区指令去重(档位开关,默认关):宿主的 agent-instructions 在文件触碰后
    // 会把同一份 AGENTS.md 再注入一次;模型已用 read 完整读过时,同内容的
    // `Additional instructions from:` 直接剔除。只删这一种——文件改动后的 Updated 与
    // 删除通知仍要进入上下文。判据是内容摘要,不是只看路径(见 host/instructions.ts)。
    if ((profile as { dedupeReadInstructions?: unknown } | null)?.dedupeReadInstructions === true) {
      try {
        messages = pruneInstructionMessages(messages, payload.agent as AgentLike, readInstructions, kit)
      } catch (error) {
        note('read instruction dedupe', error)
      }
    }
    // 发送顺序(档位开关,默认关闭 = 保持宿主顺序):只前移「起始上下文」块——工作区
    // 指令/运行时快照/技能目录,它们跨会话内容稳定,前移后能落进共享前缀。时间采样、
    // 用户消息、`/技能名` 注入的技能正文(skill-invocation)与运行期通知保持宿主顺序:
    // 宿主刻意把技能正文放在所有注入之后、贴着模型回答;白名单之外不猜。
    // 这里改的是落盘到 surface 的顺序(steer/追加都按数组顺序提交),不改历史。
    if ((profile as { injectedFirst?: unknown } | null)?.injectedFirst === true && messages.length > 1) {
      // 按 LEADING_CONTEXT_KINDS 的固定优先级分桶再拼(全局指令 → 技能目录 → 运行时快照),
      // 同类内保持宿主给的相对顺序;宿主自己的先后取决于插件注册次序,不跟它。
      const buckets = new Map<string, typeof messages>()
      const rest: typeof messages = []
      for (const message of messages) {
        const kind = message?.source?.kind
        if (typeof kind === 'string' && LEADING_CONTEXT_SET.has(kind)) {
          const bucket = buckets.get(kind)
          if (bucket) bucket.push(message)
          else buckets.set(kind, [message])
        } else rest.push(message)
      }
      const leading = LEADING_CONTEXT_KINDS.flatMap((kind) => buckets.get(kind) ?? [])
      // 没有用户消息的批次(工具续跑)不前移:没有「用户消息在后」可换,顺序保持原样。
      if (leading.length > 0 && rest.some((message) => message?.source?.kind === 'user')) {
        messages = [...leading, ...rest]
      }
    }
    return messages === decision.messages ? decision : { ...decision, messages }
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

  /**
   * `skill` 工具结果去重(档位开关 `dedupeSkillToolResults`,默认关闭)。
   *
   * 落点是 `tools/post-execute`:它在结果落盘前拿到 render 之后的正文,可按 `exec.agent`
   * 所属档位改写。**不能**像延迟占位那样在 agent 作用域重注册同名 `skill`——宿主
   * tool-skill 用「`ctx.tools.get('skill', agent) === 它注册的定义`」判断技能工具是否可见,
   * 同名遮蔽会让技能目录整条不再发布(已发布过的还会被替换成空目录)。
   *
   * 判定与用户手势注入共用 `kit.visibleTexts`(deriveMessages;压缩后查不到 → 照常给全量)。
   * 拿不到历史、结果已是错误、别的插件已阻断或改写正文时一律不动,宁可重复。
   */
  const skillResultDedupe = (async (...args: never[]) => {
    const exec = args[0] as { name?: unknown; agent?: AgentLike } | undefined
    const result = args[1] as { isError?: unknown; content?: unknown } | undefined
    const next = args[2] as (() => Promise<unknown>) | undefined
    // 先取内层决策:别的插件可能已经阻断或改写这次结果,我们只在「接受且正文没被换掉」时介入。
    const decision = (typeof next === 'function' ? await next() : { kind: 'accept' }) as
      | { kind?: unknown; content?: unknown; value?: unknown }
      | undefined
    if (exec?.name !== SKILL_TOOL_NAME || !result || result.isError === true) return decision
    if (decision?.kind !== 'accept' || decision.value !== undefined) return decision
    const profile = profileOf(exec.agent as AgentLike)
    if ((profile as { dedupeSkillToolResults?: unknown } | null)?.dedupeSkillToolResults !== true) return decision
    try {
      const visible = kit.visibleTexts(exec.agent as AgentLike)
      const content = Array.isArray(decision.content) ? decision.content : result.content
      if (!visible || !Array.isArray(content)) return decision
      const duplicate = content.some((block) => {
        const item = block as { type?: unknown; text?: unknown } | null
        return item?.type === 'text' && typeof item.text === 'string' && visible.has(item.text)
      })
      return duplicate ? { ...decision, content: [{ type: 'text', text: SKILL_ALREADY_LOADED }] } : decision
    } catch (error) {
      // 判定失败退回内层决策:宁可重复,不改坏工具结果。
      note('skill tool dedupe', error)
      return decision
    }
  }) as unknown as (...args: never[]) => unknown

  // 全局注册 + 进入时按档位判定:子代理没有档位(profileOf 返回 null),自然不介入。
  // global:true 与 assemble 过滤器同一套理由——post-execute 按 exec.agent 作用域派发。
  ctx.on('tools/post-execute', skillResultDedupe, { global: true })

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
    // 来源隐藏时自动连带其配套段:工具/组隐藏 → tool:* 引导段(复合段走别名组),
    // MCP server 隐藏 → 该 server 的指令段(mcp:<server> / mcp:<server>:tools)。
    const hiddenGuides = new Set<string>()
    if (Array.isArray(result.sections)) {
      for (const entry of result.sections) {
        const name = String(entry?.name ?? '')
        if (name && hiddenCompanionSection(profile, name)) hiddenGuides.add(name)
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

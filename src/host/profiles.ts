import { CONTEXT_ORDER_FALLBACK, CONTEXT_ORDER_NAMES, DEFER, OFF, ON, PERSONA_ORDER_NAME, PERSONA_SECTION, PERSONA_SUFFIX_ORDER_NAME, PERSONA_SUFFIX_SECTION, type ContextProfile } from './constants.ts'
import type { StateStore } from './state-store.ts'
import type { SessionKit } from './sessions.ts'
import { effectiveState, placehold, serverOf, summaryFor, groupOf, type ToolDefinitionLike } from './tools.ts'
import type { AgentLike, HostContext, ToolDefinition } from '../types.ts'

/** 一次档位应用的计划:hidden(整体 deny)/ deferred(名→摘要)/ originals(名→完整定义)。 */
export interface ApplyPlan {
  hidden: string[]
  deferred: Map<string, string>
  originals: Map<string, ToolDefinitionLike>
}

export interface AppliedEntry {
  profileId: string
  plan: ApplyPlan
  agent: AgentLike
  /** 延迟占位的按名注册簿:未变化的工具必须沿用同一份注册,宿主的 step admission 按对象身份校验。 */
  deferred: Map<string, DeferredRegistration>
  /** hidden 面的整体 restrict 撤销器;restrict 只影响被 deny 的名字,不改变其它工具的注册身份。 */
  hiddenDispose: (() => void) | null
  dispose(): void
}

/** 一个延迟占位的注册记录;summary 与注册时写入的 description 绑定,增量重算以它为准。 */
interface DeferredRegistration {
  summary: string
  dispose: () => void
}

/** 档位应用运行时:计划计算、按 agent 应用/撤销、tool_search 注册与查询面。 */
export interface ProfileRuntime {
  profileById(id: string): ContextProfile | null
  planFor(profile: ContextProfile, definitions: ToolDefinitionLike[], extraNames?: Iterable<string>, previousOriginals?: Map<string, ToolDefinitionLike>): ApplyPlan
  applyTo(agent: AgentLike, profileId: string): ApplyPlan
  /** 工具表变化后的增量刷新:只动新增/消失的延迟工具与 hidden 面,未变化的保持原注册对象。 */
  refresh(agent: AgentLike): void
  release(agent: AgentLike): void
  planOf(agent: AgentLike): { profileId: string; plan: ApplyPlan } | null
  deferredFor(agent: AgentLike): Map<string, string>
  originalsFor(agent: AgentLike): Map<string, ToolDefinitionLike>
  /** 该 agent 已通过 tool_search 取回定义的工具名集合(快照与会话状态用)。 */
  loadedNamesOf(agent: AgentLike): Set<string>
  /** tool_search 工具定义(只在有延迟工具时由 syncToolSearch 注册)。 */
  searchTool: ToolDefinition<SearchResult>
  syncToolSearch(): void
  applied: Map<string, AppliedEntry>
  /** 正在执行 applyTo(重入守卫:tools/change 自己触发的变更不再回环处理)。 */
  readonly isApplying: boolean
  dispose(): void
}

interface SearchResult {
  matched: string[]
  definitions: string
  message: string
}

export function createProfileRuntime(ctx: HostContext, store: StateStore, kit: SessionKit, note: (source: string, error: unknown) => void): ProfileRuntime {
  const applied = new Map<string, AppliedEntry>()
  const loadedByAgent = new WeakMap<object, Set<string>>()
  let toolSearchDispose: (() => void) | null = null
  let applying = 0

  function profileById(id: string): ContextProfile | null {
    return store.state.profiles.find((profile) => profile.id === id) ?? null
  }

  function planFor(profile: ContextProfile, definitions: ToolDefinitionLike[], extraNames?: Iterable<string>, previousOriginals?: Map<string, ToolDefinitionLike>): ApplyPlan {
    const byName = new Map(definitions.map((definition) => [definition.name, definition]))
    const names = new Set<string>([...byName.keys()])
    if (extraNames) for (const name of extraNames) names.add(name)
    const hidden: string[] = []
    const deferred = new Map<string, string>()
    const originals = new Map<string, ToolDefinitionLike>()
    for (const name of names) {
      const stateOfTool = effectiveState(profile, name)
      if (stateOfTool === OFF) {
        hidden.push(name)
      } else if (stateOfTool === DEFER) {
        const definition = byName.get(name)
        deferred.set(name, summaryFor(profile, name, definition?.description))
        // 只记真实定义:extraNames 里被别的 restrict 挡掉的工具没有定义,
        // 塞一份空壳会污染后续 tool_search(之后真定义出现也不再被采纳)。
        const previous = previousOriginals?.get(name)
        if (previous) originals.set(name, previous)
        else if (definition) {
          originals.set(name, {
            name,
            description: definition.description ?? '',
            parameters: definition.parameters ?? { type: 'object', properties: {} },
          })
        }
      }
    }
    return { hidden, deferred, originals }
  }

  /**
   * 继承层(全局 + 预设父作用域)注册的工具名;拿不到工具视图时返回 null。
   *
   * `restrictableNames` 恰好只含继承层:注册在本作用域里的东西(延迟占位)不在其中。
   * 因此它还能回答「占位背后是否还有真实实现」——`definitionsOf` 里本作用域的影子会让
   * 该名字永远可见,看不出真实实现已经卸载。
   */
  function inheritedNames(agent: AgentLike): Set<string> | null {
    try {
      const view = ctx.tools.view(agent) as { restrictableNames?: Iterable<string> } | undefined
      if (!view || view.restrictableNames === undefined) return null
      return new Set(view.restrictableNames)
    } catch {
      return null
    }
  }

  function applyTo(agent: AgentLike, profileId: string): ApplyPlan {
    const sessionId = kit.sessionIdOf(agent)
    const previousOriginals = sessionId ? applied.get(sessionId)?.plan?.originals : undefined
    // 重入守卫必须先于 release:撤销注册会同步触发 tools/change,守卫之外会白排一次去抖重算。
    applying += 1
    try {
      release(agent, { quiet: true })
      const profile = profileId === 'none' ? null : profileById(profileId)
      const agentCtx = agent.ctx
      if (!agentCtx) throw new Error('agent 没有可用的 ctx')
      const definitions = kit.definitionsOf(agent)
      const extraNames = inheritedNames(agent) ?? undefined
      const byName = new Map(definitions.map((definition) => [definition.name, definition]))
      const plan = profile
        ? planFor(profile, definitions, extraNames, previousOriginals)
        : { hidden: [], deferred: new Map<string, string>(), originals: new Map<string, ToolDefinitionLike>() }
      const disposers: Array<() => void> = []
      const deferred = new Map<string, DeferredRegistration>()
      let hiddenDispose: (() => void) | null = null

      if (plan.hidden.length > 0) {
        hiddenDispose = agentCtx.tools.restrict({ deny: plan.hidden }) as () => void
      }

      // 延迟:在 agent 作用域重新注册一份瘦身定义,遮住继承来的完整定义。
      // tools 数组本身在整个会话里保持这套占位,加载只往历史里追加完整定义。
      for (const [toolName, summary] of plan.deferred) {
        const original = byName.get(toolName) ?? previousOriginals?.get(toolName)
        if (!original) continue
        try {
          deferred.set(toolName, {
            summary,
            dispose: agentCtx.tools.register({
              ...original,
              ...placehold(original, summary),
            }) as () => void,
          })
        } catch (error) {
          note(`defer:${toolName}`, error)
        }
      }

      if (profile) {
        // 人设两个固定槽位各自独立(prefix order 0 / suffix order 10200):
        // - enabled=false:该槽位注册空影子 = 不发送;
        // - enabled=true 且 override:用 text(空文本 = 不发送该槽位);
        // - enabled=true 且不覆盖:不注册,沿用部署的 personaPrefix / personaSuffix。
        const personaSlots = [
          { config: profile.prompt?.prefix, name: PERSONA_SECTION, orderName: PERSONA_ORDER_NAME },
          { config: profile.prompt?.suffix, name: PERSONA_SUFFIX_SECTION, orderName: PERSONA_SUFFIX_ORDER_NAME },
        ]
        for (const slot of personaSlots) {
          const config = slot.config
          if (!config) continue
          const enabled = config.enabled !== false
          if (enabled && !config.override) continue
          disposers.push(agentCtx.systemPrompt.section({
            name: slot.name,
            order: agentCtx.systemPrompt.getSectionOrder(slot.orderName),
            text: enabled ? config.text : '',
            interpolate: false,
          }) as () => void)
        }
        for (const [name, enabled] of Object.entries(profile.contexts ?? {})) {
          if (enabled !== false) continue
          // 每个被关掉的运行时上下文都在 agent 作用域注册同名非 required 空上下文:
          // required 段(当前工作目录)靠它遮住 required 标志,refreshContext 才不会补回;
          // 可选段靠它保证同样不被补回。真实文本由最外层 system-prompt/assemble 删除。
          try {
            const orderName = CONTEXT_ORDER_NAMES[name]
            const resolved = orderName && typeof agentCtx.systemPrompt.getContextOrder === 'function'
              ? agentCtx.systemPrompt.getContextOrder(orderName)
              : CONTEXT_ORDER_FALLBACK[name] ?? 0
            const order = typeof resolved === 'number' ? resolved : 0
            const dispose = agentCtx.systemPrompt.context({
              name,
              order,
              text: '',
              interpolate: false,
            })
            if (typeof dispose === 'function') disposers.push(dispose as () => void)
          } catch (error) {
            // 失败时保持注入(fail-open):多给一段,不要让装配直接坏掉。
            note(`context:${name}`, error)
          }
        }
      }

      const entry: AppliedEntry = {
        profileId,
        plan,
        agent,
        deferred,
        hiddenDispose,
        dispose: () => {
          for (const record of entry.deferred.values()) {
            try {
              record.dispose()
            } catch (error) {
              note('dispose:defer', error)
            }
          }
          entry.deferred.clear()
          if (entry.hiddenDispose) {
            try {
              entry.hiddenDispose()
            } catch (error) {
              note('dispose:restrict', error)
            }
            entry.hiddenDispose = null
          }
          for (const dispose of disposers.reverse()) {
            try {
              dispose()
            } catch (error) {
              note('dispose', error)
            }
          }
        },
      }
      applied.set(sessionId as string, entry)
      syncToolSearch()
      return plan
    } finally {
      applying -= 1
    }
  }

  /** 撤销该 agent 的全部档位注册;quiet 供内部重建使用,不抖动 tool_search 的根注册。 */
  function release(agent: AgentLike, options: { quiet?: boolean } = {}): void {
    const sessionId = kit.sessionIdOf(agent)
    const entry = sessionId ? applied.get(sessionId) : undefined
    if (!entry) return
    try {
      entry.dispose()
    } catch (error) {
      note('release', error)
    }
    applied.delete(sessionId as string)
    if (!options.quiet) syncToolSearch()
  }

  /**
   * 工具表变化后增量刷新延迟面与隐藏面:未变化的工具沿用原注册对象。
   *
   * 为什么不能整份 release→重注册:宿主的每个 step 有一份按「定义 + 注册」对象身份
   * 比对的准入集,执行时逐名复核当刻的工具表;整份重建会让该 step 内所有延迟工具
   * 立刻报 `unknown tool`(实测:governance 重载触发 tools/change,300ms 去抖落在
   * 下一步,模型按原 schema 调用 plugin_manager / cordis_inspect_query 全部失败,
   * 再下一步自愈)。工具表变化只影响新增/消失的名字,增量 diff 就够了。
   */
  function refresh(agent: AgentLike): void {
    const sessionId = kit.sessionIdOf(agent)
    const entry = sessionId ? applied.get(sessionId) : undefined
    if (!entry) return
    const agentCtx = agent.ctx
    if (!agentCtx) return
    const profile = entry.profileId === 'none' ? null : profileById(entry.profileId)
    if (!profile) return
    applying += 1
    try {
      const definitions = kit.definitionsOf(agent)
      const inherited = inheritedNames(agent)
      const byName = new Map(definitions.map((definition) => [definition.name, definition]))
      const plan = planFor(profile, definitions, inherited ?? undefined, entry.plan.originals)

      // 新增的延迟工具:此刻 definitions 里还是完整定义(尚未被自己的占位遮住)。
      for (const [toolName, summary] of plan.deferred) {
        if (entry.deferred.has(toolName)) continue
        const original = byName.get(toolName)
        if (!original) continue
        try {
          entry.deferred.set(toolName, {
            summary,
            dispose: agentCtx.tools.register({
              ...original,
              ...placehold(original, summary),
            }) as () => void,
          })
        } catch (error) {
          note(`defer:${toolName}`, error)
        }
      }
      // 消失的延迟工具(背后实现已卸载,或被隐藏):只撤它自己,别人的注册身份不动。
      // 判据不能只看 definitions:占位是注册在本作用域里的同名影子,会让该名字在
      // definitions 里一直可见;能证明「背后还有真实实现」的只有继承层名单。
      for (const [toolName, record] of [...entry.deferred]) {
        const backed = inherited === null || inherited.has(toolName)
        if (backed && plan.deferred.has(toolName)) continue
        entry.deferred.delete(toolName)
        plan.deferred.delete(toolName)
        if (!backed) plan.originals.delete(toolName)
        try {
          record.dispose()
        } catch (error) {
          note('defer dispose', error)
        }
      }
      // 摘要以注册簿为准:已延迟工具的 definitions 是占位描述,重算会把【延迟】再套一层。
      for (const [toolName, record] of entry.deferred) plan.deferred.set(toolName, record.summary)

      const sameHidden =
        plan.hidden.length === entry.plan.hidden.length && plan.hidden.every((name) => entry.plan.hidden.includes(name))
      if (!sameHidden) {
        if (entry.hiddenDispose) {
          try {
            entry.hiddenDispose()
          } catch (error) {
            note('restrict dispose', error)
          }
          entry.hiddenDispose = null
        }
        if (plan.hidden.length > 0) {
          try {
            entry.hiddenDispose = agentCtx.tools.restrict({ deny: plan.hidden }) as () => void
          } catch (error) {
            note('restrict', error)
          }
        }
      }
      entry.plan = plan
      syncToolSearch()
    } catch (error) {
      note('refresh', error)
    } finally {
      applying -= 1
    }
  }

  function planOf(agent: AgentLike): { profileId: string; plan: ApplyPlan } | null {
    const sessionId = kit.sessionIdOf(agent)
    const entry = sessionId ? applied.get(sessionId) : undefined
    if (entry) return entry
    const recorded = sessionId ? store.state.sessions[sessionId] : undefined
    if (!recorded) return null
    const profile = recorded === 'none' ? null : profileById(recorded)
    if (recorded !== 'none' && !profile) return null
    return {
      profileId: recorded,
      plan: profile
        ? planFor(profile, kit.definitionsOf(agent))
        : { hidden: [], deferred: new Map(), originals: new Map() },
    }
  }

  function deferredFor(agent: AgentLike): Map<string, string> {
    const entry = planOf(agent)
    if (!entry) return new Map()
    return entry.plan.deferred
  }

  function originalsFor(agent: AgentLike): Map<string, ToolDefinitionLike> {
    const entry = planOf(agent)
    return entry?.plan?.originals ?? new Map()
  }

  function loadedFor(agent: AgentLike): Set<string> {
    let set = loadedByAgent.get(agent as object)
    if (!set) {
      set = new Set()
      loadedByAgent.set(agent as object, set)
    }
    return set
  }

  function loadedNamesOf(agent: AgentLike): Set<string> {
    return loadedByAgent.get(agent as object) ?? new Set()
  }

  function syncToolSearch(): void {
    let wanted = false
    for (const entry of applied.values()) if (entry.plan.deferred.size > 0) wanted = true
    if (wanted && toolSearchDispose === null) {
      toolSearchDispose = ctx.tools.register(searchTool)
    } else if (!wanted && toolSearchDispose !== null) {
      toolSearchDispose()
      toolSearchDispose = null
    }
  }

  const searchTool: ToolDefinition<SearchResult> = {
    name: 'tool_search',
    description:
      '取回被延迟加载的工具定义。工具表里名称一直在，但参数只给了骨架；用这个工具按组名、server 名、工具名或几个关键词取回完整定义，取回后按完整参数调用即可。不执行任何工具。',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        query: { type: 'string', description: '组名、server 名、工具名，或几个描述能力的关键词' },
      },
      required: ['query'],
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          matched: { type: 'array', items: { type: 'string' } },
          definitions: { type: 'string' },
          message: { type: 'string' },
        },
        required: ['matched', 'definitions', 'message'],
      },
      render: (_args, value) => [{ type: 'text', text: value.definitions || value.message }],
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const agent = exec?.agent
      if (!agent) throw new Error('tool_search 需要一个会话')
      const deferred = deferredFor(agent)
      if (deferred.size === 0) {
        return { matched: [], definitions: '', message: '当前没有延迟加载的工具。' }
      }
      const query = String(args?.query ?? '').trim()
      const terms = query.toLowerCase().split(/[\s,，、]+/).filter(Boolean)
      const names = [...deferred.keys()]
      let matched = names
      if (query && !/^(all|\*|全部)$/i.test(query)) {
        const exact = names.filter((toolName) => toolName.toLowerCase() === query.toLowerCase())
        if (exact.length > 0) matched = exact
        else {
          const groups = new Set<string>()
          for (const toolName of names) {
            const server = serverOf(toolName)
            const group = groupOf(toolName)
            if (server && server.toLowerCase().includes(query.toLowerCase())) groups.add(server)
            if (group.toLowerCase() === query.toLowerCase()) groups.add(group)
          }
          matched = names.filter((toolName) => {
            const haystack = `${toolName} ${deferred.get(toolName) ?? ''}`.toLowerCase()
            if (terms.some((term) => haystack.includes(term))) return true
            const server = serverOf(toolName)
            return server ? groups.has(server) || groups.has(groupOf(toolName)) : groups.has(groupOf(toolName))
          })
        }
      }
      if (matched.length === 0) {
        return {
          matched: [],
          definitions: '',
          message: `没有命中「${query}」。当前延迟的工具：${names.join(', ')}。`,
        }
      }
      const originals = originalsFor(agent)
      const loaded = loadedFor(agent)
      for (const name of matched) loaded.add(name)
      const definitions = matched.map((name) => {
        const original = originals.get(name)
        if (!original) return { name, description: deferred.get(name) ?? '', parameters: {} }
        return { name, description: original.description, parameters: original.parameters }
      })
      return {
        matched,
        definitions: JSON.stringify(definitions, null, 2),
        message: `已取回 ${matched.length} 个工具的完整定义。`,
      }
    },
  }

  function dispose(): void {
    if (toolSearchDispose) {
      toolSearchDispose()
      toolSearchDispose = null
    }
    for (const entry of applied.values()) {
      try {
        entry.dispose()
      } catch (error) {
        note('teardown', error)
      }
    }
    applied.clear()
  }

  return {
    profileById,
    planFor,
    applyTo,
    refresh,
    release,
    planOf,
    deferredFor,
    originalsFor,
    loadedNamesOf,
    searchTool,
    syncToolSearch,
    applied,
    get isApplying() {
      return applying > 0
    },
    dispose,
  }
}

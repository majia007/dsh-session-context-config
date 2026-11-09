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
  dispose(): void
}

/** 档位应用运行时:计划计算、按 agent 应用/撤销、tool_search 注册与查询面。 */
export interface ProfileRuntime {
  profileById(id: string): ContextProfile | null
  planFor(profile: ContextProfile, definitions: ToolDefinitionLike[], extraNames?: Iterable<string>, previousOriginals?: Map<string, ToolDefinitionLike>): ApplyPlan
  applyTo(agent: AgentLike, profileId: string): ApplyPlan
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
        const previous = previousOriginals?.get(name)
        originals.set(
          name,
          previous ?? {
            name,
            description: definition?.description ?? '',
            parameters: definition?.parameters ?? { type: 'object', properties: {} },
          },
        )
      }
    }
    return { hidden, deferred, originals }
  }

  function applyTo(agent: AgentLike, profileId: string): ApplyPlan {
    const sessionId = kit.sessionIdOf(agent)
    const previousOriginals = sessionId ? applied.get(sessionId)?.plan?.originals : undefined
    release(agent)
    applying += 1
    try {
      const profile = profileId === 'none' ? null : profileById(profileId)
      const agentCtx = agent.ctx
      if (!agentCtx) throw new Error('agent 没有可用的 ctx')
      const definitions = kit.definitionsOf(agent)
      const extraNames = (() => {
        try {
          return [...((ctx.tools.view(agent) as { restrictableNames?: string[] } | undefined)?.restrictableNames ?? [])]
        } catch {
          return []
        }
      })()
      const byName = new Map(definitions.map((definition) => [definition.name, definition]))
      const plan = profile
        ? planFor(profile, definitions, extraNames, previousOriginals)
        : { hidden: [], deferred: new Map<string, string>(), originals: new Map<string, ToolDefinitionLike>() }
      const disposers: Array<() => void> = []

      if (plan.hidden.length > 0) {
        disposers.push(agentCtx.tools.restrict({ deny: plan.hidden }) as () => void)
      }

      // 延迟:在 agent 作用域重新注册一份瘦身定义,遮住继承来的完整定义。
      // tools 数组本身在整个会话里保持这套占位,加载只往历史里追加完整定义。
      for (const [toolName, summary] of plan.deferred) {
        const original = byName.get(toolName) ?? previousOriginals?.get(toolName)
        if (!original) continue
        try {
          disposers.push(agentCtx.tools.register({
            ...original,
            ...placehold(original, summary),
          }) as () => void)
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

      applied.set(sessionId as string, {
        profileId,
        plan,
        agent,
        dispose: () => {
          for (const dispose of disposers.reverse()) {
            try {
              dispose()
            } catch (error) {
              note('dispose', error)
            }
          }
        },
      })
      syncToolSearch()
      return plan
    } finally {
      applying -= 1
    }
  }

  function release(agent: AgentLike): void {
    const sessionId = kit.sessionIdOf(agent)
    const entry = sessionId ? applied.get(sessionId) : undefined
    if (!entry) return
    try {
      entry.dispose()
    } catch (error) {
      note('release', error)
    }
    applied.delete(sessionId as string)
    syncToolSearch()
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

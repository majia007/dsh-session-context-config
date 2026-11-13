import { CHANNELS, DEFAULT_PROFILES, DEFER, OFF, ON, VERSION, type ContextProfile } from './constants.ts'
import { createCatalog } from './catalog.ts'
import { collectInjected, type InjectedChannel, type InjectedMessages } from './injected.ts'
import { effectiveState, groupOf, serverOf } from './tools.ts'
import { messageOf, normalizeState, recordSession, statePath, type PluginState } from './state.ts'
import type { StateStore } from './state-store.ts'
import type { ProfileRuntime } from './profiles.ts'
import type { SessionKit } from './sessions.ts'
import type { SourceIndex } from './sources.ts'
import type { TranslationRuntime } from './translations.ts'
import type { AgentLike, HostContext, HttpRequest, HttpResponse, RouteHandler } from '../types.ts'

const PACKAGE_NAME = '@jia-tools/dsh-session-context-config'
const ROUTE_STATE = '/session-context-config/api/state'
const ROUTE_SESSION = '/session-context-config/api/session'
const ROUTE_PREVIEW = '/session-context-config/api/preview'
const ROUTE_ASSEMBLE = '/session-context-config/api/assemble'
const ROUTE_TRANSLATE = '/session-context-config/api/translate'

/** 五条 HTTP 路由 + 快照/预览(面板与 chip 的全部数据源)。 */
export interface RoutesRuntime {
  snapshot(): Promise<Record<string, unknown>>
  previewFor(agent: AgentLike, profileId: string): Record<string, unknown>
  handleState: RouteHandler
  handleSession: RouteHandler
  handlePreview: RouteHandler
  handleAssemble: RouteHandler
  handleTranslate: RouteHandler
}

interface RoutesDeps {
  ctx: HostContext
  store: StateStore
  kit: SessionKit
  profiles: ProfileRuntime
  sources: SourceIndex
  translations: TranslationRuntime
  injected: InjectedMessages
  note: (source: string, error: unknown) => void
  diagnostics: unknown[]
}

/** 面板展示的段/上下文正文;chars 用于排序与体量标签,text 用于 title 全文。 */
interface PromptEntryView {
  name: string
  chars: number
  text: string
}

/** 已知通道的最新一条注入消息(供对应卡片 tooltip),其余 kind 进只读清单。 */
interface ChannelPreview {
  text: string
  chars: number
  truncated: boolean
}

interface PromptCatalog {
  sections: PromptEntryView[]
  contexts: PromptEntryView[]
  /** 按档位分组:面板只展示当前选中档位自己的会话消息,不混并行会话。 */
  channelsByProfile: Record<string, Record<string, ChannelPreview>>
  observedChannelsByProfile: Record<string, InjectedChannel[]>
}

function readBody(request: HttpRequest): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    request.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > 1_000_000) {
        reject(new Error('body too large'))
        request.destroy()
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    request.on('error', reject)
  })
}

function sendJson(response: HttpResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value)
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  })
  response.end(body)
}

/**
 * 回退校验(宿主没有 connection 服务时):只认回环 Host。IPv6 的 Host 是
 * “[[::1]]:port” 形态,剥端口要先找 ']',直接 split(':') 会切出 '['。
 */
function loopbackOnly(request: HttpRequest): boolean {
  const raw = String(request.headers.host ?? '').toLowerCase()
  const host = raw.startsWith('[') ? raw.slice(0, raw.indexOf(']') + 1) : raw.split(':')[0]
  return !raw || ['127.0.0.1', 'localhost', '[::1]', '::1'].includes(host)
}

export function createRoutes(deps: RoutesDeps): RoutesRuntime {
  const { ctx, store, kit, profiles, sources, translations, injected, note, diagnostics } = deps
  const catalog = createCatalog(ctx, note, sources)

  /**
   * 信任栅栏:宿主 webServer 对直接 register 的路由不做任何认证,官方做法是
   * 借 connection 服务的 Host/Origin/浏览器会话检查(open-in-app 同款)。拿得到
   * 就完全以它为准(它也放行受信的非回环 Host,如 dsh web --host 局域网场景),
   * 拿不到才退回 loopbackOnly。
   */
  function guard(request: HttpRequest, response: HttpResponse): boolean {
    // connection 不在 inject 名单里,不能按属性取:Cordis 对未声明服务的属性访问会直接抛
    // `cannot get property "connection" without inject`;ctx.get 在缺失时返回 undefined。
    let fence: { requestRejection?: (request: HttpRequest) => number | undefined } | undefined
    try {
      fence = ctx.get('connection') as typeof fence
    } catch (error) {
      note('connection', error)
      fence = undefined
    }
    if (typeof fence?.requestRejection === 'function') {
      const rejection = fence.requestRejection(request)
      if (rejection !== undefined) {
        sendJson(response, rejection, { ok: false, error: 'rejected' })
        return false
      }
      return true
    }
    if (!loopbackOnly(request)) {
      sendJson(response, 403, { ok: false, error: 'loopback only' })
      return false
    }
    return true
  }

  /** 该根会话当前生效的 preset 名;拿不到返回 null(目录去重与 live 列表共用)。 */
  function presetOf(agent: AgentLike): string | null {
    const session = kit.sessionOf(agent)
    if (!session) return null
    try {
      return (ctx.get('agentPresets') as { presetForSession?: (session: unknown) => string | null } | undefined)?.presetForSession?.(session) ?? null
    } catch {
      return null
    }
  }

  /** 档位里关掉的上下文/段数量;目录优先挑限制最少的会话,让影子不要遮住正文。 */
  function disabledCount(agent: AgentLike): number {
    const sessionId = kit.sessionIdOf(agent)
    const profileId = (sessionId ? profiles.applied.get(sessionId)?.profileId : undefined)
      ?? (sessionId ? store.state.sessions[sessionId] : undefined)
      ?? 'none'
    const profile = profileId === 'none' ? null : profiles.profileById?.(profileId) ?? null
    if (!profile) return 0
    return Object.values(profile.contexts ?? {}).filter((value) => value === false).length
      + Object.values(profile.sections ?? {}).filter((value) => value === false).length
  }

  /** 把段/上下文模板按装配变量渲染成最终正文;只用于面板展示,不改请求路径。 */
  function renderText(entry: { text?: unknown; interpolate?: unknown }, variables: Record<string, string | undefined>): string {
    const text = String(entry.text ?? '')
    if (entry.interpolate === false) return text
    return text.replace(/\{\{([a-z][a-z0-9_]*)\}\}/g, (whole: string, name: string) => {
      const value = variables[name]
      return typeof value === 'string' ? value : whole
    })
  }

  /** 根会话实际归属的档位;applied 优先(切档位后立即生效),再回落会话记录。 */
  function profileIdOfAgent(agent: AgentLike): string {
    const sessionId = kit.sessionIdOf(agent)
    const applied = sessionId ? profiles.applied.get(sessionId)?.profileId : undefined
    const recorded = sessionId ? store.state.sessions[sessionId] : undefined
    return applied ?? recorded ?? 'none'
  }

  /**
   * 同一档位下的 live 根会话历史 + 本进程该档位的观察消息。
   * 历史是持久真相:同 kind 的次数跨会话相加、正文取最长的一条;只有被通道开关
   * 过滤掉、历史里没有的 kind 才用进程观察补上。反复读快照不会把计数叠加。
   */
  function observedChannels(agents: AgentLike[], profileId: string): InjectedChannel[] {
    const merged = new Map<string, InjectedChannel>()
    for (const agent of agents) {
      const session = kit.sessionOf(agent) as { deriveMessages?: () => unknown } | null
      if (!session || typeof session.deriveMessages !== 'function') continue
      try {
        for (const entry of collectInjected(session.deriveMessages())) {
          const previous = merged.get(entry.kind)
          if (!previous) {
            merged.set(entry.kind, entry)
            continue
          }
          merged.set(entry.kind, {
            kind: entry.kind,
            count: previous.count + entry.count,
            chars: Math.max(previous.chars, entry.chars),
            text: entry.chars >= previous.chars ? entry.text : previous.text,
            truncated: previous.truncated || entry.truncated,
          })
        }
      } catch (error) {
        note('deriveMessages', error)
      }
    }
    for (const entry of injected.list(profileId)) {
      if (!merged.has(entry.kind)) merged.set(entry.kind, entry)
    }
    return [...merged.values()].sort((left, right) => left.kind.localeCompare(right.kind))
  }

  /**
   * 面板目录:对每个 live 根会话干跑一次装配,按 name 合并段与上下文(空文本被
   * 非空文本覆盖),再按 `source.kind` 汇总注入消息。自动发现只依赖宿主注册面,
   * 不维护插件名单——新版本/第三方插件新增的段、上下文或消息会直接出现在面板里。
   *
   * 为什么要遍历所有根会话:不同 agent preset 组合出不同的插件集合,单个会话只能
   * 看见自己那份;同一段在某个档位被影子遮成空串时,另一个档位可能仍有正文。
   */
  async function promptCatalog(): Promise<PromptCatalog> {
    const roots = ctx.agents.list().filter((candidate) => kit.isRootAgent(candidate))
    if (roots.length === 0) return { sections: [], contexts: [], channelsByProfile: {}, observedChannelsByProfile: {} }
    // 目录只需要「每种 preset 一份」:同一 preset 的插件集合相同,多开会话只是重复装配。
    // 选限制最少的那个会话,尽量让被别的档位影子成空串的段/上下文拿到真实正文。
    // 上限 8 份,避免用户开着几十个会话时每次打开面板都跑几十次装配。
    const limited = roots
      .map((agent) => ({ agent, disabled: disabledCount(agent), preset: presetOf(agent) ?? `session:${kit.sessionIdOf(agent) ?? ''}` }))
      .sort((left, right) => left.disabled - right.disabled)
    const agents: AgentLike[] = []
    const presets = new Set<string>()
    for (const entry of limited) {
      if (presets.has(entry.preset)) continue
      presets.add(entry.preset)
      agents.push(entry.agent)
      if (agents.length >= 8) break
    }
    const sections = new Map<string, PromptEntryView>()
    const contexts = new Map<string, PromptEntryView>()
    for (const agent of agents) {
      try {
        const assembly = await ctx.systemPrompt.assemble({ agent, scope: agent, sccFullSections: true }) as {
          sections?: unknown[]
          contexts?: unknown[]
          variables?: Record<string, string | undefined>
        }
        const variables = assembly.variables ?? {}
        const merge = (target: Map<string, PromptEntryView>, entries: unknown[] | undefined): void => {
          for (const entry of entries ?? []) {
            const record = entry as { name?: unknown; text?: unknown; interpolate?: unknown }
            const name = String(record.name ?? '')
            if (!name) continue
            const text = renderText(record, variables)
            const view = { name, chars: text.length, text }
            const previous = target.get(name)
            // 先出现的顺序优先;但空影子(关掉的上下文/人设)不能把另一档位的正文挤掉。
            if (!previous || (previous.chars === 0 && view.chars > 0)) target.set(name, view)
          }
        }
        merge(sections, assembly.sections)
        merge(contexts, assembly.contexts)
      } catch (error) {
        note(`prompt catalog:${kit.sessionIdOf(agent) ?? 'unknown'}`, error)
      }
    }
    // 段过滤空文本(没内容就没有行);tool:* 不列:它强绑定工具状态,由 Host 自动
    // 跟随,面板不提供单独开关。上下文保留空文本:被关掉的影子与条件上下文仍要
    // 占据行位,客户端据 chars/开关显示「已关闭 / 当前未出现」。
    const sectionRows = [...sections.values()]
      .filter((entry) => entry.chars > 0 && !entry.name.startsWith('tool:'))
    const contextRows = [...contexts.values()]
    // 消息按档位分组:每个档位只看使用它的会话。段的并集仍跨 preset(两者目的不同)。
    const groups = new Map<string, AgentLike[]>()
    for (const agent of roots) {
      const profileId = profileIdOfAgent(agent)
      const group = groups.get(profileId)
      if (group) group.push(agent)
      else groups.set(profileId, [agent])
    }
    const observedChannelsByProfile: Record<string, InjectedChannel[]> = {}
    const channelsByProfile: Record<string, Record<string, ChannelPreview>> = {}
    for (const [profileId, group] of groups) {
      const observed = observedChannels(group, profileId)
      observedChannelsByProfile[profileId] = observed
      const channels: Record<string, ChannelPreview> = {}
      for (const channel of CHANNELS) {
        const entry = observed.find((item) => item.kind === channel.source)
        if (entry) channels[channel.id] = { text: entry.text, chars: entry.chars, truncated: entry.truncated }
      }
      channelsByProfile[profileId] = channels
    }
    return { sections: sectionRows, contexts: contextRows, channelsByProfile, observedChannelsByProfile }
  }

  async function snapshot(): Promise<Record<string, unknown>> {
    const [catalogValue, prompt] = await Promise.all([catalog.buildCatalog(), promptCatalog()])
    const state = store.state
    const live = []
    for (const agent of ctx.agents.list()) {
      if (!kit.isRootAgent(agent)) continue
      const sessionId = kit.sessionIdOf(agent)
      const entry = sessionId ? profiles.applied.get(sessionId) : undefined
      const preset = presetOf(agent)
      live.push({
        sessionId,
        preset,
        blank: kit.isBlank(agent),
        profileId: entry?.profileId ?? (sessionId ? state.sessions[sessionId] : undefined) ?? null,
        deferred: entry?.plan?.deferred?.size ?? 0,
        hidden: entry?.plan?.hidden?.length ?? 0,
        loaded: profiles.loadedNamesOf(agent).size,
      })
    }
    return {
      ok: true,
      version: VERSION,
      profiles: state.profiles,
      // 插件内置预设只作「新建档位」模板,不是已安装 state 的来源;面板悬停下拉
      // 直接读这份当前插件版本的值,选中后复制成 custom-*。
      defaults: DEFAULT_PROFILES,
      lastUsedId: state.lastUsedId,
      sessions: state.sessions,
      baseline: state.baseline,
      presets: catalogValue.presets,
      defaultPreset: catalogValue.defaultPreset,
      tools: catalogValue.tools,
      groups: catalogValue.groups,
      sections: prompt.sections,
      contexts: prompt.contexts,
      channelsByProfile: prompt.channelsByProfile,
      observedChannelsByProfile: prompt.observedChannelsByProfile,
      live,
      sources: sources.report(),
      diagnostics: diagnostics.slice(0, 8),
      statePath: statePath(),
      clientBundle: (() => {
        try {
          return (ctx.get('clientModules') as { clientPath?: (name: string) => string | null } | undefined)?.clientPath?.(PACKAGE_NAME) ?? null
        } catch {
          return null
        }
      })(),
    }
  }

  function previewFor(agent: AgentLike, profileId: string): Record<string, unknown> {
    const profile = profileId === 'none' ? null : profiles.profileById(profileId)
    const schemas = kit.visibleSchemas(agent)
    if (!profile) {
      return {
        ok: true,
        profileId: 'none',
        total: schemas.length,
        hidden: [],
        deferred: [],
        visible: schemas.map((schema) => schema.name),
      }
    }
    const hidden: string[] = []
    const deferred: string[] = []
    const visible: string[] = []
    for (const schema of schemas) {
      const stateOfTool = effectiveState(profile as ContextProfile, schema.name)
      if (stateOfTool === OFF) hidden.push(schema.name)
      else if (stateOfTool === DEFER) deferred.push(schema.name)
      else visible.push(schema.name)
    }
    return { ok: true, profileId, total: schemas.length, hidden, deferred, visible }
  }

  const handleState: RouteHandler = async (request, response) => {
    try {
      if (!guard(request, response)) return
      if (request.method === 'GET') return sendJson(response, 200, await snapshot())
      if (request.method !== 'POST') return sendJson(response, 405, { ok: false, error: 'method not allowed' })
      // POST 只收 application/json(照官方 open-in-app):掐掉 text/plain 简单
      // 请求形式的跨站提交,与 guard 的信任栅栏构成双保险。
      const essence = String(request.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase()
      if (essence !== 'application/json') {
        return sendJson(response, 415, { ok: false, error: 'content-type must be application/json' })
      }
      const parsed = JSON.parse(await readBody(request)) as Partial<PluginState>
      store.state = normalizeState({ ...store.state, ...parsed, version: VERSION })
      store.persistNow()
      for (const agent of ctx.agents.list()) {
        if (!kit.isRootAgent(agent) || !kit.isBlank(agent)) continue
        const sessionId = kit.sessionIdOf(agent)
        if (!sessionId) continue
        const recorded = store.state.sessions[sessionId] ?? store.state.lastUsedId
        profiles.applyTo(agent, recorded)
        recordSession(store.state, sessionId, recorded)
      }
      catalog.invalidate()
      sendJson(response, 200, { ok: true, snapshot: await snapshot() })
    } catch (error) {
      sendJson(response, 400, { ok: false, error: messageOf(error) })
    }
  }

  const handleSession: RouteHandler = async (request, response) => {
    try {
      if (!guard(request, response)) return
      if (request.method === 'GET') {
        const url = new URL(request.url ?? '/', 'http://localhost')
        const sessionId = url.searchParams.get('id') ?? ''
        const agent = kit.agentFor(sessionId)
        if (!agent) return sendJson(response, 404, { ok: false, error: 'session not live' })
        const recorded = store.state.sessions[sessionId] ?? store.state.lastUsedId
        const entry = profiles.applied.get(sessionId)
        const deferred = entry?.plan?.deferred ?? new Map()
        const hidden = new Set(entry?.plan?.hidden ?? [])
        const loaded = profiles.loadedNamesOf(agent)
        const tools = kit.visibleSchemas(agent).map((schema) => ({
          name: schema.name,
          group: groupOf(schema.name),
          server: serverOf(schema.name),
          state: hidden.has(schema.name) ? OFF : deferred.has(schema.name) ? DEFER : ON,
          loaded: loaded.has(schema.name),
        }))
        return sendJson(response, 200, {
          ok: true,
          sessionId,
          profileId: recorded,
          blank: kit.isBlank(agent),
          tools,
        })
      }
      if (request.method !== 'POST') return sendJson(response, 405, { ok: false, error: 'method not allowed' })
      // POST 只收 application/json(照官方 open-in-app):掐掉 text/plain 简单
      // 请求形式的跨站提交,与 guard 的信任栅栏构成双保险。
      const essence = String(request.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase()
      if (essence !== 'application/json') {
        return sendJson(response, 415, { ok: false, error: 'content-type must be application/json' })
      }
      const parsed = JSON.parse(await readBody(request)) as { sessionId?: unknown; profileId?: unknown }
      const sessionId = String(parsed.sessionId ?? '')
      const profileId = parsed.profileId === 'none' ? 'none' : String(parsed.profileId ?? '')
      if (!sessionId) return sendJson(response, 400, { ok: false, error: 'sessionId required' })
      if (profileId !== 'none' && !profiles.profileById(profileId)) {
        return sendJson(response, 400, { ok: false, error: 'unknown profile' })
      }
      recordSession(store.state, sessionId, profileId)
      store.state.lastUsedId = profileId
      store.persistSoon()
      const agent = kit.agentFor(sessionId)
      if (agent) profiles.applyTo(agent, profileId)
      sendJson(response, 200, { ok: true, snapshot: await snapshot() })
    } catch (error) {
      sendJson(response, 400, { ok: false, error: messageOf(error) })
    }
  }

  const handlePreview: RouteHandler = async (request, response) => {
    try {
      if (!guard(request, response)) return
      const url = new URL(request.url ?? '/', 'http://localhost')
      const sessionId = url.searchParams.get('id') ?? ''
      const profileId = url.searchParams.get('profile') ?? ''
      const agent = sessionId ? kit.agentFor(sessionId) : ctx.agents.list().find(kit.isRootAgent) ?? null
      if (!agent) return sendJson(response, 404, { ok: false, error: 'no live agent' })
      sendJson(response, 200, previewFor(agent, profileId))
    } catch (error) {
      sendJson(response, 400, { ok: false, error: messageOf(error) })
    }
  }

  /** 干跑一次装配,确认占位真的进入了模型看到的 schema。 */
  const handleAssemble: RouteHandler = async (request, response) => {
    try {
      if (!guard(request, response)) return
      const url = new URL(request.url ?? '/', 'http://localhost')
      const sessionId = url.searchParams.get('id') ?? ''
      const agent = sessionId ? kit.agentFor(sessionId) : ctx.agents.list().find(kit.isRootAgent) ?? null
      if (!agent) return sendJson(response, 404, { ok: false, error: 'no live agent' })
      const assembly = await ctx.systemPrompt.assemble({ agent, scope: agent })
      const variables = (assembly as { variables?: Record<string, string | undefined> }).variables ?? {}
      const tools = (assembly.tools ?? []) as Array<{ name: string; description: string; parameters: unknown }>
      // 段/上下文的名单、体量与正文:面板与验收都靠它确认基线段真的进了装配,而不是
      // 只写在状态里。text 与 /api/state 的目录同源(同一份变量渲染)。
      const sections = ((assembly.sections ?? []) as Array<{ name?: unknown; text?: unknown; interpolate?: unknown }>).map((section) => {
        const text = renderText(section, variables)
        return { name: section.name, chars: text.length, text }
      })
      const contexts = ((assembly.contexts ?? []) as Array<{ name?: unknown; text?: unknown; interpolate?: unknown }>).map((contextEntry) => {
        const text = renderText(contextEntry, variables)
        return { name: contextEntry.name, chars: text.length, text }
      })
      // 请求准入会走 refreshContext;required 上下文被删后会不会补回来,只能在这里复核。
      const refreshed = typeof ctx.systemPrompt.refreshContext === 'function'
        ? ctx.systemPrompt.refreshContext(assembly, { agent, scope: agent })
        : null
      const refreshedContexts = ((refreshed?.contexts ?? []) as Array<{ name?: unknown; text?: unknown; interpolate?: unknown }>).map((contextEntry) => {
        const text = renderText(contextEntry, variables)
        return { name: contextEntry.name, chars: text.length, text }
      })
      const deferred = profiles.planOf(agent)?.plan?.deferred ?? new Map()
      const sample = tools
        .filter((tool) => deferred.has(tool.name))
        .slice(0, 2)
        .map((tool) => ({
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
          chars: JSON.stringify(tool).length,
        }))
      const entry = profiles.planOf(agent)
      const deferredMap = entry?.plan?.deferred ?? new Map()
      const originalChars = [...(entry?.plan?.originals?.values() ?? [])]
        .reduce((sum, original) => sum + JSON.stringify(original).length, 0)
      const placeholderChars = tools
        .filter((tool) => deferredMap.has(tool.name))
        .reduce((sum, tool) => sum + JSON.stringify(tool).length, 0)
      sendJson(response, 200, {
        ok: true,
        count: tools.length,
        deferred: deferred.size,
        totals: { original: originalChars, placeholder: placeholderChars },
        sections,
        contexts,
        refreshedContexts,
        sample,
      })
    } catch (error) {
      sendJson(response, 400, { ok: false, error: messageOf(error) })
    }
  }

  /** 按需翻译一段工具描述(仅面板显示用)。命中缓存立即返回;没配默认模型时 ok:false。 */
  const handleTranslate: RouteHandler = async (request, response) => {
    try {
      if (!guard(request, response)) return
      if (request.method !== 'POST') return sendJson(response, 405, { ok: false, error: 'method not allowed' })
      const essence = String(request.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase()
      if (essence !== 'application/json') {
        return sendJson(response, 415, { ok: false, error: 'content-type must be application/json' })
      }
      const parsed = JSON.parse(await readBody(request)) as { text?: unknown }
      const text = typeof parsed.text === 'string' ? parsed.text : ''
      if (!text.trim()) return sendJson(response, 400, { ok: false, error: 'text required' })
      const cached = translations.lookup(text)
      if (cached !== null) return sendJson(response, 200, { ok: true, zh: cached, cached: true })
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 30000)
      try {
        const zh = await translations.translate(text, controller.signal)
        sendJson(response, 200, { ok: true, zh, cached: false })
      } finally {
        clearTimeout(timer)
      }
    } catch (error) {
      sendJson(response, 200, { ok: false, error: messageOf(error) })
    }
  }

  return { snapshot, previewFor, handleState, handleSession, handlePreview, handleAssemble, handleTranslate }
}

export const ROUTES = { STATE: ROUTE_STATE, SESSION: ROUTE_SESSION, PREVIEW: ROUTE_PREVIEW, ASSEMBLE: ROUTE_ASSEMBLE, TRANSLATE: ROUTE_TRANSLATE } as const

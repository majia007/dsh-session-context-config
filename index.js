/**
 * 上下文档位 · Host（v0.2）
 *
 * 模型：档位持有一份「组 / server / 工具」三级状态表，应用时解析成每个工具的三态：
 *   注入(on) / 延迟(defer) / 隐藏(off)
 *
 * - 隐藏：`agent.ctx.tools.restrict({ deny })`，不发 schema、也调不到。
 * - 延迟：不删除工具，只在系统提示装配时把它的 description 换成一句功能摘要、
 *   parameters 剥成骨架；完整定义由 `tool_search` 以工具结果的形式追加进历史。
 *   tools 数组在整个会话里保持不变，因此前缀缓存不会被加载动作打断。
 *
 * 只作用于根会话；已开始的会话只有在用户确认切换档位时才会重算。
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  BASELINE_DEFAULTS,
  baselineSections,
  composeCompletePrompt,
  ENVIRONMENT_CONTEXT_NAME,
  ENVIRONMENT_CONTEXT_ORDER,
  environmentFactsText,
  normalizeBaseline,
  probeEnvironment,
} from './baseline.js'

import {
  CHANNELS,
  DEFER,
  GROUPS,
  OFF,
  ON,
  TOKEN_PER_CHAR,
  VERSION,
} from './host/constants.js'
import { defaultState, legacyStatePath, messageOf, normalizeState, statePath } from './host/state.js'
import { effectiveState, groupOf, placehold, serverOf, summaryFor } from './host/tools.js'

export const name = 'session-context-config'
export const inject = ['agents', 'tools', 'systemPrompt']

const PACKAGE_NAME = 'dsh-session-context-config'
const ROUTE_STATE = '/session-context-config/api/state'
const ROUTE_SESSION = '/session-context-config/api/session'
const ROUTE_PREVIEW = '/session-context-config/api/preview'
const ROUTE_ASSEMBLE = '/session-context-config/api/assemble'
const PERSONA_SECTION = 'deployment:persona-prefix'
const PERSONA_ORDER_NAME = 'DEPLOYMENT_PERSONA_PREFIX'

/* ── 插件 ──────────────────────────────────────────────────── */

export function apply(ctx) {
  let state = defaultState()
  let writeTimer = null
  const applied = new Map()
  const loadedByAgent = new WeakMap()
  const diagnostics = []
  let catalogCache = null
  let toolSearchDispose = null
  let applying = 0
  const envApplied = new Map()

  function note(source, error) {
    diagnostics.unshift({ at: new Date().toISOString(), source, message: messageOf(error) })
    diagnostics.length = Math.min(diagnostics.length, 20)
    console.warn(`[session-context-config] ${source}: ${messageOf(error)}`)
  }

  function profileById(id) {
    return state.profiles.find((profile) => profile.id === id) ?? null
  }

  function load() {
    try {
      state = normalizeState(JSON.parse(readFileSync(statePath(), 'utf8')))
      return
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        note('load', error)
        state = defaultState()
        return
      }
    }
    state = migrateLegacyState()
  }

  /**
   * 首次启动把旧文件名搬过来：先落新文件、再挪走旧文件。
   * 顺序保证中途失败最坏只是留下旧文件，已有档位不会丢。
   */
  function migrateLegacyState() {
    const legacy = legacyStatePath()
    try {
      const migrated = normalizeState(JSON.parse(readFileSync(legacy, 'utf8')))
      const path = statePath()
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, JSON.stringify(migrated, null, 2), 'utf8')
      try {
        renameSync(legacy, `${legacy}.migrated`)
      } catch (error) {
        note('migrate rename', error)
      }
      return migrated
    } catch (error) {
      if (error?.code !== 'ENOENT') note('migrate', error)
      return defaultState()
    }
  }

  function persistNow() {
    try {
      const path = statePath()
      mkdirSync(dirname(path), { recursive: true })
      const temp = `${path}.tmp`
      writeFileSync(temp, JSON.stringify(state, null, 2), 'utf8')
      renameSync(temp, path)
    } catch (error) {
      note('persist', error)
    }
  }

  function persistSoon() {
    if (writeTimer) clearTimeout(writeTimer)
    writeTimer = setTimeout(() => {
      writeTimer = null
      persistNow()
    }, 400)
  }

  /* 会话与 agent */

  function sessionOf(agent) {
    const direct = agent?.session
    if (direct && typeof direct === 'object' && typeof direct.id === 'string') return direct
    const sessionId = agent?.sessionId ?? direct?.id
    if (!sessionId) return null
    try {
      return ctx.get('sessions')?.get?.(sessionId) ?? null
    } catch (error) {
      note('sessions', error)
      return null
    }
  }

  function sessionIdOf(agent) {
    return agent?.sessionId ?? agent?.session?.id ?? agent?.session?.sessionId ?? null
  }

  function isBlank(agent) {
    const session = sessionOf(agent)
    if (!session) return false
    try {
      const boundary = ctx.agents.turnBoundaryOf(session)
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

  function isRootAgent(agent) {
    try {
      const roots = ctx.agents.roots()
      if (!Array.isArray(roots)) return true
      const sessionId = sessionIdOf(agent)
      return roots.some((root) => root === agent || sessionIdOf(root) === sessionId)
    } catch (error) {
      note('roots', error)
      return true
    }
  }

  function visibleSchemas(agent) {
    try {
      return ctx.tools.schemas(agent)
    } catch (error) {
      note('schemas', error)
      return []
    }
  }

  /* 基线层 */

  /**
   * 环境事实按 agent 注册成运行时上下文，并且**所有 agent 都装**——子代理同样需要
   * platform/shell/git，否则它在 Windows 上会按 POSIX 习惯写命令。
   *
   * 探测在注册时同步做一次并固定：这段文本每次变化都会让宿主追加一条新的快照
   * 消息，等于每次 git 变化都重写请求前缀。会话内不再复测是有意取舍。
   */
  function applyEnvironment(agent) {
    const sessionId = sessionIdOf(agent)
    if (!sessionId || envApplied.has(sessionId)) return
    if (!agent?.ctx?.systemPrompt?.context) return
    try {
      const session = sessionOf(agent)
      const cwd = typeof session?.header?.cwd === 'string' ? session.header.cwd : undefined
      const names = new Set(visibleSchemas(agent).map((schema) => schema.name))
      const shellTool = names.has('pwsh') ? 'pwsh' : names.has('bash') ? 'bash' : null
      const facts = probeEnvironment({ cwd, shellTool })
      const text = environmentFactsText(facts)
      const dispose = agent.ctx.systemPrompt.context({
        name: ENVIRONMENT_CONTEXT_NAME,
        order: ENVIRONMENT_CONTEXT_ORDER,
        interpolate: false,
        text: () => (state.baseline.environmentFacts ? text : ''),
      })
      envApplied.set(sessionId, { dispose, facts })
    } catch (error) {
      note('environment', error)
    }
  }

  function releaseEnvironment(agent) {
    const sessionId = sessionIdOf(agent)
    const entry = sessionId ? envApplied.get(sessionId) : null
    if (!entry) return
    envApplied.delete(sessionId)
    try {
      entry.dispose()
    } catch (error) {
      note('environment dispose', error)
    }
  }

  /* 应用 */

  function planFor(profile, definitions, extraNames, previousOriginals) {
    const byName = new Map(definitions.map((definition) => [definition.name, definition]))
    const names = new Set([...byName.keys()])
    if (extraNames) for (const name of extraNames) names.add(name)
    const hidden = []
    const deferred = new Map()
    const originals = new Map()
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

  function applyTo(agent, profileId) {
    const sessionId = sessionIdOf(agent)
    const previousOriginals = sessionId ? applied.get(sessionId)?.plan?.originals : undefined
    release(agent)
    applying += 1
    try {
      const profile = profileId === 'none' ? null : profileById(profileId)
      const agentCtx = agent.ctx
      if (!agentCtx) throw new Error('agent 没有可用的 ctx')
      const definitions = definitionsOf(agent)
      const extraNames = (() => {
        try {
          return [...(ctx.tools.view(agent)?.restrictableNames ?? [])]
        } catch {
          return []
        }
      })()
      const byName = new Map(definitions.map((definition) => [definition.name, definition]))
      const plan = profile
        ? planFor(profile, definitions, extraNames, previousOriginals)
        : { hidden: [], deferred: new Map(), originals: new Map() }
      const disposers = []

      if (plan.hidden.length > 0) {
        disposers.push(agentCtx.tools.restrict({ deny: plan.hidden }))
      }

      // 延迟：在 agent 作用域重新注册一份瘦身定义，遮住继承来的完整定义。
      // tools 数组本身在整个会话里保持这套占位，加载只往历史里追加完整定义。
      for (const [toolName, summary] of plan.deferred) {
        const original = byName.get(toolName) ?? previousOriginals?.get(toolName)
        if (!original) continue
        try {
          disposers.push(agentCtx.tools.register({
            ...original,
            ...placehold(original, summary),
          }))
        } catch (error) {
          note(`defer:${toolName}`, error)
        }
      }

      if (profile) {
        // replace/complete 一律注册，空文本是有效配置：complete+空 = developer 提示词
        // 清空（renderPrompt 丢弃空段，complete 段落成为唯一 section）；replace+空 =
        // 只清掉部署 persona 前缀。此前空文本被静默跳过，档位形同 inherit。
        if (profile.prompt.mode === 'replace' || profile.prompt.mode === 'complete') {
          const section = {
            name: PERSONA_SECTION,
            order: agentCtx.systemPrompt.getSectionOrder(PERSONA_ORDER_NAME),
            // complete 段会成为唯一的 prompt 段，全局基线段在那时全部失效；
            // 只有在这里并进去，才能保证「任何新会话都含行为契约」。
            text: profile.prompt.mode === 'complete'
              ? composeCompletePrompt(profile.prompt.text, state.baseline)
              : profile.prompt.text,
            interpolate: false,
          }
          if (profile.prompt.mode === 'complete') section.complete = true
          disposers.push(agentCtx.systemPrompt.section(section))
        }
        if (profile.runtimeContext === false) {
          disposers.push(agentCtx.systemPrompt.suppressRuntimeContext())
        }
      }

      applied.set(sessionId, {
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

  function release(agent) {
    const sessionId = sessionIdOf(agent)
    const entry = applied.get(sessionId)
    if (!entry) return
    try {
      entry.dispose()
    } catch (error) {
      note('release', error)
    }
    applied.delete(sessionId)
    syncToolSearch()
  }

  function definitionsOf(agent) {
    try {
      return ctx.tools.definitions(agent)
    } catch (error) {
      note('definitions', error)
      return []
    }
  }

  function planOf(agent) {
    const entry = applied.get(sessionIdOf(agent))
    if (entry) return entry
    const sessionId = sessionIdOf(agent)
    const recorded = sessionId ? state.sessions[sessionId] : undefined
    if (!recorded) return null
    const profile = recorded === 'none' ? null : profileById(recorded)
    if (recorded !== 'none' && !profile) return null
    return {
      profileId: recorded,
      plan: profile
        ? planFor(profile, definitionsOf(agent))
        : { hidden: [], deferred: new Map(), originals: new Map() },
    }
  }

  /* tool_search */

  function deferredFor(agent) {
    const entry = planOf(agent)
    if (!entry) return new Map()
    return entry.plan.deferred
  }

  function originalsFor(agent) {
    const entry = planOf(agent)
    return entry?.plan?.originals ?? new Map()
  }

  function syncToolSearch() {
    let wanted = false
    for (const entry of applied.values()) if (entry.plan.deferred.size > 0) wanted = true
    if (wanted && toolSearchDispose === null) {
      toolSearchDispose = ctx.tools.register(searchTool)
    } else if (!wanted && toolSearchDispose !== null) {
      toolSearchDispose()
      toolSearchDispose = null
    }
  }

  const searchTool = {
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
      const agent = exec.agent
      if (!agent) throw new Error('tool_search 需要一个会话')
      const deferred = deferredFor(agent)
      if (deferred.size === 0) {
        return { matched: [], definitions: '', message: '当前没有延迟加载的工具。' }
      }
      const query = String(args.query ?? '').trim()
      const terms = query.toLowerCase().split(/[\s,，、]+/).filter(Boolean)
      const names = [...deferred.keys()]
      let matched = names
      if (query && !/^(all|\*|全部)$/i.test(query)) {
        const exact = names.filter((toolName) => toolName.toLowerCase() === query.toLowerCase())
        if (exact.length > 0) matched = exact
        else {
          const groups = new Set()
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

  function loadedFor(agent) {
    let set = loadedByAgent.get(agent)
    if (!set) {
      set = new Set()
      loadedByAgent.set(agent, set)
    }
    return set
  }

  /* 目录 */

  function toolEntry(schema) {
    const parameters = schema.parameters ? JSON.stringify(schema.parameters) : ''
    const chars = String(schema.name ?? '').length + String(schema.description ?? '').length + parameters.length
    return {
      name: schema.name,
      description: String(schema.description ?? '').slice(0, 240),
      group: groupOf(schema.name),
      server: serverOf(schema.name),
      chars,
      tokens: Math.max(1, Math.round(chars * TOKEN_PER_CHAR)),
    }
  }

  async function buildCatalog() {
    const now = Date.now()
    if (catalogCache && now - catalogCache.at < 15000) return catalogCache.value
    const presets = []
    let defaultPreset = 'standard'
    const registry = ctx.get('agentPresets')
    try {
      const registryConfig = ctx.get('agentPresetRegistry')
      if (registryConfig?.config?.default) defaultPreset = registryConfig.config.default
    } catch {
      /* 老宿主没有这个服务 */
    }
    try {
      const list = registry?.list ? await registry.list() : []
      for (const preset of list) {
        let tools = []
        try {
          const lease = await registry.acquireScope(preset.id)
          try {
            tools = ctx.tools.schemas(lease.key).map(toolEntry)
          } finally {
            await lease.dispose?.()
          }
        } catch (error) {
          note(`catalog:${preset.id}`, error)
        }
        tools.sort((a, b) => a.name.localeCompare(b.name))
        presets.push({ id: preset.id, name: preset.name || preset.id, tools })
      }
    } catch (error) {
      note('catalog', error)
    }
    const union = new Map()
    for (const preset of presets) {
      for (const tool of preset.tools) {
        if (!union.has(tool.name)) union.set(tool.name, { ...tool, modes: [] })
        union.get(tool.name).modes.push(preset.id)
      }
    }
    if (!presets.some((preset) => preset.id === defaultPreset)) defaultPreset = presets[0]?.id ?? ''
    const value = {
      presets,
      defaultPreset,
      tools: [...union.values()].sort((a, b) => a.name.localeCompare(b.name)),
      groups: GROUPS.map(({ id, title }) => ({ id, title })),
    }
    catalogCache = { at: now, value }
    return value
  }

  /* 快照 */

  async function snapshot() {
    const catalog = await buildCatalog()
    const live = []
    for (const agent of ctx.agents.list()) {
      if (!isRootAgent(agent)) continue
      const sessionId = sessionIdOf(agent)
      const entry = applied.get(sessionId)
      const session = sessionOf(agent)
      let preset = null
      try {
        preset = session ? ctx.get('agentPresets')?.presetForSession?.(session) ?? null : null
      } catch {
        preset = null
      }
      live.push({
        sessionId,
        preset,
        blank: isBlank(agent),
        profileId: entry?.profileId ?? state.sessions[sessionId] ?? null,
        deferred: entry?.plan?.deferred?.size ?? 0,
        hidden: entry?.plan?.hidden?.length ?? 0,
        loaded: loadedByAgent.get(agent)?.size ?? 0,
      })
    }
    return {
      ok: true,
      version: VERSION,
      profiles: state.profiles,
      lastUsedId: state.lastUsedId,
      sessions: state.sessions,
      baseline: state.baseline,
      presets: catalog.presets,
      defaultPreset: catalog.defaultPreset,
      tools: catalog.tools,
      groups: catalog.groups,
      live,
      diagnostics: diagnostics.slice(0, 8),
      statePath: statePath(),
      clientBundle: (() => {
        try {
          return ctx.get('clientModules')?.clientPath?.(PACKAGE_NAME) ?? null
        } catch {
          return null
        }
      })(),
    }
  }

  function previewFor(agent, profileId) {
    const profile = profileId === 'none' ? null : profileById(profileId)
    const schemas = visibleSchemas(agent)
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
    const hidden = []
    const deferred = []
    const visible = []
    for (const schema of schemas) {
      const stateOfTool = effectiveState(profile, schema.name)
      if (stateOfTool === OFF) hidden.push(schema.name)
      else if (stateOfTool === DEFER) deferred.push(schema.name)
      else visible.push(schema.name)
    }
    return { ok: true, profileId, total: schemas.length, hidden, deferred, visible }
  }

  /* HTTP */

  function readBody(request) {
    return new Promise((resolve, reject) => {
      const chunks = []
      let size = 0
      request.on('data', (chunk) => {
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

  function sendJson(response, status, value) {
    const body = JSON.stringify(value)
    response.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'content-length': Buffer.byteLength(body),
    })
    response.end(body)
  }

  /**
   * 回退校验（宿主没有 connection 服务时）：只认回环 Host。IPv6 的 Host 是
   * “[::1]:port” 形态，剥端口要先找 ']'，直接 split(':') 会切出 '['。
   */
  function loopbackOnly(request) {
    const raw = String(request.headers.host ?? '').toLowerCase()
    const host = raw.startsWith('[') ? raw.slice(0, raw.indexOf(']') + 1) : raw.split(':')[0]
    return !raw || ['127.0.0.1', 'localhost', '[::1]', '::1'].includes(host)
  }

  /**
   * 信任栅栏：宿主 webServer 对直接 register 的路由不做任何认证，官方做法是
   * 借 connection 服务的 Host/Origin/浏览器会话检查（open-in-app 同款）。拿得到
   * 就完全以它为准（它也放行受信的非回环 Host，如 dsh web --host 局域网场景），
   * 拿不到才退回 loopbackOnly。
   */
  function guard(request, response) {
    // connection 不在 inject 名单里，不能按属性取：Cordis 对未声明服务的属性访问会直接抛
    // `cannot get property "connection" without inject`；ctx.get 在缺失时返回 undefined。
    let fence
    try {
      fence = ctx.get('connection')
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

  function agentFor(sessionId) {
    if (!sessionId) return null
    for (const agent of ctx.agents.list()) {
      if (sessionIdOf(agent) === sessionId) return agent
    }
    return null
  }

  async function handleState(request, response) {
    try {
      if (!guard(request, response)) return
      if (request.method === 'GET') return sendJson(response, 200, await snapshot())
      if (request.method !== 'POST') return sendJson(response, 405, { ok: false, error: 'method not allowed' })
      // POST 只收 application/json（照官方 open-in-app）：掐掉 text/plain 简单
      // 请求形式的跨站提交，与 guard 的信任栅栏构成双保险。
      const essence = String(request.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase()
      if (essence !== 'application/json') {
        return sendJson(response, 415, { ok: false, error: 'content-type must be application/json' })
      }
      const parsed = JSON.parse(await readBody(request))
      const next = normalizeState({ ...state, ...parsed, version: VERSION })
      state = next
      persistNow()
      const catalog = await buildCatalog()
      for (const agent of ctx.agents.list()) {
        if (!isRootAgent(agent) || !isBlank(agent)) continue
        const sessionId = sessionIdOf(agent)
        if (!sessionId) continue
        const recorded = state.sessions[sessionId] ?? state.lastUsedId
        applyTo(agent, recorded)
        state.sessions[sessionId] = recorded
      }
      catalogCache = null
      sendJson(response, 200, { ok: true, snapshot: await snapshot() })
    } catch (error) {
      sendJson(response, 400, { ok: false, error: messageOf(error) })
    }
  }

  async function handleSession(request, response) {
    try {
      if (!guard(request, response)) return
      if (request.method === 'GET') {
        const url = new URL(request.url ?? '/', 'http://localhost')
        const sessionId = url.searchParams.get('id') ?? ''
        const agent = agentFor(sessionId)
        if (!agent) return sendJson(response, 404, { ok: false, error: 'session not live' })
        const recorded = state.sessions[sessionId] ?? state.lastUsedId
        const entry = applied.get(sessionId)
        const deferred = entry?.plan?.deferred ?? new Map()
        const hidden = new Set(entry?.plan?.hidden ?? [])
        const loaded = loadedByAgent.get(agent) ?? new Set()
        const tools = visibleSchemas(agent).map((schema) => ({
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
          blank: isBlank(agent),
          tools,
        })
      }
      if (request.method !== 'POST') return sendJson(response, 405, { ok: false, error: 'method not allowed' })
      // POST 只收 application/json（照官方 open-in-app）：掐掉 text/plain 简单
      // 请求形式的跨站提交，与 guard 的信任栅栏构成双保险。
      const essence = String(request.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase()
      if (essence !== 'application/json') {
        return sendJson(response, 415, { ok: false, error: 'content-type must be application/json' })
      }
      const parsed = JSON.parse(await readBody(request))
      const sessionId = String(parsed.sessionId ?? '')
      const profileId = parsed.profileId === 'none' ? 'none' : String(parsed.profileId ?? '')
      if (!sessionId) return sendJson(response, 400, { ok: false, error: 'sessionId required' })
      if (profileId !== 'none' && !profileById(profileId)) {
        return sendJson(response, 400, { ok: false, error: 'unknown profile' })
      }
      state.sessions[sessionId] = profileId
      state.lastUsedId = profileId
      persistSoon()
      const agent = agentFor(sessionId)
      if (agent) applyTo(agent, profileId)
      sendJson(response, 200, { ok: true, snapshot: await snapshot() })
    } catch (error) {
      sendJson(response, 400, { ok: false, error: messageOf(error) })
    }
  }

  async function handlePreview(request, response) {
    try {
      if (!guard(request, response)) return
      const url = new URL(request.url ?? '/', 'http://localhost')
      const sessionId = url.searchParams.get('id') ?? ''
      const profileId = url.searchParams.get('profile') ?? ''
      const agent = sessionId ? agentFor(sessionId) : ctx.agents.list().find(isRootAgent) ?? null
      if (!agent) return sendJson(response, 404, { ok: false, error: 'no live agent' })
      sendJson(response, 200, previewFor(agent, profileId))
    } catch (error) {
      sendJson(response, 400, { ok: false, error: messageOf(error) })
    }
  }

  /** 干跑一次装配，确认占位真的进入了模型看到的 schema。 */
  async function handleAssemble(request, response) {
    try {
      if (!guard(request, response)) return
      const url = new URL(request.url ?? '/', 'http://localhost')
      const sessionId = url.searchParams.get('id') ?? ''
      const agent = sessionId ? agentFor(sessionId) : ctx.agents.list().find(isRootAgent) ?? null
      if (!agent) return sendJson(response, 404, { ok: false, error: 'no live agent' })
      const assembly = await ctx.systemPrompt.assemble({ agent, scope: agent })
      const tools = assembly.tools ?? []
      // 段/上下文的名单与体量：面板与验收都靠它确认基线段真的进了装配，而不是只写在状态里。
      const sections = (assembly.sections ?? []).map((section) => ({
        name: section.name,
        chars: String(section.text ?? '').length,
      }))
      const contexts = (assembly.contexts ?? []).map((context) => ({
        name: context.name,
        chars: String(context.text ?? '').length,
      }))
      const deferred = planOf(agent)?.plan?.deferred ?? new Map()
      const sample = tools
        .filter((tool) => deferred.has(tool.name))
        .slice(0, 2)
        .map((tool) => ({
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
          chars: JSON.stringify(tool).length,
        }))
      const entry = planOf(agent)
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
        sample,
      })
    } catch (error) {
      sendJson(response, 400, { ok: false, error: messageOf(error) })
    }
  }

  /* 生命周期 */

  load()

  // 基线三段是全局段：与档位无关，每个 agent 的装配都会带上；开关关闭时段文本为空，
  // 装配层会丢弃空段。用函数读 state，所以面板改开关不需要重新注册。
  const baselineSectionDisposers = []
  for (const section of baselineSections(() => state.baseline)) {
    try {
      baselineSectionDisposers.push(ctx.systemPrompt.section(section))
    } catch (error) {
      note('baseline section', error)
    }
  }

  // webServer 是宿主补挂的服务：插件启动时它可能还没就绪，必须用 inject 等它出现。
  ctx.inject(['webServer'], (sctx) => {
    try {
      const web = sctx.get('webServer')
      if (!web?.register) {
        note('webServer', new Error('webServer 没有 register'))
        return
      }
      const disposers = [
        web.register({ kind: 'exact', path: ROUTE_STATE, handler: handleState }),
        web.register({ kind: 'exact', path: ROUTE_SESSION, handler: handleSession }),
        web.register({ kind: 'exact', path: ROUTE_PREVIEW, handler: handlePreview }),
        web.register({ kind: 'exact', path: ROUTE_ASSEMBLE, handler: handleAssemble }),
      ]
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

  ctx.on('agent/created', ({ agent }) => {
    try {
      applyEnvironment(agent)
      if (!isRootAgent(agent)) return
      const sessionId = sessionIdOf(agent)
      if (!sessionId) return
      const recorded = state.sessions[sessionId]
      if (recorded) {
        applyTo(agent, recorded)
        return
      }
      if (!isBlank(agent)) return
      applyTo(agent, state.lastUsedId)
      state.sessions[sessionId] = state.lastUsedId
      persistSoon()
    } catch (error) {
      note('agent/created', error)
    }
  })

  ctx.on('agent/disposed', ({ agent }) => {
    releaseEnvironment(agent)
    release(agent)
  })

  let changeTimer = null
  ctx.on('tools/change', () => {
    if (applying > 0) return
    if (changeTimer) clearTimeout(changeTimer)
    changeTimer = setTimeout(() => {
      changeTimer = null
      for (const entry of [...applied.values()]) {
        const agent = entry.agent
        if (!agent) continue
        const profile = entry.profileId === 'none' ? null : profileById(entry.profileId)
        if (!profile) continue
        const extraNames = (() => {
          try {
            return [...(ctx.tools.view(agent)?.restrictableNames ?? [])]
          } catch {
            return []
          }
        })()
        const plan = planFor(profile, definitionsOf(agent), extraNames, entry.plan.originals)
        const sameHidden =
          plan.hidden.length === entry.plan.hidden.length &&
          plan.hidden.every((name) => entry.plan.hidden.includes(name))
        const sameDeferred = plan.deferred.size === entry.plan.deferred.size
        if (sameHidden && sameDeferred) {
          entry.plan = plan
          continue
        }
        try {
          applyTo(agent, entry.profileId)
        } catch (error) {
          note('tools/change', error)
        }
      }
    }, 300)
  })

  /* 通道拦截 */

  function channelsProfileOf(agent) {
    const sessionId = sessionIdOf(agent)
    if (!sessionId) return null
    const entry = applied.get(sessionId)
    const profileId = entry?.profileId ?? state.sessions[sessionId]
    if (!profileId || profileId === 'none') return null
    return profileById(profileId)
  }

  // prepend 让过滤器落在最外层：time-context 同样用 prepend 的 pre-step 追加
  // 时间消息，只有包在它外面才能把它刚追加的消息一并滤掉。装载顺序上本插件
  // 在用户补丁层、晚于预设里的 time-context，prepend 后处于链头。
  ctx.on('agent/pre-step', async ({ agent, signal }, next) => {
    const decision = await next()
    if (decision.kind === 'reject' || signal?.aborted || !agent) return decision
    const profile = channelsProfileOf(agent)
    const blocked = new Set()
    for (const channel of CHANNELS) {
      if (profile?.channels?.[channel.id] === OFF) blocked.add(channel.source)
    }
    if (blocked.size === 0) return decision
    const messages = decision.messages.filter((message) => !blocked.has(message?.source?.kind))
    return messages.length === decision.messages.length ? decision : { ...decision, messages }
  }, { prepend: true })

  // 插件重载后，已有会话的 restriction 会随旧 ctx 一起撤销，这里补一次。
  for (const agent of ctx.agents.list()) {
    try {
      applyEnvironment(agent)
      if (!isRootAgent(agent)) continue
      const sessionId = sessionIdOf(agent)
      const recorded = sessionId ? state.sessions[sessionId] : undefined
      if (recorded) applyTo(agent, recorded)
    } catch (error) {
      note('reapply', error)
    }
  }

  ctx.effect(() => () => {
    for (const dispose of baselineSectionDisposers) {
      try {
        dispose()
      } catch (error) {
        note('baseline section dispose', error)
      }
    }
    for (const entry of envApplied.values()) {
      try {
        entry.dispose()
      } catch (error) {
        note('environment dispose', error)
      }
    }
    envApplied.clear()
    if (writeTimer) {
      clearTimeout(writeTimer)
      writeTimer = null
      persistNow()
    }
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
  }, 'session-context-config: teardown')
}

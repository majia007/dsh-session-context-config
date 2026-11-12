/**
 * 工具来源:给面板里的每个工具标出「谁注册了它」。
 *
 * 宿主 tools 注册表只保留定义、不记录注册者(0.2.2-rc.1 实测:注册只产生一条
 * `tools.register()` effect,分层存储里没有归属字段),所以归属只能靠旁证,按可信度分四级:
 *
 * 1. **注册时捕获**(装载后的一切注册,含 MCP 与热重载):cordis 的 traceable 服务代理
 *    让 `this.ctx` 等于调用方 ctx,本模块在装载时包一层 `tools.register`,再从**调用栈**
 *    取第一个业务文件帧,反查它属于哪个包。用栈而不是 `ctx.fiber`:agent 作用域的工具
 *    (`agent.ctx.tools.register`)的 fiber 属于造作用域的插件(agent-preset-registry),
 *    栈才指向真正的调用方。
 * 2. **官方工具目录**(随包生成的静态表):覆盖本插件装载前就注册好的宿主工具;
 *    与当前真正装载的模块求交,同名多实现(bash / bash-persistent)只留装载的那个。
 * 3. **入口产物扫描**(推断):仍未命中的名字,去「确实注册过工具」的入口产物里找唯一
 *    一处带引号的同名定义。只认唯一命中,多命中一律不猜。
 * 4. **MCP 命名约定**:`mcp__<server>__<tool>` 比包名更能回答「这是谁的」,优先于第 1 级。
 *
 * 四级都不命中就返回 undefined,面板显示「未识别」——不拿近似结果冒充归属。
 */
import { readFileSync, realpathSync } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { dirname, isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { KNOWN_TOOL_PACKAGES } from './known-tools.ts'
import { DEFERRED_DESCRIPTION_PREFIX } from './tools.ts'
import type { HostContext } from '../types.ts'

/** 来源可信度:面板在 tooltip 里区分「注册时捕获」与「推断」。 */
export type ToolSourceEvidence = 'registry' | 'catalog' | 'scan' | 'mcp' | 'fallback'

/** 一个工具的来源标注。 */
export interface ToolSource {
  /** mcp=按命名约定识别的 MCP 工具;plugin=定位到某个包;unknown=没有可用证据。 */
  kind: 'mcp' | 'plugin' | 'unknown'
  /** 面板直接显示的短名(包标题、包短名或 MCP server 名)。 */
  label: string
  /** 悬停显示的完整依据(包名、入口 id、判定方式)。 */
  detail: string
  /** 判定依据的等级;scan 是推断,其余是事实来源。 */
  evidence: ToolSourceEvidence
}

/** 待解析的工具:名字之外还带描述,用于同名多实现与动态名的消歧。 */
export interface ToolTarget {
  name: string
  description?: string
}

/** 无法定位时面板显示的占位(不在每一行重复长解释,理由放 tooltip)。 */
export const UNKNOWN_SOURCE: ToolSource = {
  kind: 'unknown',
  label: '未识别',
  detail: '宿主不提供工具归属信息，且本插件装载前注册的工具无法回溯。已尝试：注册捕获、官方工具目录、入口产物扫描。',
  evidence: 'fallback',
}

const ORIGINAL = Symbol.for('cordis.original')
const PATCH_FLAG = Symbol.for('jia-tools.session-context-config.source-patch')

/** 本插件 Host 产物文件;栈里要把自己的帧跳掉(整包打成单文件)。 */
const SELF_FILE = (() => {
  try {
    const path = fileURLToPath(import.meta.url)
    // loader 用 profile 里的 junction 路径 import,而调用栈按 realpath 打帧:
    // 必须先 realpath 才能和栈里的路径对上(否则自己的帧永远跳不掉)。
    return normalizePath(realpathSync(path))
  } catch {
    try {
      return normalizePath(fileURLToPath(import.meta.url))
    } catch {
      return ''
    }
  }
})()

/** 本插件包名:源码扫描要把自己排除(本插件当然会在自己的产物里提到这些工具名)。 */
const SELF_PACKAGE = (() => {
  try {
    let dir = dirname(SELF_FILE)
    for (let depth = 0; depth < 4; depth += 1) {
      try {
        const parsed = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { name?: unknown }
        if (typeof parsed.name === 'string' && parsed.name) return parsed.name
      } catch {
        /* 继续向上找 */
      }
      const parent = dirname(dir)
      if (parent === dir) break
      dir = parent
    }
  } catch {
    /* 兜底走常量 */
  }
  return '@jia-tools/dsh-session-context-config'
})()

/** 框架自身的栈帧:tools 服务的调用一定经过 cordis 的 traceable 代理。 */
const FRAMEWORK_MARKERS = ['/node_modules/@deepseek-ai/dsh-tools/', '/node_modules/@deepseek-ai/cordis/']

/** 注册调用记录:谁能证明这个工具名从哪来。 */
interface Registration {
  /** 调用栈里第一个业务文件(展示用)。 */
  file?: string
  /** 由文件路径反查到的包名。 */
  packageName?: string
  /** 该包的 Loader 入口 id(拿得到时填,只用于 tooltip)。 */
  entryId?: string
  /** 解析本地化标题用的 baseUrl。 */
  baseUrl?: string
  /** 栈不可用时的兜底:fiber 名(拿不到入口时显示在 tooltip 里)。 */
  fiberName?: string
}

/** 一个 Loader 入口(含 agent preset 子树的入口)的元信息。 */
interface EntryRecord {
  /** 入口声明的模块说明符(可能带子路径)。 */
  spec: string
  /** 去掉子路径后的包名。 */
  pkg: string
  entryId: string
  baseUrl?: string
}

interface ScanCandidate extends EntryRecord {
  dir: string
}

interface EntryLike {
  options?: { name?: unknown }
  id?: string
  disabled?: boolean
  parent?: { tree?: { ctx?: { baseUrl?: string } } }
}

/** 来源索引的诊断输出(/api/state 的 sources 字段)。 */
export interface SourceReport {
  patched: boolean
  resolved: number
  byEvidence: Record<string, number>
  misses: number
}

/** 来源索引:面板构建目录时一次性解析整批工具名。 */
export interface SourceIndex {
  /** 已解析的来源;未知返回 undefined(异步扫描可能稍后补上)。 */
  resolve(name: string): ToolSource | undefined
  /** 解析整批工具:先走同步三级,再做描述消歧与入口产物扫描。 */
  resolveMany(tools: readonly ToolTarget[]): Promise<void>
  /** 诊断计数(快照随 /api/state 返回,验收时看它)。 */
  report(): SourceReport
  /** 撤销注册拦截并清空缓存。 */
  dispose(): void
}

/**
 * 建立来源索引,并在装载时立刻装上 `tools.register` 拦截。
 *
 * 拦截必须尽早:本插件装载后注册的工具才能被捕获,越晚越多工具只能落到静态证据上。
 * @param ctx - 本插件 apply 的 Host ctx(带 tools 与可选 loader/pluginPackages)。
 * @param note - 诊断回调(软失败不抛:来源缺证据不是致命错误)。
 * @returns 索引与卸载函数;宿主没有 tools 服务时返回空实现。
 */
export function createSourceIndex(ctx: HostContext, note: (source: string, error: unknown) => void): SourceIndex {
  const registrations = new Map<string, Registration>()
  const sources = new Map<string, ToolSource>()
  /** 扫描后仍无证据的名字与时间:避免每次重建目录都重扫同一批。 */
  const misses = new Map<string, number>()
  /** 官方目录里同名多实现的工具名(需要描述消歧)。 */
  const ambiguousCatalog = new Set<string>()
  const dirCache = new Map<string, string | null>()
  const packageNameCache = new Map<string, string | null>()
  const moduleTextCache = new Map<string, { key: string; text: string }>()
  let entryCache: { at: number; value: EntryRecord[] } | null = null
  let patched = false

  const uninstall = installRecorder()

  return { resolve, resolveMany, report, dispose }

  /** 装上注册拦截;返回撤销函数(宿主没有 tools 服务时为空)。 */
  function installRecorder(): () => void {
    try {
      const service = ctx.get('tools') as Record<PropertyKey, unknown> | undefined
      // ctx.get 返回 traceable 代理;original 符号能拿到服务实例本身。
      const raw = (service?.[ORIGINAL] ?? service) as Record<PropertyKey, unknown> | undefined
      if (!raw || typeof raw.register !== 'function') return () => {}
      if (raw[PATCH_FLAG] === true) return () => {}
      const original = raw.register as (this: unknown, definition: unknown, options?: unknown) => unknown
      // 宿主里 register 在原型上,删掉自有属性即可还原;若它本来就是自有属性(测试桩/未来实现),必须写回原值。
      const hadOwn = Object.hasOwn(raw, 'register')
      const patchedRegister = function patchedRegister(this: { ctx?: { fiber?: unknown } } | undefined, definition: unknown, options?: unknown): unknown {
        try {
          const named = definition as { name?: unknown; description?: unknown } | null | undefined
          const name = named?.name
          // 本插件给延迟工具注册的占位不是「原注册」:记下来会把归属改成我们自己,
          // 真归属只能留给静态目录/入口产物扫描(占位描述有固定前缀,可据此识别)。
          const placeholder = typeof named?.description === 'string'
            && named.description.startsWith(DEFERRED_DESCRIPTION_PREFIX)
          if (!placeholder && typeof name === 'string' && name) remember(name, this?.ctx?.fiber)
        } catch (error) {
          note('source capture', error)
        }
        return original.call(this, definition, options)
      }
      raw.register = patchedRegister
      raw[PATCH_FLAG] = true
      patched = true
      return () => {
        try {
          if (raw.register === patchedRegister) {
            if (hadOwn) raw.register = original
            else delete raw.register
            delete raw[PATCH_FLAG]
          }
        } catch (error) {
          note('source patch dispose', error)
        }
        patched = false
      }
    } catch (error) {
      note('source patch', error)
      return () => {}
    }
  }

  /** 记一次注册:优先按调用栈定位调用方,栈不可用时退回 fiber 的入口。 */
  function remember(name: string, fiber: unknown): void {
    const registration: Registration = {}
    const file = callerFile()
    if (file) {
      registration.file = file
      const resolved = packageOfFile(file)
      if (resolved) {
        registration.packageName = resolved.pkg
        registration.entryId = resolved.entryId
        registration.baseUrl = resolved.baseUrl
      }
    }
    if (!registration.packageName) {
      const fallback = packageOfFiber(fiber)
      if (fallback.packageName) {
        registration.packageName = fallback.packageName
        registration.entryId = fallback.entryId
        registration.baseUrl = fallback.baseUrl
      }
      registration.fiberName = fallback.fiberName
    }
    registrations.set(name, registration)
    // 新注册可以推翻旧的静态判断(插件热重载后重新注册同名工具)。
    sources.delete(name)
    misses.delete(name)
  }

  function resolve(name: string): ToolSource | undefined {
    const cached = sources.get(name)
    if (cached) return cached
    const value = compute(name)
    if (value) sources.set(name, value)
    return value
  }

  /** 同步三级:命名约定 → 注册捕获 → 官方目录。 */
  function compute(name: string): ToolSource | undefined {
    return mcpSource(name) ?? capturedSource(name) ?? catalogSource(name) ?? undefined
  }

  async function resolveMany(tools: readonly ToolTarget[]): Promise<void> {
    const unresolved: ToolTarget[] = []
    const ambiguous: ToolTarget[] = []
    for (const tool of tools) {
      if (sources.has(tool.name)) continue
      const value = compute(tool.name)
      if (value) {
        sources.set(tool.name, value)
        // 官方目录同名多实现(如 pwsh):先用工具描述在候选包之间消歧。
        if (ambiguousCatalog.has(tool.name)) ambiguous.push(tool)
        continue
      }
      const missedAt = misses.get(tool.name)
      if (missedAt !== undefined && Date.now() - missedAt < 60_000) continue
      unresolved.push(tool)
    }
    if (ambiguous.length > 0) await disambiguateByDescription(ambiguous)
    if (unresolved.length === 0) return
    try {
      await scanEntryModules(unresolved)
    } catch (error) {
      note('source scan', error)
      for (const tool of unresolved) misses.set(tool.name, Date.now())
    }
  }

  /** 同名多实现时用工具描述的首行在候选包入口产物里比对,唯一命中才改判。 */
  async function disambiguateByDescription(tools: readonly ToolTarget[]): Promise<void> {
    for (const tool of tools) {
      const probe = descriptionProbe(tool.description)
      if (!probe) continue
      const candidates = catalogCandidates(tool.name)
      const matched: EntryRecord[] = []
      for (const entry of candidates) {
        const text = await readModuleFor(entry)
        if (text && text.includes(probe)) matched.push(entry)
      }
      if (matched.length === 1) {
        const entry = matched[0]
        sources.set(tool.name, pluginSource(entry.pkg, entry.baseUrl, 'catalog', entry))
        ambiguousCatalog.delete(tool.name)
      }
    }
  }

  /** 官方目录里该工具的候选包(只保留当前组合真正装载的)。 */
  function catalogCandidates(name: string): EntryRecord[] {
    const packages = KNOWN_TOOL_PACKAGES[name]
    if (!packages || packages.length === 0) return []
    const loaded = loadedEntries()
    return packages.flatMap((pkg) => loaded.filter((entry) => entry.pkg === pkg))
  }

  function mcpSource(name: string): ToolSource | undefined {
    if (name.startsWith('mcp_connector_')) {
      return {
        kind: 'mcp',
        label: 'MCP 连接器',
        detail: '来自 MCP 连接器；判定：命名前缀 mcp_connector_。',
        evidence: 'mcp',
      }
    }
    const match = /^mcp__([A-Za-z0-9_-]+)__/.exec(name)
    if (!match) return undefined
    const server = match[1]
    return {
      kind: 'mcp',
      label: `MCP · ${server}`,
      detail: `来自 MCP 服务「${server}」；判定：命名约定 mcp__<server>__<tool>。`,
      evidence: 'mcp',
    }
  }

  function capturedSource(name: string): ToolSource | undefined {
    const registration = registrations.get(name)
    if (!registration) return undefined
    if (!registration.packageName) {
      const fiberName = registration.fiberName ?? '未知插件'
      return {
        kind: 'unknown',
        label: fiberName,
        detail: `注册调用来自 ${registration.file ?? '未知文件'}，该文件不属于任何已装载的包。`,
        evidence: 'fallback',
      }
    }
    return pluginSource(registration.packageName, registration.baseUrl, 'registry', registration)
  }

  function catalogSource(name: string): ToolSource | undefined {
    const candidates = KNOWN_TOOL_PACKAGES[name]
    if (!candidates || candidates.length === 0) return undefined
    const loaded = loadedEntries()
    const hits = candidates.filter((pkg) => loaded.some((entry) => entry.pkg === pkg))
    if (hits.length === 0) {
      // 目录认得这个名字,但当前组合没装载表里那批包(宿主版本与静态表有差异):
      // 只能说清「是宿主自带工具、实现包未定位」,不硬指一个没跑的包。
      return {
        kind: 'plugin',
        label: 'DSH 内置',
        detail: `官方工具目录记录它由 ${candidates.join('、')} 提供，但当前组合没有装载该包（宿主版本与静态表存在差异）。`,
        evidence: 'catalog',
      }
    }
    if (hits.length === 1) {
      const entry = loaded.find((candidate) => candidate.pkg === hits[0])
      return pluginSource(hits[0], entry?.baseUrl, 'catalog', entry)
    }
    // 同一名字有两个实现且都装载了(罕见):列出候选,并记下来给描述消歧。
    ambiguousCatalog.add(name)
    return {
      kind: 'plugin',
      label: hits.map(shortPackage).join(' / '),
      detail: `候选插件：${hits.join('、')}；判定：DSH 官方工具目录（同一工具名由多个包提供）。`,
      evidence: 'catalog',
    }
  }

  /** 包的展示名:本地化标题优先,没有就用包短名;tooltip 里始终带完整包名。 */
  function pluginSource(pkg: string, baseUrl: string | undefined, evidence: ToolSourceEvidence, origin?: Registration | EntryRecord): ToolSource {
    const title = localizedTitle(metaOf(pkg, baseUrl))
    const lines = [`插件：${pkg}`]
    const entryId = (origin as EntryRecord | undefined)?.entryId ?? (origin as Registration | undefined)?.entryId
    if (entryId) lines.push(`Loader 入口：${entryId}`)
    const file = (origin as Registration | undefined)?.file
    if (file) lines.push(`注册调用：${file}`)
    lines.push(`判定：${EVIDENCE_LABEL[evidence]}`)
    return {
      kind: 'plugin',
      label: title ?? shortPackage(pkg),
      detail: lines.join('\n'),
      evidence,
    }
  }

  /** 本地化标题查询:先用入口 baseUrl,退到 profile 根 baseUrl;拿不到返回 undefined。 */
  function metaOf(pkg: string, baseUrl: string | undefined): unknown {
    try {
      const packages = ctx.get('pluginPackages') as { metaOf?: (spec: string, parent: string) => unknown } | undefined
      const parent = baseUrl ?? ctx.baseUrl
      return parent ? packages?.metaOf?.(pkg, parent) : undefined
    } catch (error) {
      note('pluginPackages.metaOf', error)
      return undefined
    }
  }

  /** 当前组合里出现过的全部入口(含 agent preset 子树的入口;按包去重)。 */
  function loadedEntries(): EntryRecord[] {
    if (entryCache && Date.now() - entryCache.at < 5_000) return entryCache.value
    const found = new Map<string, EntryRecord>()
    for (const fiber of allFibers()) {
      const entry = entryOfFiber(fiber)
      if (!entry || entry.disabled === true) continue
      const spec = typeof entry.options?.name === 'string' ? entry.options.name : ''
      if (!spec) continue
      const pkg = packageOfSpecifier(spec)
      if (found.has(pkg)) continue
      found.set(pkg, {
        spec,
        pkg,
        entryId: typeof entry.id === 'string' ? entry.id : '',
        baseUrl: entry.parent?.tree?.ctx?.baseUrl,
      })
    }
    entryCache = { at: Date.now(), value: [...found.values()] }
    return entryCache.value
  }

  /** 进程内全部已装载 fiber(含 agent 作用域与 preset 子树的插件)。 */
  function allFibers(): unknown[] {
    const fibers: unknown[] = []
    try {
      const registry = (ctx as unknown as { registry?: { values?: () => Iterable<{ fibers?: Iterable<unknown> }> } }).registry
      for (const runtime of registry?.values?.() ?? []) {
        for (const fiber of runtime?.fibers ?? []) fibers.push(fiber)
      }
    } catch {
      /* 注册表形状不符时按空处理:来源解析退回静态证据 */
    }
    return fibers
  }

  /**
   * 对仍未命中的工具做入口产物扫描。
   *
   * 候选只取「确实注册过工具」的入口(看 fiber 上的 `tools.register()` effect),
   * 避免读几十个无关包;命中要求唯一,多个包都命中时保持未识别。
   * 判定同时看「带引号的工具名」与「描述首行」——名字可能是配置驱动的动态值。
   */
  async function scanEntryModules(tools: readonly ToolTarget[]): Promise<void> {
    const targets = tools.filter((tool) => isDistinctive(tool.name) || descriptionProbe(tool.description) !== '')
    if (targets.length === 0) return
    const candidates = scanCandidates()
    if (candidates.length === 0) return
    const hits = new Map<string, string[]>()
    for (const candidate of candidates) {
      const text = await readEntryModule(candidate)
      if (!text) continue
      for (const tool of targets) {
        if (!containsQuoted(text, tool.name) && !containsDescription(text, tool.description)) continue
        const packages = hits.get(tool.name) ?? []
        if (!packages.includes(candidate.pkg)) packages.push(candidate.pkg)
        hits.set(tool.name, packages)
      }
    }
    for (const tool of targets) {
      const packages = hits.get(tool.name)
      const entry = packages?.length === 1 ? candidates.find((candidate) => candidate.pkg === packages[0]) : undefined
      if (!packages || packages.length !== 1 || !entry) {
        misses.set(tool.name, Date.now())
        continue
      }
      const target = pluginSource(entry.pkg, entry.baseUrl, 'scan', entry)
      target.detail = `${target.detail}\n命中位置：${entry.dir} 的入口产物`
      sources.set(tool.name, target)
    }
  }

  /** 按入口解析包目录后读入口产物(描述消歧与扫描共用)。 */
  async function readModuleFor(entry: EntryRecord): Promise<string | undefined> {
    const dir = packageDir(entry.spec, entry.baseUrl)
    if (!dir) return undefined
    return readEntryModule({ ...entry, dir })
  }

  /** 有工具注册 effect 的入口(带解析出的包目录);没有目录的跳过。 */
  function scanCandidates(): ScanCandidate[] {
    const withTools = new Set<string>()
    for (const fiber of allFibers()) {
      const entry = entryOfFiber(fiber)
      if (!entry) continue
      if (!fiberHasToolEffect(fiber)) continue
      const spec = typeof entry.options?.name === 'string' ? entry.options.name : ''
      if (spec) withTools.add(spec)
    }
    if (withTools.size === 0) return []
    const candidates: ScanCandidate[] = []
    for (const entry of loadedEntries()) {
      if (!withTools.has(entry.spec)) continue
      // 本插件自己的产物里当然会出现这些工具名(分组规则、文案),不能把自己当来源。
      if (entry.pkg === SELF_PACKAGE) continue
      const dir = packageDir(entry.spec, entry.baseUrl)
      if (dir) candidates.push({ ...entry, dir })
    }
    return candidates
  }

  /** 读入口产物(按 mtime+size 缓存,上限 8MiB);失败返回 undefined。 */
  async function readEntryModule(candidate: ScanCandidate): Promise<string | undefined> {
    try {
      const manifest = JSON.parse(readFileSync(join(candidate.dir, 'package.json'), 'utf8')) as { main?: unknown; exports?: Record<string, unknown> }
      const file = entryFilePath(candidate.dir, manifest)
      if (!file) return undefined
      const stats = await stat(file)
      const key = `${String(stats.mtimeMs)}:${String(stats.size)}`
      const cached = moduleTextCache.get(file)
      if (cached?.key === key) return cached.text
      if (stats.size > 8 * 1024 * 1024) return undefined
      const text = await readFile(file, 'utf8')
      moduleTextCache.set(file, { key, text })
      return text
    } catch (error) {
      note(`source scan:${candidate.pkg}`, error)
      return undefined
    }
  }

  function report(): SourceReport {
    const byEvidence: Record<string, number> = {}
    for (const source of sources.values()) byEvidence[source.evidence] = (byEvidence[source.evidence] ?? 0) + 1
    return { patched, resolved: sources.size, byEvidence, misses: misses.size }
  }

  function dispose(): void {
    uninstall()
    registrations.clear()
    sources.clear()
    misses.clear()
    dirCache.clear()
    packageNameCache.clear()
    moduleTextCache.clear()
    entryCache = null
  }

  /** 把调用栈里的业务文件帧解析成包名;解析不出返回 undefined。 */
  function packageOfFile(file: string): { pkg: string; entryId?: string; baseUrl?: string } | undefined {
    const chains = packageNamesOfFile(file)
    if (chains.length === 0) return undefined
    const loaded = loadedEntries()
    for (const name of chains) {
      const entry = loaded.find((candidate) => candidate.pkg === name)
      if (entry) return { pkg: name, entryId: entry.entryId, baseUrl: entry.baseUrl }
    }
    // 包不在 Loader 入口里(嵌套依赖或入口缓存过期):退回最近的包名。
    return { pkg: chains[0] }
  }

  /** 从文件所在目录向上收集 package.json 的 name(就近优先,最多 8 层)。 */
  function packageNamesOfFile(file: string): string[] {
    const names: string[] = []
    let dir = dirname(file)
    for (let depth = 0; depth < 8; depth += 1) {
      const name = packageNameIn(dir)
      if (name && !names.includes(name)) names.push(name)
      const parent = dirname(dir)
      if (parent === dir) break
      dir = parent
    }
    return names
  }

  function packageNameIn(dir: string): string | null {
    const cached = packageNameCache.get(dir)
    if (cached !== undefined) return cached
    let name: string | null = null
    try {
      // 同步读:注册拦截在同步路径上;package.json 只有几百字节,且按目录缓存。
      const parsed = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { name?: unknown }
      if (typeof parsed.name === 'string' && parsed.name) name = parsed.name
    } catch {
      name = null
    }
    packageNameCache.set(dir, name)
    return name
  }

  /** fiber 兜底:栈拿不到时用 Loader 入口;作用域铸造 fiber 的 entry 属于造作用域的插件,不可用。 */
  function packageOfFiber(fiber: unknown): { packageName?: string; entryId?: string; baseUrl?: string; fiberName?: string } {
    const candidate = fiber as { name?: unknown; runtime?: { name?: unknown } } | null | undefined
    const fiberName = typeof candidate?.name === 'string' ? candidate.name : undefined
    if (candidate?.runtime?.name === 'scope') return { fiberName }
    const entry = entryOfFiber(fiber)
    if (!entry) return { fiberName }
    const spec = typeof entry.options?.name === 'string' ? entry.options.name : ''
    if (!spec) return { fiberName }
    return {
      packageName: packageOfSpecifier(spec),
      entryId: typeof entry.id === 'string' ? entry.id : undefined,
      baseUrl: entry.parent?.tree?.ctx?.baseUrl,
      fiberName,
    }
  }

  /** 注册包目录(pluginPackages 解析);拿不到返回 undefined。 */
  function packageDir(spec: string, baseUrl: string | undefined): string | undefined {
    const key = `${spec}\u0000${baseUrl ?? ''}`
    const cached = dirCache.get(key)
    if (cached !== undefined) return cached ?? undefined
    let dir: string | undefined
    try {
      const packages = ctx.get('pluginPackages') as { packageOf?: (spec: string, parent: string) => { dir?: unknown } | undefined } | undefined
      const resolved = baseUrl ? packages?.packageOf?.(spec, baseUrl) : undefined
      if (typeof resolved?.dir === 'string' && resolved.dir) dir = resolved.dir
    } catch (error) {
      note('pluginPackages.packageOf', error)
    }
    dirCache.set(key, dir ?? null)
    return dir
  }
}

const EVIDENCE_LABEL: Record<ToolSourceEvidence, string> = {
  registry: '注册时捕获（调用栈定位到注册方）',
  catalog: 'DSH 官方工具目录',
  scan: '入口产物里唯一一处同名定义（推断）',
  mcp: 'MCP 命名约定',
  fallback: '无可用证据',
}

/** 工具名要足够独特才值得扫源码:短名(bash/read)在产物里到处都是,扫了只会误判。 */
function isDistinctive(name: string): boolean {
  return name.length >= 6 && (name.includes('_') || name.length >= 10)
}

function containsQuoted(text: string, name: string): boolean {
  return text.includes(`"${name}"`) || text.includes(`'${name}'`) || text.includes(`\`${name}\``)
}

/** 描述探针:取首行、压空白,至少 24 字符才值得比对(短句在产物里到处都是)。 */
function descriptionProbe(description: string | undefined): string {
  if (typeof description !== 'string') return ''
  const first = description.split(/\r?\n/)[0]?.replace(/\s+/g, ' ').trim() ?? ''
  return first.length >= 24 ? first.slice(0, 80) : ''
}

function containsDescription(text: string, description: string | undefined): boolean {
  const probe = descriptionProbe(description)
  return probe !== '' && text.includes(probe)
}

/** `@scope/pkg/sub` → `@scope/pkg`;`pkg/sub` → `pkg`。 */
function packageOfSpecifier(spec: string): string {
  const parts = spec.split('/')
  return spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
}

/** 包短名:去掉 scope,`@jia-tools/dsh-session-bridge` 显示为 `dsh-session-bridge`。 */
function shortPackage(pkg: string): string {
  return pkg.startsWith('@') ? pkg.split('/').slice(1).join('/') : pkg
}

/** 本地化标题:meta.title 可以是字符串或 `{ en, zh }`;中文优先,英文兜底。 */
function localizedTitle(meta: unknown): string | undefined {
  if (!meta || typeof meta !== 'object') return undefined
  const title = (meta as { title?: unknown }).title
  if (typeof title === 'string' && title.trim()) return title.trim()
  if (title && typeof title === 'object') {
    const record = title as Record<string, unknown>
    for (const key of ['zh', 'zh-CN', 'en']) {
      const text = record[key]
      if (typeof text === 'string' && text.trim()) return text.trim()
    }
  }
  return undefined
}

/** fiber.entry 是 loader 写的归属(子插件继承最近的入口),取到即可。 */
function entryOfFiber(fiber: unknown): EntryLike | undefined {
  let cursor = fiber as { entry?: unknown; parent?: { fiber?: unknown } } | null | undefined
  for (let depth = 0; cursor && depth < 24; depth += 1) {
    if (cursor.entry) return cursor.entry as EntryLike
    const parent = cursor.parent?.fiber as typeof cursor
    if (!parent || parent === cursor) return undefined
    cursor = parent
  }
  return undefined
}

/** 读 fiber 上的 `tools.register()` effect 标签,判断这个入口是否注册过工具。 */
function fiberHasToolEffect(fiber: unknown): boolean {
  try {
    const effects = (fiber as { getEffects?: () => unknown })?.getEffects?.()
    if (!Array.isArray(effects)) return false
    return effects.some((effect) => (effect as { label?: unknown } | null)?.label === 'tools.register()')
  } catch {
    return false
  }
}

/**
 * 调用栈里第一个业务文件帧。
 *
 * 分两段跳过:先跳过本插件自己的帧(整包单文件),再跳过 cordis / tools 服务的代理帧;
 * 之后那帧**即使又落回本插件**也要接受——本插件自己注册工具时,调用方确实是自己。
 */
function callerFile(): string | undefined {
  try {
    const previous = Error.stackTraceLimit
    Error.stackTraceLimit = 64
    const error = new Error()
    Error.stackTraceLimit = previous
    const files: string[] = []
    for (const line of (error.stack ?? '').split('\n')) {
      const match = /file:\/\/\/[^\s)]+/.exec(line)
      if (!match) continue
      // 栈帧形如 file:///D:/x/index.js:2391:33,末尾的行列号要先剥掉,否则路径永远对不上。
      files.push(normalizePath(fileURLToPath(match[0].replace(/:\d+(?::\d+)?$/, ''))))
    }
    let index = 0
    while (index < files.length && SELF_FILE && files[index] === SELF_FILE) index += 1
    while (index < files.length && FRAMEWORK_MARKERS.some((marker) => files[index].includes(marker))) index += 1
    return files[index]
  } catch {
    /* 栈不可用(裁剪过的运行时)时退回 fiber 归属 */
    return undefined
  }
}

/** 统一成正斜杠、小写比较;非 Windows 原样返回(路径比较大小写敏感)。 */
function normalizePath(value: string): string {
  const unified = value.replace(/\\/g, '/')
  return process.platform === 'win32' ? unified.toLowerCase() : unified
}

/** package.json 的入口文件:exports["."] 的 default/import,其次 main,最后 lib/index.js。 */
function entryFilePath(dir: string, manifest: { main?: unknown; exports?: Record<string, unknown> }): string | undefined {
  const exportsField = manifest.exports?.['.']
  const target = typeof exportsField === 'string' ? exportsField : pickExportTarget(exportsField)
  if (target && !isAbsolute(target)) return join(dir, target)
  if (typeof manifest.main === 'string' && manifest.main) return join(dir, manifest.main)
  return join(dir, 'lib/index.js')
}

function pickExportTarget(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (!value || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  for (const key of ['default', 'import', 'require']) {
    const target = record[key]
    if (typeof target === 'string') return target
  }
  return undefined
}

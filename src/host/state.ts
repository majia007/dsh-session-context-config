/**
 * 状态文件的读写形状:路径、默认值、以及把磁盘上的任意 JSON 归一化成当前版本。
 *
 * 归一化是**读入时**的唯一入口:手改坏了的字段一律被静默丢弃并回落到默认值,
 * 面板与装配只面对结构完整的状态,不必各自防御。
 */
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { normalizeBaseline, type BaselineFlags } from '../baseline.ts'
import {
  DEFAULT_PROFILES,
  DEFER,
  ENVIRONMENT_CONTEXT,
  FORCE,
  OFF,
  ON,
  OPTIONAL_CONTEXT_NAMES,
  SEARCH_TOOL_NAME,
  SESSIONS_LIMIT,
  VERSION,
  WORKING_DIRECTORY_CONTEXT,
  type ContextProfile,
  type PersonaSlot,
} from './constants.ts'

/** 状态文件形状;落在 $DSH_HOME/session-context-config.json。 */
export interface PluginState {
  version: number
  lastUsedId: string
  /** 工作区键(规范化 cwd) -> 该工作区最近选择的档位;新会话按它取默认档位。 */
  lastUsedByWorkspace: Record<string, string>
  profiles: ContextProfile[]
  sessions: Record<string, string>
  baseline: BaselineFlags
}

export function homeDirectory(): string {
  return process.env.DSH_HOME || join(homedir(), '.dsh')
}

export function statePath(): string {
  return join(homeDirectory(), 'session-context-config.json')
}

/** 改名前的状态文件,只在迁移时读一次。 */
export function legacyStatePath(): string {
  return join(homeDirectory(), 'context-profile.json')
}

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function defaultState(): PluginState {
  return {
    version: VERSION,
    lastUsedId: 'none',
    lastUsedByWorkspace: {},
    profiles: JSON.parse(JSON.stringify(DEFAULT_PROFILES)),
    sessions: {},
    baseline: normalizeBaseline(undefined),
  }
}

/**
 * 写一条会话→档位记录并维持有界(SESSIONS_LIMIT):重复写入移到「最新」端,
 * 超限淘汰最旧。会话被 dispose 不代表记录作废——同 sessionId 可被宿主 resume
 * 复用,不能按事件删;被淘汰的会话重开时回落 lastUsedId。
 */
export function recordSession(state: PluginState, sessionId: string, profileId: string): void {
  delete state.sessions[sessionId]
  state.sessions[sessionId] = profileId
  const ids = Object.keys(state.sessions)
  const excess = ids.length - SESSIONS_LIMIT
  if (excess > 0) for (const id of ids.slice(0, excess)) delete state.sessions[id]
}

/** 工作区映射的有界保留条数(与 sessions 同一套「最近写入在最前」的淘汰方式)。 */
export const WORKSPACES_LIMIT = 200

/**
 * 工作区键:会话头 cwd 规范化后的绝对路径。
 * Windows 大小写不敏感(`D:\Work` 与 `d:\work` 是同一目录),统一小写;其余平台保持原样。
 * 拿不到 cwd 时返回 null。
 */
export function workspaceKey(cwd: unknown): string | null {
  if (typeof cwd !== 'string' || cwd.trim().length === 0) return null
  const absolute = resolve(cwd)
  return process.platform === 'win32' ? absolute.toLowerCase() : absolute
}

/**
 * 该工作区新建会话要用的档位。
 * 有工作区记录就用记录;没有则「不处理」——**不回退 lastUsedId**:那是别的工作区
 * (或旧版本)的选择,带过来正是「在 zen 选的 chat 跟到新工作区」那个问题。
 * 拿不到 cwd 时才用 lastUsedId 兜底(宿主没有会话头时的旧行为)。
 */
export function lastUsedFor(state: PluginState, cwd: unknown): string {
  const key = workspaceKey(cwd)
  if (key === null) return state.lastUsedId
  return state.lastUsedByWorkspace[key] ?? 'none'
}

/** 记录「该工作区最近一次选择的档位」,并同步全局 lastUsedId(无 cwd 场景的兜底)。 */
export function recordLastUsed(state: PluginState, cwd: unknown, profileId: string): void {
  state.lastUsedId = profileId
  const key = workspaceKey(cwd)
  if (key === null) return
  delete state.lastUsedByWorkspace[key]
  state.lastUsedByWorkspace[key] = profileId
  const keys = Object.keys(state.lastUsedByWorkspace)
  const overflow = keys.length - WORKSPACES_LIMIT
  if (overflow > 0) for (const id of keys.slice(0, overflow)) delete state.lastUsedByWorkspace[id]
}

const GROUP_STATES = new Set([ON, DEFER, OFF, FORCE])
const TOOL_STATES = new Set([ON, DEFER, OFF, FORCE])

/** 「开启」是默认值,不落盘:状态表里只记与默认不同的项。 */
function normalizeGroupStates(input: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (!input || typeof input !== 'object') return out
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (typeof key !== 'string' || !GROUP_STATES.has(value as string)) continue
    if (value !== ON) out[key] = value as string
  }
  return out
}

/** 只存 false:缺省=注入,与 groups/tools 的「默认值不落盘」一致。 */
function normalizeContexts(input: unknown): Record<string, boolean> {
  const out: Record<string, boolean> = {}
  if (!input || typeof input !== 'object') return out
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (typeof key !== 'string' || !key) continue
    if (value === false) out[key] = false
  }
  return out
}

/** 只存 false:缺省=包含,与 contexts 同一套「默认值不落盘」规则。
 *  deployment:persona-*、tool:* 与 mcp:<server> 都不进通配表:人设走专用开关;
 *  tool:* 强绑定工具的启用状态、mcp:<server> 强绑定对应 server 的启用状态(来源隐藏时
 *  自动隐藏配套注入,不做单独配置),旧状态残留在这里剪掉。 */
function normalizeSections(input: unknown): Record<string, boolean> {
  const out = normalizeContexts(input)
  for (const name of Object.keys(out)) {
    if (name.startsWith('tool:') || name.startsWith('mcp:') || name.startsWith('deployment:persona-')) delete out[name]
  }
  return out
}

/** 只存 OFF:通道键是 `source.kind`,第三方插件可以随时新增,不能按白名单裁剪;
 *  面板里已知的两条通道只是有专门文案,其余 kind 由自动清单展示。 */
function normalizeChannels(input: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (!input || typeof input !== 'object') return out
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (typeof key !== 'string' || !key || key === '__proto__') continue
    if (value === OFF) out[key] = OFF
  }
  return out
}

function normalizeToolStates(input: unknown, states: Set<string>): Record<string, string> {
  const out: Record<string, string> = {}
  if (!input || typeof input !== 'object') return out
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (typeof key !== 'string' || !states.has(value as string) || value === ON) continue
    out[key] = value as string
  }
  return out
}

function normalizeSummaries(input: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (!input || typeof input !== 'object') return out
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (typeof key !== 'string' || typeof value !== 'string' || !value.trim()) continue
    out[key] = value.trim().slice(0, 200)
  }
  return out
}

function normalizeProfile(raw: unknown, index: number, legacyEnvironmentFactsOff: boolean, legacyBaseline: BaselineFlags): ContextProfile {
  const record = (raw ?? {}) as {
    id?: unknown
    name?: unknown
    description?: unknown
    prompt?: {
      mode?: unknown
      /** 当前形状:prefix / suffix 两个独立槽位。 */
      prefix?: unknown
      suffix?: unknown
      /** 旧扁平形状(整体作用于 prefix):enabled/override/text。 */
      enabled?: unknown
      override?: unknown
      text?: unknown
    }
    contexts?: unknown
    sections?: unknown
    /** 旧字段:runtimeContext:false = 所有可选上下文关闭。 */
    runtimeContext?: unknown
    /** 旧字段:workingDirectory:false = 当前工作目录关闭。 */
    workingDirectory?: unknown
    channels?: unknown
    /** 是否注入重复触发的 skill;缺省=true(与宿主默认一致)。 */
    injectDuplicateSkills?: unknown
    /** 是否把注入消息排到用户消息之前发送;缺省=false(保持宿主顺序)。 */
    injectedFirst?: unknown
    /** 是否对 skill 工具结果去重;缺省=false(宿主原样)。 */
    dedupeSkillToolResults?: unknown
    /** 是否跳过已完整 read 过的同内容工作区指令;缺省=false(宿主原样)。 */
    dedupeReadInstructions?: unknown
    /** ask_user_question 等待改写:-1 关闭超时,N>0 秒数;缺省=不介入。 */
    askUserTimeout?: unknown
    /** 旧字段(语义相反):dedupeSkillInjection=true 表示不重复注入。 */
    dedupeSkillInjection?: unknown
    groups?: unknown
    servers?: unknown
    tools?: unknown
    summaries?: unknown
    /** 本档位的附加规则;缺省时从旧顶层 baseline 复制。 */
    baseline?: unknown
  }
  const id = typeof record?.id === 'string' && /^[a-z0-9][a-z0-9-]{0,40}$/.test(record.id)
    ? record.id
    : `profile-${index + 1}`
  const prompt = (record?.prompt ?? {}) as {
    mode?: unknown
    prefix?: unknown
    suffix?: unknown
    enabled?: unknown
    override?: unknown
    text?: unknown
  }
  const normalizeSlot = (raw: unknown): PersonaSlot => {
    const slot = (raw ?? {}) as { enabled?: unknown; override?: unknown; text?: unknown }
    return {
      enabled: typeof slot.enabled === 'boolean' ? slot.enabled : true,
      override: typeof slot.override === 'boolean' ? slot.override : false,
      text: typeof slot.text === 'string' ? slot.text.slice(0, 20000) : '',
    }
  }
  // v2 的 mode: inherit=沿用; replace/complete=覆盖人设前缀。complete 的「整段独占」
  // 已移除,迁移时按 replace 处理(文本保留,其它 system 段保持可见)。
  const legacyOverride = prompt.mode === 'replace' || prompt.mode === 'complete'
  // 旧扁平 prompt 整体迁到 prefix 槽位;suffix 槽位从无到有,默认沿用部署。
  const prefix = prompt.prefix !== undefined
    ? normalizeSlot(prompt.prefix)
    : normalizeSlot({
        enabled: prompt.enabled,
        override: typeof prompt.override === 'boolean' ? prompt.override : legacyOverride,
        text: prompt.text,
      })
  const suffix = prompt.suffix !== undefined ? normalizeSlot(prompt.suffix) : normalizeSlot(undefined)
  const contexts = normalizeContexts(record?.contexts)
  // contexts 一旦存在就是新模型,旧字段不再参与;旧状态则一次性迁移成逐项 false。
  if (record?.contexts === undefined) {
    if (record?.runtimeContext === false) {
      for (const name of OPTIONAL_CONTEXT_NAMES) contexts[name] = false
    }
    if (record?.workingDirectory === false) contexts[WORKING_DIRECTORY_CONTEXT] = false
    if (legacyEnvironmentFactsOff) contexts[ENVIRONMENT_CONTEXT] = false
  }
  // tool_search 由 planFor 自动管理,旧状态里的键读入即剪掉,面板与装配都不再看到它。
  const tools = normalizeToolStates(record?.tools, TOOL_STATES)
  delete tools[SEARCH_TOOL_NAME]
  return {
    id,
    name: typeof record?.name === 'string' && record.name.trim() ? record.name.trim().slice(0, 60) : id,
    description: typeof record?.description === 'string' ? record.description.slice(0, 200) : '',
    prompt: { prefix, suffix },
    contexts,
    sections: normalizeSections(record?.sections),
    channels: normalizeChannels(record?.channels),
    // 旧字段语义相反:dedupeSkillInjection=true 迁移成「不注入重复正文」,其余按默认注入。
    injectDuplicateSkills: typeof record?.injectDuplicateSkills === 'boolean'
      ? record.injectDuplicateSkills
      : record?.dedupeSkillInjection !== true,
    injectedFirst: record?.injectedFirst === true,
    dedupeSkillToolResults: record?.dedupeSkillToolResults === true,
    dedupeReadInstructions: record?.dedupeReadInstructions === true,
    // ask_user_question 改写:只接受 -1 或正整数秒;其它值(0、负数、小数、字符串)读入即丢,
    // 落回「不介入」——宁可保持宿主行为,也不要拿坏值去注册遮蔽工具。
    ...(typeof record?.askUserTimeout === 'number' && Number.isInteger(record.askUserTimeout)
      && (record.askUserTimeout === -1 || record.askUserTimeout >= 1)
      ? { askUserTimeout: record.askUserTimeout }
      : {}),
    groups: normalizeGroupStates(record?.groups),
    servers: normalizeGroupStates(record?.servers),
    tools,
    summaries: normalizeSummaries(record?.summaries),
    // 新档位自带 baseline;旧档位没有时复制旧顶层 baseline(结构迁移,不改值)。
    baseline: record?.baseline === undefined
      ? normalizeBaseline(legacyBaseline)
      : normalizeBaseline(record.baseline),
  }
}

/**
 * 版本 2/3/4 可读:旧版本只做**结构迁移**——2 的 prompt.mode/complete 语义、
 * 旧 contexts 字段、缺失的新字段与状态版本;所有档位的值(名称/组/提示词/开关)
 * 原样保留。`DEFAULT_PROFILES` 只用于首次安装,不参与旧状态加载或替换。
 */
export function normalizeState(raw: unknown): PluginState {
  const base = defaultState()
  const record = raw as { version?: unknown; profiles?: unknown; sessions?: unknown; lastUsedId?: unknown; lastUsedByWorkspace?: unknown; baseline?: unknown } | null | undefined
  if (!record || (record.version !== 2 && record.version !== 3 && record.version !== VERSION)) return base
  // 旧的全局「环境事实」开关迁到每个档位的 contexts;旧顶层 baseline 复制进每个
  // 缺失 baseline 的档位(结构迁移,值不变);新状态不再有 baseline.environmentFacts。
  const rawBaseline = record.baseline
  const normalizedBaseline = normalizeBaseline(rawBaseline)
  const legacyEnvironmentFactsOff = (rawBaseline as { environmentFacts?: unknown } | undefined)?.environmentFacts === false
  const rawProfiles = record.profiles as unknown[]
  const profiles = Array.isArray(rawProfiles) && rawProfiles.length > 0
    ? rawProfiles.map((profile, index) => normalizeProfile(profile, index, legacyEnvironmentFactsOff, normalizedBaseline))
    : base.profiles
  const seen = new Set<string>()
  const unique = profiles.filter((profile) => {
    if (seen.has(profile.id)) return false
    seen.add(profile.id)
    return true
  })
  const sessions: Record<string, string> = {}
  if (record.sessions && typeof record.sessions === 'object') {
    for (const [key, value] of Object.entries(record.sessions as Record<string, unknown>)) {
      if (typeof key !== 'string' || !key) continue
      if (value === 'none' || unique.some((profile) => profile.id === value)) sessions[key] = value as string
    }
  }
  // 有界保留(见 recordSession):超限的旧状态文件读入时同样淘汰最旧的映射。
  const sessionIds = Object.keys(sessions)
  for (const id of sessionIds.slice(0, Math.max(0, sessionIds.length - SESSIONS_LIMIT))) delete sessions[id]
  const lastUsedId = record.lastUsedId === 'none' || unique.some((p) => p.id === record.lastUsedId)
    ? record.lastUsedId as string
    : 'none'
  // 工作区映射只保留有效档位;旧状态没有该字段时为空(新会话按「不处理」起步)。
  const lastUsedByWorkspace: Record<string, string> = {}
  const rawWorkspaces = record.lastUsedByWorkspace
  if (rawWorkspaces && typeof rawWorkspaces === 'object') {
    for (const [key, value] of Object.entries(rawWorkspaces as Record<string, unknown>)) {
      if (typeof key !== 'string' || !key || key === '__proto__') continue
      if (typeof value !== 'string') continue
      if (value !== 'none' && !unique.some((profile) => profile.id === value)) continue
      lastUsedByWorkspace[key] = value
    }
  }
  const workspaceKeys = Object.keys(lastUsedByWorkspace)
  for (const key of workspaceKeys.slice(0, Math.max(0, workspaceKeys.length - WORKSPACES_LIMIT))) delete lastUsedByWorkspace[key]
  return {
    version: VERSION,
    lastUsedId,
    lastUsedByWorkspace,
    profiles: unique,
    sessions,
    // 顶层 baseline 只保留给子代理解析不到根档位时的兜底;面板按档位编辑。
    baseline: normalizedBaseline,
  }
}

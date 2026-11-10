/**
 * 状态文件的读写形状:路径、默认值、以及把磁盘上的任意 JSON 归一化成当前版本。
 *
 * 归一化是**读入时**的唯一入口:手改坏了的字段一律被静默丢弃并回落到默认值,
 * 面板与装配只面对结构完整的状态,不必各自防御。
 */
import { homedir } from 'node:os'
import { join } from 'node:path'
import { normalizeBaseline, type BaselineFlags } from '../baseline.ts'
import {
  CHANNEL_IDS,
  DEFAULT_PROFILES,
  DEFER,
  ENVIRONMENT_CONTEXT,
  FORCE,
  OFF,
  ON,
  OPTIONAL_CONTEXT_NAMES,
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

const GROUP_STATES = new Set([ON, DEFER, OFF, FORCE])
const TOOL_STATES = new Set([ON, DEFER, OFF])

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
 *  tool:* 是工具引导段(跟随工具可用性,由工具目录控制),deployment:persona-* 由
 *  人设专用开关控制——两者都不进通配表,旧状态里的残留在这里剪掉。 */
function normalizeSections(input: unknown): Record<string, boolean> {
  const out = normalizeContexts(input)
  for (const name of Object.keys(out)) {
    if (name.startsWith('tool:') || name.startsWith('deployment:persona-')) delete out[name]
  }
  return out
}

function normalizeChannels(input: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (!input || typeof input !== 'object') return out
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (CHANNEL_IDS.has(key) && value === OFF) out[key] = OFF
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

function normalizeProfile(raw: unknown, index: number, legacyEnvironmentFactsOff: boolean): ContextProfile {
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
    groups?: unknown
    servers?: unknown
    tools?: unknown
    summaries?: unknown
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
  return {
    id,
    name: typeof record?.name === 'string' && record.name.trim() ? record.name.trim().slice(0, 60) : id,
    description: typeof record?.description === 'string' ? record.description.slice(0, 200) : '',
    prompt: { prefix, suffix },
    contexts,
    sections: normalizeSections(record?.sections),
    channels: normalizeChannels(record?.channels),
    groups: normalizeGroupStates(record?.groups),
    servers: normalizeGroupStates(record?.servers),
    tools: normalizeToolStates(record?.tools, TOOL_STATES),
    summaries: normalizeSummaries(record?.summaries),
  }
}

/** 版本 2/3/4 可读:2 的 prompt.mode 与 complete 语义在 normalizeProfile 里一次性迁移;
 *  v3 升级到 v4 时把三个内置档位的定义就地替换(新增 devtools 分组、人设双槽位、默认的延迟策略)。 */
export function normalizeState(raw: unknown): PluginState {
  const base = defaultState()
  const record = raw as { version?: unknown; profiles?: unknown; sessions?: unknown; lastUsedId?: unknown; baseline?: unknown } | null | undefined
  if (!record || (record.version !== 2 && record.version !== 3 && record.version !== VERSION)) return base
  // 旧的全局「环境事实」开关迁到每个档位的 contexts;新状态不再有 baseline.environmentFacts。
  const legacyBaseline = record.baseline as { environmentFacts?: unknown } | undefined
  const legacyEnvironmentFactsOff = legacyBaseline?.environmentFacts === false
  const rawProfiles = record.profiles as unknown[]
  const profiles = Array.isArray(rawProfiles) && rawProfiles.length > 0
    ? rawProfiles.map((profile, index) => normalizeProfile(profile, index, legacyEnvironmentFactsOff))
    : base.profiles
  const seen = new Set<string>()
  let unique = profiles.filter((profile) => {
    if (seen.has(profile.id)) return false
    seen.add(profile.id)
    return true
  })
  // v2/v3 → v4:内置三档就地换新定义;自定义档位原样保留(不新增内置档位,
  // 用户若删过某个内置档位,保持删除状态)。
  if (record.version !== VERSION) {
    const defaults = new Map(DEFAULT_PROFILES.map((profile) => [profile.id, profile]))
    unique = unique.map((profile) => {
      const replacement = defaults.get(profile.id)
      return replacement === undefined ? profile : JSON.parse(JSON.stringify(replacement)) as ContextProfile
    })
  }
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
  return {
    version: VERSION,
    lastUsedId,
    profiles: unique,
    sessions,
    baseline: normalizeBaseline(record.baseline),
  }
}

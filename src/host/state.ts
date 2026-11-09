/**
 * 状态文件的读写形状:路径、默认值、以及把磁盘上的任意 JSON 归一化成当前版本。
 *
 * 归一化是**读入时**的唯一入口:手改坏了的字段一律被静默丢弃并回落到默认值,
 * 面板与装配只面对结构完整的状态,不必各自防御。
 */
import { homedir } from 'node:os'
import { join } from 'node:path'
import { normalizeBaseline, BASELINE_DEFAULTS, type BaselineFlags } from '../baseline.ts'
import { CHANNEL_IDS, DEFAULT_PROFILES, DEFER, FORCE, OFF, ON, VERSION, type ContextProfile } from './constants.ts'

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
    baseline: { ...BASELINE_DEFAULTS },
  }
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

function normalizeProfile(raw: unknown, index: number): ContextProfile {
  const record = (raw ?? {}) as {
    id?: unknown
    name?: unknown
    description?: unknown
    prompt?: { mode?: unknown; text?: unknown }
    runtimeContext?: unknown
    channels?: unknown
    groups?: unknown
    servers?: unknown
    tools?: unknown
    summaries?: unknown
  }
  const id = typeof record?.id === 'string' && /^[a-z0-9][a-z0-9-]{0,40}$/.test(record.id)
    ? record.id
    : `profile-${index + 1}`
  const prompt = (record?.prompt ?? {}) as { mode?: unknown; text?: unknown }
  return {
    id,
    name: typeof record?.name === 'string' && record.name.trim() ? record.name.trim().slice(0, 60) : id,
    description: typeof record?.description === 'string' ? record.description.slice(0, 200) : '',
    prompt: {
      mode: (['inherit', 'replace', 'complete'] as const).includes(prompt.mode as 'inherit')
        ? prompt.mode as ContextProfile['prompt']['mode']
        : 'inherit',
      text: typeof prompt.text === 'string' ? prompt.text.slice(0, 20000) : '',
    },
    runtimeContext: record?.runtimeContext !== false,
    channels: normalizeChannels(record?.channels),
    groups: normalizeGroupStates(record?.groups),
    servers: normalizeGroupStates(record?.servers),
    tools: normalizeToolStates(record?.tools, TOOL_STATES),
    summaries: normalizeSummaries(record?.summaries),
  }
}

/** 版本不符即整份作废:旧版本的字段语义不同,逐字段迁移不如让用户重选一次。 */
export function normalizeState(raw: unknown): PluginState {
  const base = defaultState()
  const record = raw as { version?: unknown; profiles?: unknown; sessions?: unknown; lastUsedId?: unknown; baseline?: unknown } | null | undefined
  if (!record || record.version !== VERSION) return base
  const rawProfiles = record.profiles as unknown[]
  const profiles = Array.isArray(rawProfiles) && rawProfiles.length > 0
    ? rawProfiles.map(normalizeProfile)
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

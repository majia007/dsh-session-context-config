/**
 * 状态文件的读写形状：路径、默认值、以及把磁盘上的任意 JSON 归一化成当前版本。
 *
 * 归一化是**读入时**的唯一入口：手改坏了的字段一律被静默丢弃并回落到默认值，
 * 面板与装配只面对结构完整的状态，不必各自防御。
 */
import { homedir } from 'node:os'
import { join } from 'node:path'
import { normalizeBaseline, BASELINE_DEFAULTS } from '../baseline.js'
import { CHANNEL_IDS, DEFAULT_PROFILES, DEFER, FORCE, OFF, ON, VERSION } from './constants.js'

export function homeDirectory() {
  return process.env.DSH_HOME || join(homedir(), '.dsh')
}

export function statePath() {
  return join(homeDirectory(), 'session-context-config.json')
}

/** 改名前的状态文件，只在迁移时读一次。 */
export function legacyStatePath() {
  return join(homeDirectory(), 'context-profile.json')
}

export function messageOf(error) {
  return error instanceof Error ? error.message : String(error)
}

export function defaultState() {
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

/** 「开启」是默认值，不落盘：状态表里只记与默认不同的项。 */
function normalizeGroupStates(input) {
  const out = {}
  if (!input || typeof input !== 'object') return out
  for (const [key, value] of Object.entries(input)) {
    if (typeof key !== 'string' || !GROUP_STATES.has(value)) continue
    if (value !== ON) out[key] = value
  }
  return out
}

function normalizeChannels(input) {
  const out = {}
  if (!input || typeof input !== 'object') return out
  for (const [key, value] of Object.entries(input)) {
    if (CHANNEL_IDS.has(key) && value === OFF) out[key] = OFF
  }
  return out
}

function normalizeToolStates(input, states) {
  const out = {}
  if (!input || typeof input !== 'object') return out
  for (const [key, value] of Object.entries(input)) {
    if (typeof key !== 'string' || !states.has(value) || value === ON) continue
    out[key] = value
  }
  return out
}

function normalizeSummaries(input) {
  const out = {}
  if (!input || typeof input !== 'object') return out
  for (const [key, value] of Object.entries(input)) {
    if (typeof key !== 'string' || typeof value !== 'string' || !value.trim()) continue
    out[key] = value.trim().slice(0, 200)
  }
  return out
}

function normalizeProfile(raw, index) {
  const id = typeof raw?.id === 'string' && /^[a-z0-9][a-z0-9-]{0,40}$/.test(raw.id)
    ? raw.id
    : `profile-${index + 1}`
  return {
    id,
    name: typeof raw?.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 60) : id,
    description: typeof raw?.description === 'string' ? raw.description.slice(0, 200) : '',
    prompt: {
      mode: ['inherit', 'replace', 'complete'].includes(raw?.prompt?.mode) ? raw.prompt.mode : 'inherit',
      text: typeof raw?.prompt?.text === 'string' ? raw.prompt.text.slice(0, 20000) : '',
    },
    runtimeContext: raw?.runtimeContext !== false,
    channels: normalizeChannels(raw?.channels),
    groups: normalizeGroupStates(raw?.groups),
    servers: normalizeGroupStates(raw?.servers),
    tools: normalizeToolStates(raw?.tools, TOOL_STATES),
    summaries: normalizeSummaries(raw?.summaries),
  }
}

/** 版本不符即整份作废：旧版本的字段语义不同，逐字段迁移不如让用户重选一次。 */
export function normalizeState(raw) {
  const base = defaultState()
  if (!raw || raw.version !== VERSION) return base
  const profiles = Array.isArray(raw.profiles) && raw.profiles.length > 0
    ? raw.profiles.map(normalizeProfile)
    : base.profiles
  const seen = new Set()
  const unique = profiles.filter((profile) => {
    if (seen.has(profile.id)) return false
    seen.add(profile.id)
    return true
  })
  const sessions = {}
  if (raw.sessions && typeof raw.sessions === 'object') {
    for (const [key, value] of Object.entries(raw.sessions)) {
      if (typeof key !== 'string' || !key) continue
      if (value === 'none' || unique.some((profile) => profile.id === value)) sessions[key] = value
    }
  }
  const lastUsedId = raw.lastUsedId === 'none' || unique.some((p) => p.id === raw.lastUsedId)
    ? raw.lastUsedId
    : 'none'
  return {
    version: VERSION,
    lastUsedId,
    profiles: unique,
    sessions,
    baseline: normalizeBaseline(raw.baseline),
  }
}

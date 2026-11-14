/**
 * 档位解析(与 Host 同一套规则)——跨端同规则双份的 client 侧。
 * 改这里必须同步 src/host/tools.ts 的 effectiveState,规则原文见 AGENTS.md。
 */
import type { CatalogTool, Profile, Snapshot } from '../contract/types.ts'

export const ON = 'on'
export const DEFER = 'defer'
export const OFF = 'off'
export const FORCE = 'force'

export const NONE = 'none'

export const STATE_LABEL: Record<string, string> = { on: '开启', defer: '延迟', off: '关闭', force: '开启' }

export function effective(profile: Partial<Profile>, tool: { name: string; group: string; server?: string | null }): string {
  const groupState = profile.groups?.[tool.group] ?? ON
  const serverState = tool.server ? profile.servers?.[tool.server] ?? ON : ON
  const toolState = profile.tools?.[tool.name] ?? ON
  if (groupState === FORCE) return ON
  if (toolState === FORCE) return ON
  if (groupState === OFF) return OFF
  if (serverState === FORCE) return ON
  if (serverState === OFF) return OFF
  if (toolState === OFF) return OFF
  if (toolState === DEFER) return DEFER
  if (groupState === DEFER || serverState === DEFER) return DEFER
  return ON
}

export function statsFor(profile: Partial<Profile>, tools: CatalogTool[], presetToolNames: Set<string> | null) {
  let on = 0
  let defer = 0
  let off = 0
  let onTokens = 0
  let deferTokens = 0
  for (const tool of tools) {
    if (presetToolNames && !presetToolNames.has(tool.name)) continue
    const state = effective(profile, tool)
    if (state === ON) {
      on += 1
      onTokens += tool.tokens
    } else if (state === DEFER) {
      defer += 1
      deferTokens += Math.max(8, Math.round(tool.tokens * 0.35))
    } else {
      off += 1
    }
  }
  return { on, defer, off, onTokens, deferTokens }
}

export function formatTokens(value: number): string {
  if (!Number.isFinite(value)) return '—'
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`
  return String(Math.round(value))
}

export function presetNames(snapshot: Snapshot | null, presetId: string | null | undefined): Set<string> | null {
  const preset = snapshot?.presets?.find((item) => item.id === presetId)
  return preset ? new Set(preset.tools.map((tool) => tool.name)) : null
}

/**
 * 档位解析与「延迟」占位:给定一个档位和一个工具名,算它该注入、延迟还是隐藏,
 * 以及延迟时留在 tools 数组里的那份占位定义。
 *
 * 为什么延迟不是删除:占位让 tools 数组整场不变,加载动作不打断前缀缓存。
 * 完整 schema 由 tool_search 以工具结果的形式追加进历史。
 */
import { DEFER, FORCE, GROUPS, OFF, ON, type ContextProfile } from './constants.ts'

/** 工具定义的最小面(占位与骨架只需要这三个字段)。 */
export interface ToolDefinitionLike {
  name: string
  description?: string
  parameters?: unknown
}

export function groupOf(toolName: string): string {
  for (const group of GROUPS) if (group.test(toolName)) return group.id
  return 'other'
}

export function serverOf(toolName: string): string | null {
  if (toolName.startsWith('mcp_connector_')) return 'mcp_connector'
  const match = /^mcp__([a-zA-Z0-9_-]+)__/.exec(toolName)
  return match ? match[1] : null
}

/**
 * 父级只提供默认值;隐藏与强制开启是终态,会压过子项。
 * 自上而下判定:组终态 → server 终态 → 工具终态 → 任一层的“延迟” → 注入。
 */
export function effectiveState(profile: ContextProfile, toolName: string): string {
  const group = groupOf(toolName)
  const server = serverOf(toolName)
  const groupState = profile.groups[group] ?? ON
  const serverState = server ? profile.servers[server] ?? ON : ON
  const toolState = profile.tools[toolName] ?? ON
  if (groupState === FORCE) return ON
  if (groupState === OFF) return OFF
  if (serverState === FORCE) return ON
  if (serverState === OFF) return OFF
  if (toolState === OFF) return OFF
  if (toolState === DEFER) return DEFER
  if (groupState === DEFER || serverState === DEFER) return DEFER
  return ON
}

/** 只留必需参数的结构,可选参数交给 tool_search。 */
export function skeleton(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(skeleton)
  if (!schema || typeof schema !== 'object') return schema
  const out: Record<string, unknown> = {}
  const required = new Set(Array.isArray((schema as Record<string, unknown>).required) ? (schema as Record<string, unknown>).required as unknown[] : [])
  for (const [key, value] of Object.entries(schema as Record<string, unknown>)) {
    if (key === 'additionalProperties' || key === 'title' || key === 'examples' || key === 'default') continue
    if (key === 'properties' && value && typeof value === 'object') {
      out.properties = {}
      for (const [name, child] of Object.entries(value as Record<string, unknown>)) {
        if (!required.has(name)) continue
        ;(out.properties as Record<string, unknown>)[name] = skeleton(child)
      }
      continue
    }
    out[key] = skeleton(value)
  }
  if (out.properties && Object.keys(out.properties).length === 0) delete out.properties
  if (Array.isArray(out.enum) && (out.enum as unknown[]).length > 8) delete out.enum
  return out
}

export function firstSentence(text: unknown): string {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim()
  if (!clean) return ''
  const cut = clean.split(/(?<=[。．！？.!?])\s*/)[0] ?? clean
  return cut.length <= 60 ? cut : `${cut.slice(0, 58)}…`
}

/** 摘要优先级:server 手写 > 组手写 > 原描述首句 > 工具名。 */
export function summaryFor(profile: ContextProfile, toolName: string, description: string | undefined): string {
  const group = groupOf(toolName)
  const server = serverOf(toolName)
  return (
    profile.summaries[server ?? ''] ??
    profile.summaries[group] ??
    firstSentence(description) ??
    toolName
  ) || toolName
}

export function placehold(schema: ToolDefinitionLike, summary: string): { name: string; description: string; parameters: unknown } {
  return {
    name: schema.name,
    description: `【延迟】${summary}（完整参数用 tool_search）`,
    parameters: skeleton(schema.parameters ?? { type: 'object', properties: {} }),
  }
}

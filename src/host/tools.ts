/**
 * 档位解析与「延迟」占位:给定一个档位和一个工具名,算它该注入、延迟还是隐藏,
 * 以及延迟时留在 tools 数组里的那份占位定义。
 *
 * 为什么延迟不是删除:占位让 tools 数组整场不变,加载动作不打断前缀缓存。
 * 完整 schema 由 tool_search 以工具结果的形式追加进历史。
 */
import { DEFER, FORCE, GROUPS, OFF, ON, type ContextProfile } from './constants.ts'
import { TOOL_GUIDE_GROUPS, TOOL_GUIDE_MEMBERS } from '../tool-guides.ts'

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
 * 自上而下判定:组终态 → 工具强制开启 → server 终态 → 工具终态 → 任一层的“延迟” → 注入。
 *
 * 工具级的 force 是给「其余全部延迟、只把几个工具提回注入」这种配置用的:
 * 组只承载默认值,没有它就只能逐个把不要的工具写成 off。
 */
export function effectiveState(profile: ContextProfile, toolName: string): string {
  const group = groupOf(toolName)
  const server = serverOf(toolName)
  const groupState = profile.groups[group] ?? ON
  const serverState = server ? profile.servers[server] ?? ON : ON
  const toolState = profile.tools[toolName] ?? ON
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

/**
 * 工具引导段是否应随工具一起隐藏。
 *
 * 宿主不少 tool:* 段是无条件静态文本(pwsh/jobs/goal/workflow),工具被隐藏后
 * 仍会返回正文;这里按「段所属组隐藏」或「单个工具隐藏」两种终态自动裁掉,
 * 不依赖段文本自己是否为空。`jobs`/`goal`/`schedule` 等复合段走别名组。
 */
export function hiddenToolGuide(profile: ContextProfile | null | undefined, sectionName: string): boolean {
  if (!profile || !sectionName.startsWith('tool:')) return false
  const toolName = sectionName.slice(5)
  const alias = TOOL_GUIDE_GROUPS[toolName]
  // 复合段(jobs/goal/schedule/session-query)的段名不是工具名:先看别名组终态,
  // 再要求至少一个真实成员工具仍处于开启/延迟。
  if (alias) {
    if ((profile.groups?.[alias] ?? ON) === OFF) return true
    const members = TOOL_GUIDE_MEMBERS[toolName]
    if (members) return members.every((name) => effectiveState(profile, name) === OFF)
    return false
  }
  const group = groupOf(toolName)
  if ((profile.groups?.[group] ?? ON) === OFF) return true
  return effectiveState(profile, toolName) === OFF
}

/**
 * 参数骨架:去掉说明/示例/默认值/标题,但**保留每个参数的名称与类型**。
 *
 * 早先只留 required 参数,省 token 更多,但会让模型/执行层看不到可选参数的类型:
 * 布尔/数字被当成字符串传(实测 `plugin_manager` 的 `enabled: false` 报
 * "must be a boolean")。参数类型是调用契约的一部分,不能省;能省的是描述文本。
 */
export function skeleton(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(skeleton)
  if (!schema || typeof schema !== 'object') return schema
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(schema as Record<string, unknown>)) {
    if (key === 'additionalProperties' || key === 'title' || key === 'examples' || key === 'default' || key === 'description') continue
    if (key === 'properties' && value && typeof value === 'object') {
      out.properties = {}
      for (const [name, child] of Object.entries(value as Record<string, unknown>)) {
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

/** 延迟占位描述的固定前缀:既是模型看到的标记,也是来源解析识别「这不是原注册」的依据。 */
export const DEFERRED_DESCRIPTION_PREFIX = '【延迟】'

export function placehold(schema: ToolDefinitionLike, summary: string): { name: string; description: string; parameters: unknown } {
  return {
    name: schema.name,
    description: `${DEFERRED_DESCRIPTION_PREFIX}${summary}（完整参数用 tool_search）`,
    parameters: skeleton(schema.parameters ?? { type: 'object', properties: {} }),
  }
}

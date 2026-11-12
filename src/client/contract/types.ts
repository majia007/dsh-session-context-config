/**
 * 域间共享的形状契约(只有类型):快照、档位、工具条目、live 会话与工具状态。
 * Host 侧的权威定义在 src/host/constants.ts 与 src/host/state.ts,这里镜像 client
 * 实际消费的字段;改 Host 形状时同步这里。
 */
import type { BaselineFlags } from '../../baseline.ts'

/** 工具来源的判定等级:scan 是推断,其余是事实来源。 */
export type ToolSourceEvidence = 'registry' | 'catalog' | 'scan' | 'mcp' | 'fallback'

/** 工具来源(面板在工具名下显示短名,tooltip 里给完整依据)。 */
export interface ToolSource {
  kind: 'mcp' | 'plugin' | 'unknown'
  label: string
  detail: string
  evidence: ToolSourceEvidence
}

/** 目录里的工具条目(快照 tools 数组元素)。 */
export interface CatalogTool {
  name: string
  description: string
  group: string
  server: string | null
  chars: number
  tokens: number
  modes?: string[]
  source?: ToolSource
}

/** 部署人设的一个固定槽位(prefix/suffix 各一份,独立开关与覆盖)。 */
export interface PersonaSlot {
  enabled: boolean
  override: boolean
  text: string
}

/** 档位(面板草稿与快照 profiles 数组元素)。 */
export interface Profile {
  id: string
  name: string
  description: string
  /** 两个独立的人设槽位:关掉=不发送;覆盖=用 text 替换部署文本。 */
  prompt: { prefix: PersonaSlot; suffix: PersonaSlot }
  /** 运行时上下文名 -> false 表示不注入;缺省=注入。 */
  contexts: Record<string, boolean>
  /** 系统提示段名 -> false 表示不进入 system 消息;缺省=包含。 */
  sections: Record<string, boolean>
  channels: Record<string, string>
  groups: Record<string, string>
  servers: Record<string, string>
  tools: Record<string, string>
  summaries: Record<string, string>
}

/** live 根会话投影。 */
export interface LiveSession {
  sessionId: string
  preset: string | null
  blank: boolean
  profileId: string | null
  deferred: number
  hidden: number
  loaded: number
}

/** 附加规则开关(全局层):三段固定提示词 + 自定义文本(勾选才注入,未勾选也可编辑)。
 *  直接复用 Host 侧的类型,避免两边字段漂移时无人报错。 */
export type BaselineState = BaselineFlags

/** 快照(GET /api/state 的返回)。 */
export interface Snapshot {
  ok: boolean
  version: number
  profiles: Profile[]
  lastUsedId: string
  sessions: Record<string, string>
  baseline: BaselineState
  presets: Array<{ id: string; name: string; tools: CatalogTool[] }>
  defaultPreset: string
  tools: CatalogTool[]
  groups: Array<{ id: string; title: string }>
  /** 当前 live 会话的完整 system 段目录(名称 + 字符数,按实际装配顺序);无 live 会话时为空数组。 */
  sections: Array<{ name: string; chars: number }>
  live: LiveSession[]
  diagnostics: unknown[]
}

/** 会话内工具状态(GET /api/session 的返回)。 */
export interface SessionStatus {
  ok: boolean
  sessionId: string
  profileId: string
  blank: boolean
  tools: Array<{ name: string; group: string; server: string | null; state: string; loaded: boolean }>
}

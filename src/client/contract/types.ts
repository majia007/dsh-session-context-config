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
  /** 本档位的附加规则;旧宿主快照可能没有。 */
  baseline?: BaselineState
  channels: Record<string, string>
  /** 本档位是否注入重复触发的 skill;缺省(旧宿主快照)按注入处理,false=不重复注入。 */
  injectDuplicateSkills?: boolean
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

/** system 段目录项:正文用于面板 title(与请求里的文本同源),chars 用于体量标签。 */
export interface PromptSectionState {
  name: string
  chars: number
  text?: string
}

/** 运行时上下文目录项:被关掉的影子与条件上下文会是空 text,面板据此显示状态。 */
export interface PromptContextState {
  name: string
  chars: number
  text?: string
}

/** 已知注入通道的最新一条消息(卡片 title)。 */
export interface ChannelPreview {
  text: string
  chars: number
  truncated?: boolean
}

/** 自动发现的注入消息(source.kind + 出现次数 + 最新正文)。 */
export interface ObservedChannel {
  kind: string
  count: number
  chars: number
  text: string
  truncated?: boolean
}

/** 快照(GET /api/state 的返回)。 */
export interface Snapshot {
  ok: boolean
  version: number
  profiles: Profile[]
  /** 当前插件版本内置的默认预设(新建档位模板);旧宿主可能不返回。 */
  defaults?: Profile[]
  lastUsedId: string
  sessions: Record<string, string>
  baseline: BaselineState
  presets: Array<{ id: string; name: string; tools: CatalogTool[] }>
  defaultPreset: string
  tools: CatalogTool[]
  groups: Array<{ id: string; title: string }>
  /** 当前 live 会话的完整 system 段目录(名称 + 字符数 + 正文,按实际装配顺序);无 live 会话时为空数组。 */
  sections: PromptSectionState[]
  /** 当前 live 会话注册的全部运行时上下文(含空文本/被关掉的影子),按宿主 order 排序。 */
  contexts?: PromptContextState[]
  /** 按档位分组的两条已知通道最新正文:只含使用该档位的 live 根会话。 */
  channelsByProfile?: Record<string, Record<string, ChannelPreview>>
  /** 按档位分组的 user 消息注入来源(含第三方插件);面板只取当前档位。 */
  observedChannelsByProfile?: Record<string, ObservedChannel[]>
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

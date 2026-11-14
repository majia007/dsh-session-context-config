/** 面板的状态选项表、消息卡片元数据与系统段目录(UI 呈现层)。 */
import type { SegmentedControlOption } from '@deepseek-ai/dsh-client-ui-primitives'

/** 组与 server 共用一套四态，位置即优先级：开启(force) → 关闭(off) → 延迟(defer) → 默认(on)。
 *  左边的能覆盖右边的；同号时靠上的层（组）优先，但同号结果相同，不产生差异。
 *  每个选项带 `title`：宿主的 SegmentedControl 直接把它渲染成 tab 的原生提示，
 *  用来讲清「开启」与「默认」在组层的差别——前者压过行级设置，后者只给默认值。 */
export const GROUP_STATES: SegmentedControlOption[] = [
  { value: 'force', label: '开启', title: '强制注入：压过下层的关闭与延迟，下层设置全部失效' },
  { value: 'off', label: '关闭', title: '关闭：不注入，也不进 tools 数组，tool_search 取不到' },
  { value: 'defer', label: '延迟', title: '延迟：保留名字与参数骨架的占位，模型按需经 tool_search 取完整定义' },
  { value: 'on', label: '默认', title: '默认：本层只提供默认值，下层的设置照常生效' },
]

/** 组头问号标记的总说明：组层的「开启/默认」只差一件事——是否压过行级设置。 */
export const GROUP_STATE_HINT = '「开启」强制本组全部注入，忽略工具行的设置；「关闭」全部不注入；「延迟」保留占位、按需加载；「默认」只给默认值，工具行的设置照常生效。'

/** 工具行同一套词：开启=强制注入(压过组)、关闭=本工具不注入、延迟=软默认、默认=跟随组。 */
export const TOOL_STATES: SegmentedControlOption[] = [
  { value: 'force', label: '开启', title: '开启：本工具一律注入，压过组与 server 的关闭和延迟' },
  { value: 'off', label: '关闭', title: '关闭：本工具不注入，也不进 tools 数组' },
  { value: 'defer', label: '延迟', title: '延迟：保留占位定义，需要时经 tool_search 加载' },
  { value: 'on', label: '默认', title: '默认：跟随组与 server 的设置' },
]

/**
 * 运行时上下文的**已知**元数据。
 *
 * 真正的名单由 `/api/state` 的 `contexts` 动态补齐(装配时注册了什么就列什么),
 * 这张表只提供中文名、说明与 UI 顺序,并负责把「子代理身份」「委派深度」这类
 * 名字整理成一行;新版本/第三方插件新增的上下文没有表项也会按原始 name 出现。
 * 缺省=注入,档位里只存 false。
 */
export interface ContextOption {
  id: string
  label: string
  desc: string
  order: number
  /** 一个 UI 行可以合并多个同义上下文名(如 spawn/fork 的 depth)。 */
  contexts: string[]
}

export const CONTEXT_SWITCHES: ContextOption[] = [
  {
    id: 'workingDirectory',
    label: '当前工作目录',
    desc: 'Current working directory: "<path>". 每个会话以 user 身份注入；目录变化时追加新快照。',
    order: 100,
    contexts: ['working-directory:current'],
  },
  {
    id: 'sandbox',
    label: '沙箱 / 文件策略',
    desc: 'read-only / workspace-write / danger-full-access 与可写目录。每个会话以 user 身份注入；权限变化时追加新快照。',
    order: 110,
    contexts: ['sandbox:policy'],
  },
  {
    id: 'approval',
    label: '审批策略',
    desc: '审批提示是开启还是禁用。每个会话以 user 身份注入；策略变化时追加新快照。',
    order: 115,
    contexts: ['approval:policy'],
  },
  {
    id: 'subagentIdentity',
    label: '根代理身份',
    desc: '当前 agent 的身份声明（根代理名称；有 send_message / list_agents 时附使用提示）。位于运行时上下文快照（<system-reminder> 消息）里，每个会话以 user 身份注入。',
    order: 118,
    contexts: ['subagent:identity'],
  },
  {
    id: 'subagentDepth',
    label: '子代理委派深度',
    desc: '到达最大委派深度时的限制提示。仅在子代理到上限时以 user 身份注入；未到上限时为空。',
    order: 120,
    contexts: ['tool:subagent:depth', 'tool:subagent_fork:depth'],
  },
  {
    id: 'environment',
    label: '环境事实',
    desc: 'platform / shell / git 分支与工作树状态。每个会话以 user 身份注入一次，探测后固定。',
    order: 130,
    contexts: ['session-context-config:environment'],
  },
  {
    id: 'harnessSource',
    label: 'DSH 源码 checkout · 快照路径',
    desc: 'DSH 自身源码检出路径（不是当前项目目录）。对应「系统说明段」在上面的 system 卡里单独开关。',
    order: 200,
    contexts: ['harness:source'],
  },
  {
    id: 'webSurface',
    label: 'DSH Web GUI 地址 · 快照 URL',
    desc: '当前 DSH Web GUI 的 URL。对应「系统说明段」在上面的 system 卡里单独开关。',
    order: 210,
    contexts: ['app:web-surface'],
  },
]

/** 动态上下文行的兜底元数据:原始 name 至少保证面板能列出来并开关。 */
export function inferContextOption(name: string): ContextOption {
  if (name === 'subagent:delegation') {
    return { id: name, label: '子代理委派说明', desc: '子代理专用：说明委派关系与工具使用方式；只在子代理装配里出现。', order: 120, contexts: [name] }
  }
  if (name.startsWith('tool:') && name.endsWith(':depth')) {
    const tool = name.slice(5, -6)
    return { id: name, label: `${tool} 委派深度`, desc: '到达该委派工具最大深度时的限制提示；未到上限时为空。', order: 120, contexts: [name] }
  }
  return { id: name, label: name, desc: '宿主或第三方插件注册的运行时上下文；出现时生效。', order: 1000, contexts: [name] }
}

/** 消息通道卡:每条通道是独立 user 消息,卡内仍用一行 checkbox + 描述。 */
export interface ChannelCardOption {
  key: 'workspaceInstructions' | 'timeContext'
  /** 该通道对应的 `source.kind`;面板用它取最新正文并排除进「其他注入消息」清单。 */
  source: 'agent-instructions' | 'time-context'
  title: string
  note: string
  label: string
  desc: string
}

export const CHANNEL_CARDS: ChannelCardOption[] = [
  {
    key: 'workspaceInstructions',
    source: 'agent-instructions',
    title: '工作区指令',
    note: '独立 user 消息；会话开始/工作区或指令变化时注入，文件变更追加增量。关闭只影响后续请求，已写入会话记录的消息不会被删除。悬停行可看最近一次注入正文。',
    label: '注入工作区指令',
    desc: '~/.dsh/AGENTS.md、项目各级 AGENTS.md/CLAUDE.md、*.local.md 与子目录指令。',
  },
  {
    key: 'timeContext',
    source: 'time-context',
    title: '时间采样',
    note: '每个模型请求（step）准备阶段检查一次；距上次注入不足 10 分钟则不注入。宿主默认 refreshIntervalMs = 600000（10 分钟），部署可改；设为 0 才会每个 eligible step 都注入。悬停行可看最近一次注入正文。',
    label: '注入时间采样',
    desc: 'Time sampled while preparing turn T, step S: 时间戳[时区]；附带与上一条模型可见消息/上次注入的间隔。',
  },
]

/** 已知通道的 source.kind;自动清单会排除它们,避免与两张专用卡片重复。 */
export const KNOWN_CHANNEL_SOURCES: Set<string> = new Set(CHANNEL_CARDS.map((option) => option.source))

/** 已知通道的界面 id;手动输入 kind 时也排除,否则会与专用卡重复。 */
export const KNOWN_CHANNEL_IDS: Set<string> = new Set(CHANNEL_CARDS.map((option) => option.key))

export type SectionGroup = 'host' | 'tool' | 'conditional'

export interface SectionOption {
  name: string
  label: string
  desc: string
  group: SectionGroup
  order?: number
  /** 部署人设槽位:渲染成「开关 + 覆盖 + 文本」三件套,而不是普通段开关。 */
  persona?: 'prefix' | 'suffix'
}

/** 已知系统段目录:label/desc/order 只是呈现层信息,真正的名单由 /api/state 的 sections 动态补齐。
 *  `tool:*` 不在这里:工具引导强绑定工具的启用状态,面板不提供单独开关。 */
export const SECTION_OPTIONS: SectionOption[] = [
  { name: 'harness:identity', label: 'Harness 身份声明', desc: '固定开头：You are an AI agent powered by DeepSeek Harness.', group: 'host', order: -1000 },
  {
    name: 'deployment:persona-prefix',
    label: '部署人设（前置）',
    desc: '你是谁：角色、语气、能力边界与工作方式的总设定。位于固定身份声明之后、所有第一方指导之前；改它会从第一个变化 token 起失去前缀缓存。',
    group: 'host',
    order: 0,
    persona: 'prefix',
  },
  { name: 'subagent-roles:catalog', label: '子代理角色目录', desc: 'explore / reviewer / general 三个角色的用途与限制；来自 dsh-subagent-roles。', group: 'host', order: 300 },
  { name: 'context:file-reference', label: '文件引用规则', desc: '@ 路径、相对/绝对路径、目录尾斜杠等读法说明。', group: 'host', order: 900 },
  { name: 'ui:deliverable-file-references', label: '文件展示与链接规则', desc: 'present 的使用时机、图片/文件链接格式、Markdown 路径写法。', group: 'host', order: 9000 },
  { name: 'harness:source', label: 'DSH 源码 checkout 说明', desc: '说明 checkout 路径与当前工作目录是两回事；对应快照路径在快照卡另有开关。', group: 'host', order: 10000 },
  { name: 'app:web-surface', label: 'Web GUI 说明', desc: '说明「这个页面」指当前 GUI、HMR 与重建刷新规则；对应快照 URL 在快照卡另有开关。', group: 'host', order: 10100 },
  {
    name: 'deployment:persona-suffix',
    label: '部署人设（后缘）',
    desc: '收尾叮嘱：环境提醒、输出格式、最后一条硬约束。位于所有第一方指导之后、提示词最尾部；改它不影响前面可复用的前缀缓存。',
    group: 'host',
    order: 10200,
    persona: 'suffix',
  },

  { name: 'tools:ptc-only', label: 'PTC 模式说明', desc: 'PTC 执行器启用时生效。', group: 'conditional', order: 800 },
  { name: 'tools:sdk', label: '工具 SDK 说明', desc: 'PTC 执行器启用时生效。', group: 'conditional', order: 5000 },
  { name: 'plan:policy', label: '计划模式规则', desc: '会话处于计划模式时生效。', group: 'conditional', order: 500 },
  { name: 'team:policy', label: '团队协作规则', desc: '团队插件启用时生效。', group: 'conditional', order: 600 },
  { name: 'browser-use:stagehand-native', label: '浏览器使用引导', desc: '浏览器使用插件启用时生效。', group: 'conditional', order: 3000 },
  { name: 'computer-use:cua-driver-native', label: 'Computer Use 引导', desc: 'Computer Use 插件启用时生效。', group: 'conditional', order: 3000 },
  { name: 'mcp-resource-servers', label: 'MCP 资源服务器', desc: 'MCP 资源服务器清单；出现时生效。', group: 'conditional', order: 3100 },
]

/** 动态段(如 mcp:<server>)的兜底元数据:原始 name 至少保证面板能列出来并开关。 */
export function inferSectionOption(name: string): SectionOption {
  if (name.startsWith('mcp:')) {
    return { name, label: `MCP：${name.slice(4)}`, desc: 'MCP 服务器指令；由该 server 提供。', group: 'conditional' }
  }
  if (name.startsWith('tool:')) {
    const tool = name.slice(5)
    return { name, label: `${tool} 工具引导`, desc: '工具使用引导；只影响提示词文本。', group: 'tool' }
  }
  return { name, label: name, desc: '宿主或插件注册的未识别段。', group: 'host' }
}

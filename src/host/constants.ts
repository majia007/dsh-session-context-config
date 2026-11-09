/**
 * 档位模型的常量:状态字面量、组表、通道表、内置档位与 token 估算系数。
 *
 * Host 与 Client 各自持有一份同规则的档位解析(见 AGENTS.md「跨端同规则双份」),
 * 这里只放 Host 侧;Client 那份在 src/client/state/resolve.ts,改一侧必须同步另一侧。
 */

export const VERSION = 4

export const ON = 'on'
export const DEFER = 'defer'
export const OFF = 'off'
export const FORCE = 'force'

/**
 * 部署人设的一个固定槽位(prefix 在 order 0,紧随 harness:identity;suffix 在 10200,
 * 整个提示词的末尾)。
 * - enabled=false:该槽位不发送(agent 作用域注册同名空影子)。
 * - enabled=true + override=false:沿用部署文本(personaPrefix/personaSuffix)。
 * - enabled=true + override=true:text 为空 = 不发送,非空 = 替换该槽位。
 */
export interface PersonaSlot {
  enabled: boolean
  override: boolean
  text: string
}

/** 档位形状:groups/servers/tools 只记与默认(on)不同的项;contexts/sections 只记关掉的项。 */
export interface ContextProfile {
  id: string
  name: string
  description: string
  /** 部署人设的两个固定槽位,各自独立开关与覆盖。 */
  prompt: { prefix: PersonaSlot; suffix: PersonaSlot }
  /** 运行时上下文名 -> false 表示不注入;缺省(或 true)表示注入。 */
  contexts: Record<string, boolean>
  /** 系统提示段名 -> false 表示不进入 system 消息;缺省(或 true)表示包含。 */
  sections: Record<string, boolean>
  channels: Record<string, string>
  groups: Record<string, string>
  servers: Record<string, string>
  tools: Record<string, string>
  summaries: Record<string, string>
}

/** 部署人设前缀段名;agent 作用域注册同名段即可替换它。 */
export const PERSONA_SECTION = 'deployment:persona-prefix'
/** 前缀段的 order 名;宿主 getSectionOrder 认这个键。 */
export const PERSONA_ORDER_NAME = 'DEPLOYMENT_PERSONA_PREFIX'
/** 部署人设后缀段名;人设开关/覆盖时与前缀一起处理。 */
export const PERSONA_SUFFIX_SECTION = 'deployment:persona-suffix'
/** 后缀段的 order 名。 */
export const PERSONA_SUFFIX_ORDER_NAME = 'DEPLOYMENT_PERSONA_SUFFIX'

/** 组是 UI 的分组,同时也是第一级开关。 */
export const GROUPS: ReadonlyArray<{ id: string; title: string; test: (name: string) => boolean }> = [
  { id: 'files', title: '文件', test: (n) => /^(read|write|edit|apply_patch|read_image)$/.test(n) },
  { id: 'search', title: '搜索', test: (n) => /^(glob|grep|session_search|session_event_)/.test(n) },
  { id: 'terminal', title: '终端与任务', test: (n) => /^(pwsh|bash|job_|terminal_)/.test(n) },
  { id: 'interaction', title: '交互', test: (n) => /^(ask_user_question|todo_write|present)$/.test(n) },
  { id: 'skill', title: '技能与网络', test: (n) => /^(skill|web_fetch|web_search)$/.test(n) },
  { id: 'delegation', title: '协作', test: (n) => /^(subagent|send_message|list_agents|interrupt_agent|list_subagent_models|wait_agent|spawn_teammate|team_task)/.test(n) },
  { id: 'workflow', title: '编排与计划', test: (n) => /^(workflow|exit_plan_mode|plan_mode|propose_action|ralph)$/.test(n) },
  { id: 'goal', title: '目标', test: (n) => /^(create_goal|get_goal|update_goal)$/.test(n) },
  { id: 'schedule', title: '调度', test: (n) => /^schedule_/.test(n) },
  { id: 'mcp', title: 'MCP', test: (n) => n.startsWith('mcp_connector_') || n.startsWith('mcp__') },
  // 运行时基础:工作目录、随包依赖路径、语言服务——任何档位都保留。
  { id: 'platform', title: '平台', test: (n) => /^(load_workspace_dependencies|working_directory|lsp)/.test(n) },
  // 插件开发/宿主诊断:非常用,完整档延迟,精简与极简隐藏。
  { id: 'devtools', title: '插件开发', test: (n) => /^(plugin_manager|cordis_)/.test(n) },
  { id: 'other', title: '其他', test: () => true },
]

/** 通道拦截:把这两类“档位模型之外”的注入消息从发给模型的请求里滤掉。 */
export const CHANNELS = [
  { id: 'workspaceInstructions', source: 'agent-instructions' },
  { id: 'timeContext', source: 'time-context' },
]

export const CHANNEL_IDS = new Set(CHANNELS.map((channel) => channel.id))

/** 当前工作目录的运行时上下文名;宿主标了 required,关掉它必须做同名 shadow + assemble 过滤。 */
export const WORKING_DIRECTORY_CONTEXT = 'working-directory:current'

/** 本插件的环境事实上下文;注册在 host/environment.ts,由档位的 contexts 逐项控制。 */
export const ENVIRONMENT_CONTEXT = 'session-context-config:environment'
export const ENVIRONMENT_CONTEXT_ORDER = 130

/** 旧档位 runtimeContext:false 的含义是「所有可选运行时上下文都关」;cwd 不在其中。 */
export const OPTIONAL_CONTEXT_NAMES = [
  'sandbox:policy',
  'approval:policy',
  'tool:subagent:depth',
  'tool:subagent_fork:depth',
  ENVIRONMENT_CONTEXT,
  'harness:source',
  'app:web-surface',
] as const

/** 关掉一个上下文时注册同名 shadow 用的 order 名;宿主 getContextOrder 认这些键。 */
export const CONTEXT_ORDER_NAMES: Record<string, string> = {
  [WORKING_DIRECTORY_CONTEXT]: 'WORKING_DIRECTORY',
  'sandbox:policy': 'SANDBOX_POLICY',
  'approval:policy': 'APPROVAL_POLICY',
  'tool:subagent:depth': 'SUBAGENT_DELEGATION',
  'tool:subagent_fork:depth': 'SUBAGENT_DELEGATION',
  'harness:source': 'HARNESS_SOURCE',
  'app:web-surface': 'WEB_SURFACE',
}

/** getContextOrder 不可用时的兜底;环境事实是本插件自己的 order,其余未知段用 0。 */
export const CONTEXT_ORDER_FALLBACK: Record<string, number> = {
  [ENVIRONMENT_CONTEXT]: ENVIRONMENT_CONTEXT_ORDER,
}

const OFF_OPTIONAL_CONTEXTS = Object.fromEntries(OPTIONAL_CONTEXT_NAMES.map((name) => [name, false])) as Record<string, boolean>

export const MINIMAL_PROMPT =
  '你是一个精简的编码代理。只做用户明确要求的事：先读后改，改动最小，不要扩展范围。\n' +
  '回复用中文，先说结论，不重复用户已知的信息。遇到不确定的取舍就问一句。'

export const DEFAULT_PROFILES: ContextProfile[] = [
  {
    id: 'full',
    name: '完整',
    description: '全部能力开启；编排、目标、调度、插件开发、MCP 与第三方工具延迟加载。',
    prompt: {
      prefix: { enabled: true, override: false, text: '' },
      suffix: { enabled: true, override: false, text: '' },
    },
    contexts: {},
    sections: {},
    channels: {},
    groups: { workflow: DEFER, goal: DEFER, schedule: DEFER, mcp: DEFER, devtools: DEFER, other: DEFER },
    servers: {},
    tools: {},
    summaries: {},
  },
  {
    id: 'lean',
    name: '精简',
    description: '在完整基础上隐藏编排与计划、调度、目标、插件开发；MCP 与第三方工具保持延迟。',
    prompt: {
      prefix: { enabled: true, override: false, text: '' },
      suffix: { enabled: true, override: false, text: '' },
    },
    contexts: {},
    sections: {},
    channels: {},
    groups: { workflow: OFF, goal: OFF, schedule: OFF, mcp: DEFER, devtools: OFF, other: DEFER },
    servers: {},
    tools: {},
    summaries: {},
  },
  {
    id: 'minimal',
    name: '极简',
    description: '只留读写、搜索、终端与运行目录/依赖路径；交互、技能与网络、协作、编排、目标、调度、MCP、插件开发与第三方工具全部隐藏。',
    prompt: {
      prefix: { enabled: true, override: true, text: MINIMAL_PROMPT },
      suffix: { enabled: true, override: false, text: '' },
    },
    contexts: { ...OFF_OPTIONAL_CONTEXTS },
    sections: {},
    channels: {},
    groups: {
      interaction: OFF,
      skill: OFF,
      delegation: OFF,
      workflow: OFF,
      goal: OFF,
      schedule: OFF,
      mcp: OFF,
      devtools: OFF,
      other: OFF,
    },
    servers: {},
    tools: {},
    summaries: {},
  },
]

/** 占位定义按字符数估算 token 的系数;只用于面板里的成本提示,不参与决策。 */
export const TOKEN_PER_CHAR = 0.28

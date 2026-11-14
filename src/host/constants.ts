/**
 * 档位模型的常量:状态字面量、组表、通道表、内置档位与 token 估算系数。
 *
 * Host 与 Client 各自持有一份同规则的档位解析(见 AGENTS.md「跨端同规则双份」),
 * 这里只放 Host 侧;Client 那份在 src/client/state/resolve.ts,改一侧必须同步另一侧。
 */
import { BASELINE_DEFAULTS, type BaselineFlags } from '../baseline.ts'

export const VERSION = 4

export const ON = 'on'
export const DEFER = 'defer'
export const OFF = 'off'
export const FORCE = 'force'

/** 延迟加载的基础设施工具名:由 planFor 自动注入/隐藏,不进档位表。 */
export const SEARCH_TOOL_NAME = 'tool_search'

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
  /** 本档位的附加规则(四段);子代理跟随所属根会话的档位。 */
  baseline: BaselineFlags
  channels: Record<string, string>
  /** 是否注入用户 `/技能名` 手势触发的重复技能正文:默认 true(与宿主行为一致);false 时同一份正文已在可见历史里就不再追加。 */
  injectDuplicateSkills: boolean
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

/**
 * sessions 映射的有界保留条数。宿主 dispose 一个 agent 后,同一 sessionId 仍可被
 * resume 复用(切回旧会话 = 同 id 重新 agent/created,见 api/session-controller 的
 * resolve),因此不能按 dispose 事件删条目;只保留最近写入的条数,被淘汰的会话
 * 重开时回落 lastUsedId。
 */
export const SESSIONS_LIMIT = 500

/** 通道拦截:把这两类“档位模型之外”的注入消息从发给模型的请求里滤掉。 */
export const CHANNELS = [
  { id: 'workspaceInstructions', source: 'agent-instructions' },
  { id: 'timeContext', source: 'time-context' },
]

/** 当前工作目录的运行时上下文名;宿主标了 required,关掉它必须做同名 shadow + assemble 过滤。 */
export const WORKING_DIRECTORY_CONTEXT = 'working-directory:current'

/** 本插件的环境事实上下文;注册在 host/environment.ts,由档位的 contexts 逐项控制。 */
export const ENVIRONMENT_CONTEXT = 'session-context-config:environment'
export const ENVIRONMENT_CONTEXT_ORDER = 130

/**
 * 根代理身份上下文(tool-subagent-control 全局注册,required):root 名称与
 * send_message / list_agents 的使用提示。面板按普通上下文逐项开关;关掉时同
 * 其它上下文一样注册空影子,让 refreshContext 不会把它补回来。
 */
export const SUBAGENT_IDENTITY_CONTEXT = 'subagent:identity'

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
  [SUBAGENT_IDENTITY_CONTEXT]: 'SUBAGENT_DELEGATION',
  'tool:subagent:depth': 'SUBAGENT_DELEGATION',
  'tool:subagent_fork:depth': 'SUBAGENT_DELEGATION',
  'harness:source': 'HARNESS_SOURCE',
  'app:web-surface': 'WEB_SURFACE',
}

/** getContextOrder 不可用时的兜底;环境事实是本插件自己的 order,其余未知段用 0。 */
export const CONTEXT_ORDER_FALLBACK: Record<string, number> = {
  [ENVIRONMENT_CONTEXT]: ENVIRONMENT_CONTEXT_ORDER,
  [SUBAGENT_IDENTITY_CONTEXT]: 120,
}

/** 人设槽位工厂:每个档位持独立对象,避免默认预设之间共享可变引用。 */
function emptySlot(): PersonaSlot {
  return { enabled: true, override: false, text: '' }
}

function closedSlot(): PersonaSlot {
  return { enabled: false, override: false, text: '' }
}

/**
 * 极简档位的部署人设文案。它是插件通用预设的一部分,不是用户当前配置;
 * 旧 v2/v3 状态迁移不会把它注入用户档位。
 */
export const MINIMAL_PROMPT =
  '你是一个精简的编码代理。只做用户明确要求的事：先读后改，改动最小，不要扩展范围。\n' +
  '回复用中文，先说结论，不重复用户已知的信息。遇到不确定的取舍就问一句。'

/** 旧档位 runtimeContext:false 的迁移目标:所有可选上下文一次性关掉。 */
const OFF_OPTIONAL_CONTEXTS = Object.fromEntries(OPTIONAL_CONTEXT_NAMES.map((name) => [name, false])) as Record<string, boolean>

/** 新档位的默认附加规则:三段固定提示词开,自定义文本关。 */
function defaultBaseline(): BaselineFlags {
  return { ...BASELINE_DEFAULTS, customText: '' }
}

/** Chat / PI 这类纯净档位的附加规则:全部关闭。 */
function offBaseline(): BaselineFlags {
  return { contract: false, cardReceipt: false, untrustedFiles: false, custom: false, customText: '' }
}

/**
 * PI 档位的初始提示词:身份行 + 行为规则(rules 措辞按 Pi 的 base prompt 风格),
 * 不写 <tools> 清单——每个开启工具的说明由 tools 数组 description 与 tool:*
 * 引导段自动注入(skill 由 skill-catalog 消息引导),提示词里再列一份就与工具面
 * 双份维护(pi 档开 skill 时就被迫同步两处)。与 tool:* 段重复的规则(如 tool:read
 * 的「用 read 不用 cat/sed」)同样不写。
 *
 * Pi 已内建 skills(docs.pi.dev/latest/skills):启动把每个技能的 name/description
 * 注入 system prompt(不放全文),正文由模型按需读取。DSH 的对应机制是
 * skill-catalog 目录消息 + `skill` 工具,因此工具面保留 skill;Pi 没有内建
 * web_fetch/web_search,它们仍按工具逐个关闭。
 *
 * 身份行必须明确写「运行在 DeepSeek Harness、这是 Pi 风格预设,不是 Pi 本身」,
 * 不能伪装成 pi。MCP 是 Pi 1.0+ 的内置扩展,由档位的 MCP 组 + 自动注入的 tool_search 近似,
 * 不写死在这段 base prompt 里(Pi 的 mcp_servers 是动态段)。
 */
export const PI_PROMPT = [
  'You are a coding assistant running inside DeepSeek Harness with a Pi-like configuration. This is a Pi-style preset adapted to DSH, not Pi itself. Help users inspect files, run commands, and modify code.',
  '',
  '<rules>',
  '- Use PowerShell for file operations like listing, searching, and finding files',
  '- Use read_image for images; use read for text files.',
  '- Use edit for precise changes (old_string must match exactly; use replace_all to replace every match).',
  '- Use write only for new files or complete rewrites.',
  '- Be concise in your responses',
  '- Show file paths clearly when working with files',
  '</rules>',
].join('\n')

/**
 * 插件自带的通用预设。它们不是用户当前配置的副本,也不参与旧状态迁移:
 * - 首次安装(没有状态文件)时 defaultState 克隆它们;
 * - 新建档位下拉通过 /api/state 的 defaults 读取它们,选中后复制成 custom-*;
 * - 已安装 state 的 profiles 是用户配置,v2/v3→v4 迁移只做结构转换,不拿这些值替换。
 */
export const DEFAULT_PROFILES: ContextProfile[] = [
  {
    id: 'full',
    name: '完整',
    description: '全部能力开启；编排、目标、调度、插件开发、MCP 与第三方工具延迟加载。',
    prompt: { prefix: emptySlot(), suffix: emptySlot() },
    contexts: {},
    sections: {},
    baseline: defaultBaseline(),
    channels: {},
    injectDuplicateSkills: true,
    groups: { workflow: DEFER, goal: DEFER, schedule: DEFER, mcp: DEFER, devtools: DEFER, other: DEFER },
    servers: {},
    tools: {},
    summaries: {},
  },
  {
    id: 'lean',
    name: '精简',
    description: '在完整基础上隐藏编排与计划、调度、目标、插件开发；MCP 与第三方工具保持延迟。',
    prompt: { prefix: emptySlot(), suffix: emptySlot() },
    contexts: {},
    sections: {},
    baseline: defaultBaseline(),
    channels: {},
    injectDuplicateSkills: true,
    groups: { workflow: OFF, goal: OFF, schedule: OFF, mcp: DEFER, devtools: OFF, other: DEFER },
    servers: {},
    tools: {},
    summaries: {},
  },
  {
    id: 'minimal',
    name: '极简',
    description: '只留读写、搜索、终端与运行目录/依赖路径；交互、技能与网络、协作、编排、目标、调度、MCP、插件开发与第三方工具全部隐藏。',
    prompt: { prefix: { enabled: true, override: true, text: MINIMAL_PROMPT }, suffix: emptySlot() },
    contexts: { ...OFF_OPTIONAL_CONTEXTS },
    sections: {},
    baseline: defaultBaseline(),
    channels: {},
    injectDuplicateSkills: true,
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
  {
    id: 'chat',
    name: 'Chat',
    description: '仅聊天',
    prompt: { prefix: closedSlot(), suffix: closedSlot() },
    contexts: {
      'sandbox:policy': false,
      'approval:policy': false,
      'tool:subagent:depth': false,
      'tool:subagent_fork:depth': false,
      'session-context-config:environment': false,
      'harness:source': false,
      'app:web-surface': false,
      'working-directory:current': false,
      'subagent:identity': false,
    },
    channels: { workspaceInstructions: OFF, timeContext: OFF },
    injectDuplicateSkills: true,
    sections: {
      'harness:source': false,
      'app:web-surface': false,
      'harness:identity': false,
      'context:file-reference': false,
      'ui:deliverable-file-references': false,
      'mcp-resource-servers': false,
    },
    baseline: offBaseline(),
    groups: {
      files: OFF,
      search: OFF,
      terminal: OFF,
      interaction: OFF,
      skill: OFF,
      delegation: OFF,
      workflow: OFF,
      goal: OFF,
      schedule: OFF,
      mcp: OFF,
      platform: OFF,
      other: OFF,
      devtools: OFF,
    },
    servers: {},
    tools: {},
    summaries: {},
  },
  {
    id: 'pi',
    name: 'Pi',
    description: '参考 Pi 设计理念的精简档位：默认 read / write / edit / pwsh / read_image / skill（技能目录随会话注入、正文按需加载），MCP 延迟并由 tool_search 按需加载。',
    prompt: { prefix: { enabled: true, override: true, text: PI_PROMPT }, suffix: { enabled: true, override: true, text: '' } },
    contexts: {
      'sandbox:policy': false,
      'approval:policy': false,
      'tool:subagent:depth': false,
      'tool:subagent_fork:depth': false,
      'session-context-config:environment': false,
      'harness:source': false,
      'app:web-surface': false,
      'subagent:identity': false,
    },
    sections: {
      'harness:identity': false,
      'context:file-reference': false,
      'harness:source': false,
      'app:web-surface': false,
      'ui:deliverable-file-references': false,
    },
    baseline: offBaseline(),
    // Pi 启动就把技能 name/description 注入 system prompt,skill-catalog 通道不关。
    channels: {},
    injectDuplicateSkills: true,
    groups: {
      search: OFF,
      interaction: OFF,
      delegation: OFF,
      workflow: OFF,
      goal: OFF,
      schedule: OFF,
      // Pi 1.5.x 的 MCP 是内置扩展，工具默认按 codemode/deferred 暴露，不在初始声明里。
      // DSH 没有 codemode，这里用「MCP 延迟 + tool_search」近似。
      mcp: DEFER,
      platform: OFF,
      devtools: OFF,
      // other 组保留默认开启;tool_search 由 planFor 自动注入,不在档位表里配置。
      other: ON,
    },
    // files / terminal / skill 三组保持默认开启,只把 Pi 没有的成员逐个关掉;
    // read_image 是 DSH 对 Pi read 图片能力的对应实现,skill 是 Pi 按需读取技能
    // 正文机制的 DSH 对应(目录由 skill-catalog 消息注入,DSH 目录不带路径,
    // 模型不能像 Pi 那样直接 read SKILL.md);Pi 没有内建网络工具,web_fetch /
    // web_search 保持关闭。MCP 组用 defer 近似 Pi 的 codemode/deferred 暴露;
    // tool_search 由 planFor 按「是否有其它延迟工具」自动注入。
    tools: {
      apply_patch: OFF,
      job_kill: OFF,
      job_list: OFF,
      job_output: OFF,
      terminal_close: OFF,
      terminal_list: OFF,
      terminal_open: OFF,
      terminal_read: OFF,
      terminal_send: OFF,
      terminal_signal: OFF,
      session_recall: OFF,
      web_extract: OFF,
      web_fetch: OFF,
      web_search: OFF,
    },
    servers: {},
    summaries: {},
  },
]

/** 占位定义按字符数估算 token 的系数;只用于面板里的成本提示,不参与决策。 */
export const TOKEN_PER_CHAR = 0.28

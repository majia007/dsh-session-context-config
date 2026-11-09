/**
 * 档位模型的常量:状态字面量、组表、通道表、内置档位与 token 估算系数。
 *
 * Host 与 Client 各自持有一份同规则的档位解析(见 AGENTS.md「跨端同规则双份」),
 * 这里只放 Host 侧;Client 那份在 src/client/state/resolve.ts,改一侧必须同步另一侧。
 */
export const VERSION = 2;
export const ON = 'on';
export const DEFER = 'defer';
export const OFF = 'off';
export const FORCE = 'force';
/** 组是 UI 的分组,同时也是第一级开关。 */
export const GROUPS = [
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
    { id: 'platform', title: '平台', test: (n) => /^(plugin_manager|load_workspace_dependencies|cordis_|working_directory|lsp)/.test(n) },
    { id: 'other', title: '其他', test: () => true },
];
/** 通道拦截:把这两类“档位模型之外”的注入消息从发给模型的请求里滤掉。 */
export const CHANNELS = [
    { id: 'workspaceInstructions', source: 'agent-instructions' },
    { id: 'timeContext', source: 'time-context' },
];
export const CHANNEL_IDS = new Set(CHANNELS.map((channel) => channel.id));
export const MINIMAL_PROMPT = '你是一个精简的编码代理。只做用户明确要求的事：先读后改，改动最小，不要扩展范围。\n' +
    '回复用中文，先说结论，不重复用户已知的信息。遇到不确定的取舍就问一句。';
export const DEFAULT_PROFILES = [
    {
        id: 'full',
        name: '完整',
        description: '与模式一致，不过滤、不延迟。',
        prompt: { mode: 'inherit', text: '' },
        runtimeContext: true,
        channels: {},
        groups: {},
        servers: {},
        tools: {},
        summaries: {},
    },
    {
        id: 'lean',
        name: '精简',
        description: '隐藏连接器治理、平台、调度、目标；MCP 其余延迟。',
        prompt: { mode: 'inherit', text: '' },
        runtimeContext: true,
        channels: {},
        groups: { mcp: DEFER, platform: OFF, schedule: OFF, goal: OFF },
        servers: {},
        tools: {},
        summaries: {},
    },
    {
        id: 'minimal',
        name: '极简',
        description: '只留读写、搜索、终端、待办与提问，提示词换成一段短文。',
        prompt: { mode: 'complete', text: MINIMAL_PROMPT },
        runtimeContext: false,
        channels: {},
        groups: {
            mcp: OFF,
            interaction: ON,
            delegation: OFF,
            workflow: OFF,
            goal: OFF,
            schedule: OFF,
            platform: OFF,
            skill: ON,
        },
        servers: {},
        tools: { todo_write: ON, ask_user_question: ON },
        summaries: {},
    },
];
/** 占位定义按字符数估算 token 的系数;只用于面板里的成本提示,不参与决策。 */
export const TOKEN_PER_CHAR = 0.28;

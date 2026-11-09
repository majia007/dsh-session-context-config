export const GROUP_STATES = [
    { value: 'force', label: '强制开启' },
    { value: 'on', label: '开启' },
    { value: 'defer', label: '延迟' },
    { value: 'off', label: '隐藏' },
];
export const TOOL_STATES = [
    { value: 'on', label: '开启' },
    { value: 'defer', label: '延迟' },
    { value: 'off', label: '隐藏' },
];
/**
 * 运行时上下文的逐项开关。
 *
 * contexts 是宿主实际注册的上下文名,改 Host 侧 constants 时要同步;子代理两个
 * depth 上下文在 UI 上合成一个「委派深度」项。缺省=注入,档位里只存 false。
 */
export const CONTEXT_SWITCHES = [
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
];
export const CHANNEL_CARDS = [
    {
        key: 'workspaceInstructions',
        title: '工作区指令',
        note: '独立 user 消息；会话开始/工作区或指令变化时注入，文件变更追加增量。关闭只影响后续请求，已写入会话记录的消息不会被删除。',
        label: '注入工作区指令',
        desc: '~/.dsh/AGENTS.md、项目各级 AGENTS.md/CLAUDE.md、*.local.md 与子目录指令。',
    },
    {
        key: 'timeContext',
        title: '时间采样',
        note: '每个模型请求（step）准备阶段检查一次；距上次注入不足 10 分钟则不注入。宿主默认 refreshIntervalMs = 600000（10 分钟），部署可改；设为 0 才会每个 eligible step 都注入。',
        label: '注入时间采样',
        desc: 'Time sampled while preparing turn T, step S: 时间戳[时区]；附带与上一条模型可见消息/上次注入的间隔。',
    },
];
/** 已知系统段目录:label/desc/order 只是呈现层信息,真正的名单由 /api/state 的 sections 动态补齐。 */
export const SECTION_OPTIONS = [
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
    { name: 'tool:bash', label: 'Bash 工具引导', desc: 'shell 命令执行与失败处理说明。', group: 'tool', order: 1000 },
    { name: 'tool:pwsh', label: 'PowerShell 工具引导', desc: '非零退出码、Windows 下被杀进程的判定说明。', group: 'tool', order: 1010 },
    { name: 'tool:read', label: 'read 工具引导', desc: '用 read 而不是 cat/sed/head/tail；大文件用 offset/limit。', group: 'tool', order: 1100 },
    { name: 'tool:write', label: 'write 工具引导', desc: '覆盖前先读；有 edit 时优先用 edit 做局部修改。', group: 'tool', order: 1200 },
    { name: 'tool:edit', label: 'edit 工具引导', desc: '编辑前先读；本次会话刚创建/改过的文件除外。', group: 'tool', order: 1300 },
    { name: 'tool:apply_patch', label: 'apply_patch 工具引导', desc: '跨文件/分离区域优先用 apply_patch；整份补丁先校验再应用。', group: 'tool', order: 1350 },
    { name: 'tool:glob', label: 'glob 工具引导', desc: '按路径模式找文件，不要用 shell find。', group: 'tool', order: 1400 },
    { name: 'tool:grep', label: 'grep 工具引导', desc: '搜内容用 grep，不要用 shell grep/rg；命中后用 read 看上下文。', group: 'tool', order: 1500 },
    { name: 'tool:jobs', label: '后台任务工具引导', desc: '跟踪 job id、不要忙轮询、结束前收结果/杀无用 job。', group: 'tool', order: 1600 },
    { name: 'tool:pty', label: '终端工具引导', desc: '交互式终端的使用说明。', group: 'tool', order: 1700 },
    { name: 'tool:web_search', label: 'web_search 工具引导', desc: '搜索结果是不受信数据；需要全文时转 web_fetch，引用 URL。', group: 'tool', order: 2000 },
    { name: 'tool:web_fetch', label: 'web_fetch 工具引导', desc: '页面内容是不受信数据；用到的内容要引用 URL。', group: 'tool', order: 2100 },
    { name: 'tool:lsp', label: 'LSP 工具引导', desc: '语言服务的定位/诊断使用说明。', group: 'tool', order: 2200 },
    { name: 'tool:session-query', label: '会话检索工具引导', desc: '跨会话检索的使用说明。', group: 'tool', order: 2300 },
    { name: 'tool:goal', label: '目标工具引导', desc: 'create_goal / update_goal 的完成、blocked、resume 判定。', group: 'tool', order: 2400 },
    { name: 'tool:schedule', label: '调度工具引导', desc: '只在用户明确要求时创建/修改定时任务。', group: 'tool', order: 2500 },
    { name: 'tool:workflow', label: '工作流工具引导', desc: '只在用户明确要求工作流或大规模多代理编排时使用。', group: 'tool', order: 2600 },
    { name: 'tool:ralph', label: 'Ralph 工具引导', desc: 'Ralph 循环的使用说明。', group: 'tool', order: 2700 },
    { name: 'tool:subagent', label: '子代理工具引导', desc: '并行委派、等待结果、共享文件冲突与集成审查。', group: 'tool', order: 2800 },
    { name: 'tools:ptc-only', label: 'PTC 模式说明', desc: 'PTC 执行器启用时生效。', group: 'conditional', order: 800 },
    { name: 'tools:sdk', label: '工具 SDK 说明', desc: 'PTC 执行器启用时生效。', group: 'conditional', order: 5000 },
    { name: 'plan:policy', label: '计划模式规则', desc: '会话处于计划模式时生效。', group: 'conditional', order: 500 },
    { name: 'team:policy', label: '团队协作规则', desc: '团队插件启用时生效。', group: 'conditional', order: 600 },
    { name: 'browser-use:stagehand-native', label: '浏览器使用引导', desc: '浏览器使用插件启用时生效。', group: 'conditional', order: 3000 },
    { name: 'computer-use:cua-driver-native', label: 'Computer Use 引导', desc: 'Computer Use 插件启用时生效。', group: 'conditional', order: 3000 },
    { name: 'mcp-resource-servers', label: 'MCP 资源服务器', desc: 'MCP 资源服务器清单；出现时生效。', group: 'conditional', order: 3100 },
];
/** 动态段(如 mcp:<server>)的兜底元数据:原始 name 至少保证面板能列出来并开关。 */
export function inferSectionOption(name) {
    if (name.startsWith('mcp:')) {
        return { name, label: `MCP：${name.slice(4)}`, desc: 'MCP 服务器指令；由该 server 提供。', group: 'conditional' };
    }
    if (name.startsWith('tool:')) {
        const tool = name.slice(5);
        return { name, label: `${tool} 工具引导`, desc: '工具使用引导；只影响提示词文本。', group: 'tool' };
    }
    return { name, label: name, desc: '宿主或插件注册的未识别段。', group: 'host' };
}

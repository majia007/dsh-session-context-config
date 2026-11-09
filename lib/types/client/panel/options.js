export const GROUP_STATES = [
    ['force', '强制开启', 'ok'],
    ['on', '开启', ''],
    ['defer', '延迟', 'warn'],
    ['off', '隐藏', 'mute'],
];
export const TOOL_STATES = [
    ['on', '开启', ''],
    ['defer', '延迟', 'warn'],
    ['off', '隐藏', 'mute'],
];
// 第三列是复选行下方的说明;通道说明只解释「拦什么」,记录保留由行尾统一提示。
export const CHANNELS = [
    ['workspaceInstructions', '拦截工作区指令', '不把 AGENTS.md 等工作区指令发给模型。'],
    ['timeContext', '拦截时间采样', '不把「Time sampled …」时间采样发给模型。'],
];
export const PROMPT_MODES = [
    ['inherit', '沿用', ''],
    ['replace', '替换人设段', ''],
    ['complete', '极简（仅这段）', ''],
];

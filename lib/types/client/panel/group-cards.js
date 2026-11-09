/** 工具行(组卡片的行级构件)。 */
import { createElement as h } from 'react';
import { SegmentedControl, Tag } from '@deepseek-ai/dsh-client-ui-primitives';
import { effective, formatTokens, ON } from "../state/resolve.js";
import { TOOL_STATES } from "./options.js";
import { ToolDescription } from "./ToolDescription.js";
import styles from './panel.module.css';
/** 行内标签用分段选择的措辞(「开启」),不用摘要里的「注入」。 */
const ROW_LABEL = { on: '开启', defer: '延迟', off: '隐藏', force: '强制开启' };
/** 状态色调跟宿主 Tag 的语义走:启用=success、延迟=warning、隐藏=中性灰。 */
const TAG_TONE = { on: 'success', defer: 'warning', off: 'neutral', force: 'success' };
/** 每个工具都贴最终生效状态;被组/server 改写时补一条 tooltip 说明本行选择。 */
export function stateTag(effectiveState, rowState) {
    const label = ROW_LABEL[effectiveState] ?? effectiveState;
    const overridden = effectiveState !== rowState;
    return h('span', {
        className: styles.stateTag,
        title: overridden
            ? `由组 / server 决定：生效 ${label}（本行选择：${ROW_LABEL[rowState] ?? rowState}）`
            : undefined,
    }, h(Tag, { tone: TAG_TONE[effectiveState] ?? 'outline', className: styles.stateTagInner }, label));
}
/** 该工具的估算 token 占用,用默认(描边灰)标签,与状态标签并排。 */
function tokenTag(tokens) {
    return h('span', { className: styles.tokenTag, title: '工具定义（名字 + 描述 + 参数）的估算占用' }, h(Tag, null, `≈${formatTokens(tokens)}`));
}
export function toolRow(tool, profile, setToolState) {
    const state = effective(profile, tool);
    const raw = profile.tools?.[tool.name] ?? ON;
    return h('div', { className: styles.tool, key: tool.name }, h('span', { className: styles.nameCell }, h('span', { className: styles.nm, title: tool.name }, tool.name), stateTag(state, raw), tokenTag(tool.tokens)), h(ToolDescription, { name: tool.name, text: tool.description ?? '' }), h('span', { className: styles.control }, h(SegmentedControl, {
        id: `scc-tool-${tool.name}`,
        value: raw,
        options: TOOL_STATES,
        onChange: (next) => setToolState(tool.name, next),
        label: `${tool.name} 状态`,
    })));
}

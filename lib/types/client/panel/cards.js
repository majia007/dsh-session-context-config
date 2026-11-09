/** 系统提示词卡与基线卡:档位的 prompt/通道开关 + 与档位无关的基线开关。 */
import { createElement as h } from 'react';
import { Choice, CheckRow } from "../menu/controls.js";
import { OFF } from "../state/resolve.js";
import { CHANNELS, PROMPT_MODES } from "./options.js";
import styles from './panel.module.css';
export function SystemPromptCard({ profile, patch }) {
    return h('section', { className: styles.card }, h('h2', { className: styles.cardTitle }, '系统提示词'), h(Choice, {
        value: profile.prompt.mode,
        options: PROMPT_MODES,
        onChange: (mode) => patch((target) => {
            target.prompt.mode = mode;
        }),
        name: 'scc-prompt-mode',
        label: '系统提示词来源',
    }), profile.prompt.mode === 'inherit'
        ? null
        : h('div', { className: styles.field }, h('textarea', {
            className: styles.textarea,
            value: profile.prompt.text,
            maxLength: 20000,
            placeholder: '例如：你是一个只做最小改动的编码代理，回复用中文，先给结论。',
            onChange: (event) => {
                const value = event.target.value;
                patch((target) => {
                    target.prompt.text = value;
                });
            },
        })), h('div', { className: styles.divider }), h('div', { className: styles.subhead }, '上下文注入'), h('div', { className: styles.checks }, h(CheckRow, {
        checked: profile.runtimeContext !== false,
        onChange: (value) => patch((target) => {
            target.runtimeContext = value;
        }),
        label: '注入运行时上下文',
        desc: '控制快照里的可选段（文件策略、批准策略等）；当前工作目录始终保留。',
    }), ...CHANNELS.map(([key, label, desc]) => h(CheckRow, {
        key,
        checked: profile.channels?.[key] === OFF,
        onChange: (blocked) => patch((target) => {
            target.channels = target.channels ?? {};
            if (blocked)
                target.channels[key] = OFF;
            else
                delete target.channels[key];
        }),
        label,
        desc,
    }))), h('p', { className: styles.hint }, '拦截只影响发给模型的请求；消息仍写入会话记录，在轨迹里仍可见。'));
}
/** 基线是插件级开关(与档位无关),所以改的是 draft.baseline 而不是某个档位。 */
export function BaselineCard({ draft, patchBaseline }) {
    return h('section', { className: styles.card }, h('h2', { className: styles.cardTitle }, '基线（所有新会话）'), h('p', { className: styles.hint }, '与档位无关：新会话总会收到这些内容，关闭后从下一场新会话起生效。'), h('div', { className: styles.checks }, h(CheckRow, {
        checked: draft?.baseline?.contract !== false,
        onChange: (value) => patchBaseline('contract', value),
        label: '行为契约',
        desc: '不可逆动作先确认、如实汇报、信息足够就行动、跟随周边风格等 6 条。',
    }), h(CheckRow, {
        checked: draft?.baseline?.cardReceipt !== false,
        onChange: (value) => patchBaseline('cardReceipt', value),
        label: '卡片回执',
        desc: 'UI 已渲染卡片时只回一句确认，不复述字段；失败仍给细节。',
    }), h(CheckRow, {
        checked: draft?.baseline?.untrustedFiles !== false,
        onChange: (value) => patchBaseline('untrustedFiles', value),
        label: '不可信下载',
        desc: '隔离目录、路径传参、python -I 三条读取规则。',
    }), h(CheckRow, {
        checked: draft?.baseline?.environmentFacts !== false,
        onChange: (value) => patchBaseline('environmentFacts', value),
        label: '环境事实',
        desc: 'platform / shell / git 状态，每会话探测一次。',
    }), h(CheckRow, {
        checked: draft?.baseline?.inCompletePrompt !== false,
        onChange: (value) => patchBaseline('inCompletePrompt', value),
        label: 'complete 档位也保留基线',
        desc: 'complete 会独占 developer 消息，勾选表示把基线并进那段文本。',
    })));
}

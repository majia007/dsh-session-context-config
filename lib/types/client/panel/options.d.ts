/** 面板的状态选项表、消息卡片元数据与系统段目录(UI 呈现层)。 */
import type { SegmentedControlOption } from '@deepseek-ai/dsh-client-ui-primitives';
export declare const GROUP_STATES: SegmentedControlOption[];
export declare const TOOL_STATES: SegmentedControlOption[];
/**
 * 运行时上下文的逐项开关。
 *
 * contexts 是宿主实际注册的上下文名,改 Host 侧 constants 时要同步;子代理两个
 * depth 上下文在 UI 上合成一个「委派深度」项。缺省=注入,档位里只存 false。
 */
export declare const CONTEXT_SWITCHES: Array<{
    id: string;
    label: string;
    desc: string;
    order: number;
    contexts: string[];
}>;
/** 消息通道卡:每条通道是独立 user 消息,卡内仍用一行 checkbox + 描述。 */
export interface ChannelCardOption {
    key: 'workspaceInstructions' | 'timeContext';
    title: string;
    note: string;
    label: string;
    desc: string;
}
export declare const CHANNEL_CARDS: ChannelCardOption[];
export type SectionGroup = 'host' | 'tool' | 'conditional';
export interface SectionOption {
    name: string;
    label: string;
    desc: string;
    group: SectionGroup;
    order?: number;
    /** 部署人设槽位:渲染成「开关 + 覆盖 + 文本」三件套,而不是普通段开关。 */
    persona?: 'prefix' | 'suffix';
}
/** 已知系统段目录:label/desc/order 只是呈现层信息,真正的名单由 /api/state 的 sections 动态补齐。 */
export declare const SECTION_OPTIONS: SectionOption[];
/** 动态段(如 mcp:<server>)的兜底元数据:原始 name 至少保证面板能列出来并开关。 */
export declare function inferSectionOption(name: string): SectionOption;

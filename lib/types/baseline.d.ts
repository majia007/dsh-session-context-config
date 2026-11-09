/**
 * 附加规则层(A1 行为契约 / A2 不可信文件规则 / A3 卡片回执)。
 *
 * 界面叫「附加规则」,代码沿用 baseline;它只负责与档位无关的三段提示词,
 * 不再控制任何运行时上下文(环境事实已移到 host/environment-facts.ts)。
 *
 * 为什么单独成文件:这段文本要在没有运行时的情况下做快照测试(tests/baseline.test.mjs),
 * 也要能被 index.ts 与文档共同引用;放进装配层只会被档位逻辑淹没。
 *
 * 生效方式(与档位解耦):
 * - 三段文本注册为**全局**系统提示段,每个 agent 装配时出现且只出现一次;开关关闭时
 *   返回空串,装配层会丢掉空段(core/system-prompt/src/index.ts:342)。
 */
/** 附加规则开关的默认值:默认全开,面板里可逐项关闭。 */
export declare const BASELINE_DEFAULTS: {
    contract: boolean;
    cardReceipt: boolean;
    untrustedFiles: boolean;
};
export type BaselineFlags = typeof BASELINE_DEFAULTS;
export declare const BASELINE_SECTION_NAME: {
    contract: string;
    cardReceipt: string;
    untrustedFiles: string;
};
/**
 * 段位:排在所有宿主段之后(宿主最大 order 是 deployment:persona-suffix 的 10200),
 * 让附加规则成为 system 消息的收尾;仍保持三者内部顺序固定。
 */
export declare const BASELINE_SECTION_ORDER: {
    contract: number;
    cardReceipt: number;
    untrustedFiles: number;
};
/** 文本快照:测试与文档都从这里取,避免出现第二份措辞。 */
export declare const BASELINE_TEXT: {
    contract: string;
    cardReceipt: string;
    untrustedFiles: string;
};
export declare function normalizeBaseline(raw: unknown): BaselineFlags;
/** 供 index.ts 注册的段定义;text 是函数,读当前状态,改开关不需要重新注册。 */
export declare function baselineSections(readBaseline: () => BaselineFlags): {
    name: string;
    order: number;
    interpolate: boolean;
    text: () => string;
}[];

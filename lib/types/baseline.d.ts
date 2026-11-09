/** 基线开关的默认值:默认全开,面板里可逐项关闭。 */
export declare const BASELINE_DEFAULTS: {
    contract: boolean;
    cardReceipt: boolean;
    untrustedFiles: boolean;
    environmentFacts: boolean;
    /** complete 档位会把 developer 消息整段换成自己的文本,这里决定是否把基线并进去。 */
    inCompletePrompt: boolean;
};
export type BaselineFlags = typeof BASELINE_DEFAULTS;
export declare const BASELINE_SECTION_NAME: {
    contract: string;
    cardReceipt: string;
    untrustedFiles: string;
};
/** 段位:落在 persona(0) 之后、PLAN_POLICY(500) 之前,不抢任何内置段的顺序。 */
export declare const BASELINE_SECTION_ORDER: {
    contract: number;
    cardReceipt: number;
    untrustedFiles: number;
};
/** 运行时上下文的落点:紧跟 subagent 委派(120) 之后,早于 checkout/Web URL(200+)。 */
export declare const ENVIRONMENT_CONTEXT_NAME = "session-context-config:environment";
export declare const ENVIRONMENT_CONTEXT_ORDER = 130;
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
/**
 * complete 档位会独占 developer 消息,全局段在那时全部消失。
 * 同一模块负责 complete 的装配,所以在这里把基线并进去,保证「任何新会话都有契约」。
 */
export declare function composeCompletePrompt(text: unknown, baseline: BaselineFlags | undefined): string;
export type GitStatus = {
    kind: 'repo';
    branch: string;
    dirty: boolean;
} | {
    kind: 'none';
} | {
    kind: 'unknown';
    reason?: string;
};
export interface EnvironmentFacts {
    platform: string;
    osType: string;
    osRelease: string;
    shell: string;
    git: GitStatus;
}
type RunGit = (args: string[], cwd: string) => string;
/**
 * 一次 git status 同时拿到「是不是仓库、分支、脏不脏」。
 * 600ms 上限 + 60s 缓存:探测失败降级成 unknown,绝不阻塞会话创建。
 */
export declare function probeGit(cwd: string | undefined, runGit?: RunGit): GitStatus;
/** 测试用来清缓存,避免同一临时目录跨用例命中旧结果。 */
export declare function clearGitCache(): void;
/** 探测一次就固定:同一会话里不再 rerun,否则每次 git 变化都要重写请求前缀。 */
export declare function probeEnvironment({ cwd, shellTool, runGit }?: {
    cwd?: string;
    shellTool?: string | null;
    runGit?: RunGit;
}): EnvironmentFacts;
export declare function environmentFactsText(facts: EnvironmentFacts | null | undefined): string;
export {};

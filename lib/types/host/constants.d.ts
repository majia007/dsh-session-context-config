/**
 * 档位模型的常量:状态字面量、组表、通道表、内置档位与 token 估算系数。
 *
 * Host 与 Client 各自持有一份同规则的档位解析(见 AGENTS.md「跨端同规则双份」),
 * 这里只放 Host 侧;Client 那份在 src/client/state/resolve.ts,改一侧必须同步另一侧。
 */
export declare const VERSION = 2;
export declare const ON = "on";
export declare const DEFER = "defer";
export declare const OFF = "off";
export declare const FORCE = "force";
/** 档位形状:groups/servers 只记与默认(on)不同的项,tools 三态,channels 拦截两类注入。 */
export interface ContextProfile {
    id: string;
    name: string;
    description: string;
    prompt: {
        mode: 'inherit' | 'replace' | 'complete';
        text: string;
    };
    runtimeContext: boolean;
    channels: Record<string, string>;
    groups: Record<string, string>;
    servers: Record<string, string>;
    tools: Record<string, string>;
    summaries: Record<string, string>;
}
/** 组是 UI 的分组,同时也是第一级开关。 */
export declare const GROUPS: ReadonlyArray<{
    id: string;
    title: string;
    test: (name: string) => boolean;
}>;
/** 通道拦截:把这两类“档位模型之外”的注入消息从发给模型的请求里滤掉。 */
export declare const CHANNELS: {
    id: string;
    source: string;
}[];
export declare const CHANNEL_IDS: Set<string>;
export declare const MINIMAL_PROMPT: string;
export declare const DEFAULT_PROFILES: ContextProfile[];
/** 占位定义按字符数估算 token 的系数;只用于面板里的成本提示,不参与决策。 */
export declare const TOKEN_PER_CHAR = 0.28;

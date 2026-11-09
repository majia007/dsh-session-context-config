/**
 * 档位模型的常量:状态字面量、组表、通道表、内置档位与 token 估算系数。
 *
 * Host 与 Client 各自持有一份同规则的档位解析(见 AGENTS.md「跨端同规则双份」),
 * 这里只放 Host 侧;Client 那份在 src/client/state/resolve.ts,改一侧必须同步另一侧。
 */
export declare const VERSION = 4;
export declare const ON = "on";
export declare const DEFER = "defer";
export declare const OFF = "off";
export declare const FORCE = "force";
/**
 * 部署人设的一个固定槽位(prefix 在 order 0,紧随 harness:identity;suffix 在 10200,
 * 整个提示词的末尾)。
 * - enabled=false:该槽位不发送(agent 作用域注册同名空影子)。
 * - enabled=true + override=false:沿用部署文本(personaPrefix/personaSuffix)。
 * - enabled=true + override=true:text 为空 = 不发送,非空 = 替换该槽位。
 */
export interface PersonaSlot {
    enabled: boolean;
    override: boolean;
    text: string;
}
/** 档位形状:groups/servers/tools 只记与默认(on)不同的项;contexts/sections 只记关掉的项。 */
export interface ContextProfile {
    id: string;
    name: string;
    description: string;
    /** 部署人设的两个固定槽位,各自独立开关与覆盖。 */
    prompt: {
        prefix: PersonaSlot;
        suffix: PersonaSlot;
    };
    /** 运行时上下文名 -> false 表示不注入;缺省(或 true)表示注入。 */
    contexts: Record<string, boolean>;
    /** 系统提示段名 -> false 表示不进入 system 消息;缺省(或 true)表示包含。 */
    sections: Record<string, boolean>;
    channels: Record<string, string>;
    groups: Record<string, string>;
    servers: Record<string, string>;
    tools: Record<string, string>;
    summaries: Record<string, string>;
}
/** 部署人设前缀段名;agent 作用域注册同名段即可替换它。 */
export declare const PERSONA_SECTION = "deployment:persona-prefix";
/** 前缀段的 order 名;宿主 getSectionOrder 认这个键。 */
export declare const PERSONA_ORDER_NAME = "DEPLOYMENT_PERSONA_PREFIX";
/** 部署人设后缀段名;人设开关/覆盖时与前缀一起处理。 */
export declare const PERSONA_SUFFIX_SECTION = "deployment:persona-suffix";
/** 后缀段的 order 名。 */
export declare const PERSONA_SUFFIX_ORDER_NAME = "DEPLOYMENT_PERSONA_SUFFIX";
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
/** 当前工作目录的运行时上下文名;宿主标了 required,关掉它必须做同名 shadow + assemble 过滤。 */
export declare const WORKING_DIRECTORY_CONTEXT = "working-directory:current";
/** 本插件的环境事实上下文;注册在 host/environment.ts,由档位的 contexts 逐项控制。 */
export declare const ENVIRONMENT_CONTEXT = "session-context-config:environment";
export declare const ENVIRONMENT_CONTEXT_ORDER = 130;
/** 旧档位 runtimeContext:false 的含义是「所有可选运行时上下文都关」;cwd 不在其中。 */
export declare const OPTIONAL_CONTEXT_NAMES: readonly ["sandbox:policy", "approval:policy", "tool:subagent:depth", "tool:subagent_fork:depth", "session-context-config:environment", "harness:source", "app:web-surface"];
/** 关掉一个上下文时注册同名 shadow 用的 order 名;宿主 getContextOrder 认这些键。 */
export declare const CONTEXT_ORDER_NAMES: Record<string, string>;
/** getContextOrder 不可用时的兜底;环境事实是本插件自己的 order,其余未知段用 0。 */
export declare const CONTEXT_ORDER_FALLBACK: Record<string, number>;
export declare const MINIMAL_PROMPT: string;
export declare const DEFAULT_PROFILES: ContextProfile[];
/** 占位定义按字符数估算 token 的系数;只用于面板里的成本提示,不参与决策。 */
export declare const TOKEN_PER_CHAR = 0.28;

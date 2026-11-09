/**
 * 域间共享的形状契约(只有类型):快照、档位、工具条目、live 会话与工具状态。
 * Host 侧的权威定义在 src/host/constants.ts 与 src/host/state.ts,这里镜像 client
 * 实际消费的字段;改 Host 形状时同步这里。
 */
/** 目录里的工具条目(快照 tools 数组元素)。 */
export interface CatalogTool {
    name: string;
    description: string;
    group: string;
    server: string | null;
    chars: number;
    tokens: number;
    modes?: string[];
}
/** 档位(面板草稿与快照 profiles 数组元素)。 */
export interface Profile {
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
/** live 根会话投影。 */
export interface LiveSession {
    sessionId: string;
    preset: string | null;
    blank: boolean;
    profileId: string | null;
    deferred: number;
    hidden: number;
    loaded: number;
}
/** 快照(GET /api/state 的返回)。 */
export interface Snapshot {
    ok: boolean;
    version: number;
    profiles: Profile[];
    lastUsedId: string;
    sessions: Record<string, string>;
    baseline: Record<string, boolean>;
    presets: Array<{
        id: string;
        name: string;
        tools: CatalogTool[];
    }>;
    defaultPreset: string;
    tools: CatalogTool[];
    groups: Array<{
        id: string;
        title: string;
    }>;
    live: LiveSession[];
    diagnostics: unknown[];
}
/** 会话内工具状态(GET /api/session 的返回)。 */
export interface SessionStatus {
    ok: boolean;
    sessionId: string;
    profileId: string;
    blank: boolean;
    tools: Array<{
        name: string;
        group: string;
        server: string | null;
        state: string;
        loaded: boolean;
    }>;
}

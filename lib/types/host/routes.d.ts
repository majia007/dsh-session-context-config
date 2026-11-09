import type { StateStore } from './state-store.ts';
import type { ProfileRuntime } from './profiles.ts';
import type { SessionKit } from './sessions.ts';
import type { AgentLike, HostContext, RouteHandler } from '../types.ts';
/** 四条 HTTP 路由 + 快照/预览(面板与 chip 的全部数据源)。 */
export interface RoutesRuntime {
    snapshot(): Promise<Record<string, unknown>>;
    previewFor(agent: AgentLike, profileId: string): Record<string, unknown>;
    handleState: RouteHandler;
    handleSession: RouteHandler;
    handlePreview: RouteHandler;
    handleAssemble: RouteHandler;
}
interface RoutesDeps {
    ctx: HostContext;
    store: StateStore;
    kit: SessionKit;
    profiles: ProfileRuntime;
    note: (source: string, error: unknown) => void;
    diagnostics: unknown[];
}
export declare function createRoutes(deps: RoutesDeps): RoutesRuntime;
export declare const ROUTES: {
    readonly STATE: "/session-context-config/api/state";
    readonly SESSION: "/session-context-config/api/session";
    readonly PREVIEW: "/session-context-config/api/preview";
    readonly ASSEMBLE: "/session-context-config/api/assemble";
};
export {};

import { type ContextProfile } from './constants.ts';
import type { StateStore } from './state-store.ts';
import type { SessionKit } from './sessions.ts';
import { type ToolDefinitionLike } from './tools.ts';
import type { AgentLike, HostContext, ToolDefinition } from '../types.ts';
/** 一次档位应用的计划:hidden(整体 deny)/ deferred(名→摘要)/ originals(名→完整定义)。 */
export interface ApplyPlan {
    hidden: string[];
    deferred: Map<string, string>;
    originals: Map<string, ToolDefinitionLike>;
}
export interface AppliedEntry {
    profileId: string;
    plan: ApplyPlan;
    agent: AgentLike;
    dispose(): void;
}
/** 档位应用运行时:计划计算、按 agent 应用/撤销、tool_search 注册与查询面。 */
export interface ProfileRuntime {
    profileById(id: string): ContextProfile | null;
    planFor(profile: ContextProfile, definitions: ToolDefinitionLike[], extraNames?: Iterable<string>, previousOriginals?: Map<string, ToolDefinitionLike>): ApplyPlan;
    applyTo(agent: AgentLike, profileId: string): ApplyPlan;
    release(agent: AgentLike): void;
    planOf(agent: AgentLike): {
        profileId: string;
        plan: ApplyPlan;
    } | null;
    deferredFor(agent: AgentLike): Map<string, string>;
    originalsFor(agent: AgentLike): Map<string, ToolDefinitionLike>;
    /** 该 agent 已通过 tool_search 取回定义的工具名集合(快照与会话状态用)。 */
    loadedNamesOf(agent: AgentLike): Set<string>;
    /** tool_search 工具定义(只在有延迟工具时由 syncToolSearch 注册)。 */
    searchTool: ToolDefinition<SearchResult>;
    syncToolSearch(): void;
    applied: Map<string, AppliedEntry>;
    /** 正在执行 applyTo(重入守卫:tools/change 自己触发的变更不再回环处理)。 */
    readonly isApplying: boolean;
    dispose(): void;
}
interface SearchResult {
    matched: string[];
    definitions: string;
    message: string;
}
export declare function createProfileRuntime(ctx: HostContext, store: StateStore, kit: SessionKit, note: (source: string, error: unknown) => void, composeBaseline: (text: string) => string): ProfileRuntime;
export {};

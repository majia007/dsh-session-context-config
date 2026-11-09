import type { HostContext, AgentLike } from '../types.ts';
import type { ToolDefinitionLike } from './tools.ts';
/** 会话与 agent 的小工具集:身份解析、空白/根判定、schema 与定义读取。 */
export interface SessionKit {
    sessionOf(agent: AgentLike | undefined | null): {
        id?: unknown;
        header?: Record<string, unknown>;
    } | null;
    sessionIdOf(agent: AgentLike | undefined | null): string | null;
    isBlank(agent: AgentLike | undefined | null): boolean;
    isRootAgent(agent: AgentLike | undefined | null): boolean;
    visibleSchemas(agent: AgentLike | undefined | null): Array<{
        name: string;
        description?: unknown;
        parameters?: unknown;
    }>;
    definitionsOf(agent: AgentLike | undefined | null): ToolDefinitionLike[];
    agentFor(sessionId: string | null): AgentLike | null;
}
export declare function createSessionKit(ctx: HostContext, note: (source: string, error: unknown) => void): SessionKit;

import type { SessionKit } from './sessions.ts';
import type { AgentLike, HostContext } from '../types.ts';
/**
 * 环境事实按 agent 注册成运行时上下文,并且**所有 agent 都装**——子代理同样需要
 * platform/shell/git,否则它在 Windows 上会按 POSIX 习惯写命令。是否进入请求由
 * 档位的 contexts 逐项过滤;子代理没有档位,因此默认一直保留。
 *
 * 探测在注册时同步做一次并固定:这段文本每次变化都会让宿主追加一条新的快照
 * 消息,等于每次 git 变化都重写请求前缀。会话内不再复测是有意取舍。
 */
export interface EnvironmentRuntime {
    applyEnvironment(agent: AgentLike): void;
    releaseEnvironment(agent: AgentLike): void;
    dispose(): void;
}
export declare function createEnvironmentRuntime(ctx: HostContext, kit: SessionKit, note: (source: string, error: unknown) => void): EnvironmentRuntime;

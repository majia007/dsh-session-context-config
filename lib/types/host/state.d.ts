import { type BaselineFlags } from '../baseline.ts';
import { type ContextProfile } from './constants.ts';
/** 状态文件形状;落在 $DSH_HOME/session-context-config.json。 */
export interface PluginState {
    version: number;
    lastUsedId: string;
    profiles: ContextProfile[];
    sessions: Record<string, string>;
    baseline: BaselineFlags;
}
export declare function homeDirectory(): string;
export declare function statePath(): string;
/** 改名前的状态文件,只在迁移时读一次。 */
export declare function legacyStatePath(): string;
export declare function messageOf(error: unknown): string;
export declare function defaultState(): PluginState;
/** 版本 2/3/4 可读:2 的 prompt.mode 与 complete 语义在 normalizeProfile 里一次性迁移;
 *  v3 升级到 v4 时把三个内置档位的定义就地替换(新增 devtools 分组、人设双槽位、默认的延迟策略)。 */
export declare function normalizeState(raw: unknown): PluginState;

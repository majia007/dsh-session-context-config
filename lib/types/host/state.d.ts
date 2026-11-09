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
/** 版本不符即整份作废:旧版本的字段语义不同,逐字段迁移不如让用户重选一次。 */
export declare function normalizeState(raw: unknown): PluginState;

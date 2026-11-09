import { type PluginState } from './state.ts';
/** 状态存取:加载/迁移/防抖落盘,apply 层经此读写,不直接碰文件。 */
export interface StateStore {
    get state(): PluginState;
    set state(next: PluginState);
    /** 磁盘读入(ENOENT 时尝试迁移旧文件名),失败回落默认值并记诊断。 */
    load(): void;
    persistNow(): void;
    persistSoon(): void;
    /** 卸载时冲刷未落盘的防抖写入。 */
    flush(): void;
}
type NoteFn = (source: string, error: unknown) => void;
export declare function createStateStore(note: NoteFn): StateStore;
export {};

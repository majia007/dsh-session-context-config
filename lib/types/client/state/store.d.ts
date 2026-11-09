/**
 * 数据层:进程内单例 store(快照/错误/在途请求)+ 订阅通知 + HTTP 封装。
 * 组件经 hooks(store.ts 的 useSnapshot/useError)订阅,不直接 import 本模块的内部状态。
 */
import type { Snapshot } from '../contract/types.ts';
interface Store {
    snapshot: Snapshot | null;
    error: string | null;
    inflight: Promise<Snapshot> | null;
    listeners: Set<() => void>;
}
export declare function emit(): void;
export declare function request<T>(url: string, options?: {
    method?: string;
    body?: string;
}): Promise<T & {
    ok: boolean;
    snapshot?: Snapshot;
}>;
export declare function loadSnapshot(force?: boolean): Promise<Snapshot>;
/** 测试/保存后直接写回快照(POST /state 的响应携带最新快照)。 */
export declare function setSnapshot(snapshot: Snapshot): void;
export declare function storeInternal(): Store;
export {};

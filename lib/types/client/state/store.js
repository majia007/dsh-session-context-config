const API_STATE = '/session-context-config/api/state';
const store = { snapshot: null, error: null, inflight: null, listeners: new Set() };
export function emit() {
    for (const listener of [...store.listeners]) {
        try {
            listener();
        }
        catch {
            /* 忽略单个组件错误 */
        }
    }
}
export async function request(url, options) {
    const response = await fetch(url, {
        cache: 'no-store',
        headers: options?.body ? { 'content-type': 'application/json' } : undefined,
        ...options,
    });
    const text = await response.text();
    let parsed = null;
    try {
        parsed = text ? JSON.parse(text) : null;
    }
    catch {
        throw new Error(`接口返回的不是 JSON（HTTP ${response.status}）`);
    }
    const record = parsed;
    if (!response.ok || !record?.ok)
        throw new Error(record?.error || `请求失败（HTTP ${response.status}）`);
    return parsed;
}
export function loadSnapshot(force) {
    if (store.inflight && !force)
        return store.inflight;
    store.inflight = request(API_STATE)
        .then((snapshot) => {
        store.snapshot = snapshot;
        store.error = null;
        store.inflight = null;
        emit();
        return snapshot;
    })
        .catch((error) => {
        store.error = error.message || String(error);
        store.inflight = null;
        emit();
        throw error;
    });
    return store.inflight;
}
/** 测试/保存后直接写回快照(POST /state 的响应携带最新快照)。 */
export function setSnapshot(snapshot) {
    store.snapshot = snapshot;
    store.error = null;
    emit();
}
export function storeInternal() {
    return store;
}

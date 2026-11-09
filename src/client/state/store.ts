/**
 * 数据层:进程内单例 store(快照/错误/在途请求)+ 订阅通知 + HTTP 封装。
 * 组件经 hooks(store.ts 的 useSnapshot/useError)订阅,不直接 import 本模块的内部状态。
 */
import type { Snapshot } from '../contract/types.ts'

const API_STATE = '/session-context-config/api/state'

interface Store {
  snapshot: Snapshot | null
  error: string | null
  inflight: Promise<Snapshot> | null
  listeners: Set<() => void>
}

const store: Store = { snapshot: null, error: null, inflight: null, listeners: new Set() }

export function emit(): void {
  for (const listener of [...store.listeners]) {
    try {
      listener()
    } catch {
      /* 忽略单个组件错误 */
    }
  }
}

export async function request<T>(url: string, options?: { method?: string; body?: string }): Promise<T & { ok: boolean; snapshot?: Snapshot }> {
  const response = await fetch(url, {
    cache: 'no-store',
    headers: options?.body ? { 'content-type': 'application/json' } : undefined,
    ...options,
  } as RequestInit)
  const text = await response.text()
  let parsed: unknown = null
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    throw new Error(`接口返回的不是 JSON（HTTP ${response.status}）`)
  }
  const record = parsed as { ok?: boolean; error?: string } | null
  if (!response.ok || !record?.ok) throw new Error(record?.error || `请求失败（HTTP ${response.status}）`)
  return parsed as T & { ok: boolean; snapshot?: Snapshot }
}

export function loadSnapshot(force?: boolean): Promise<Snapshot> {
  if (store.inflight && !force) return store.inflight
  store.inflight = request<Snapshot>(API_STATE)
    .then((snapshot) => {
      store.snapshot = snapshot
      store.error = null
      store.inflight = null
      emit()
      return snapshot
    })
    .catch((error: unknown) => {
      store.error = (error as Error).message || String(error)
      store.inflight = null
      emit()
      throw error
    })
  return store.inflight
}

/** 测试/保存后直接写回快照(POST /state 的响应携带最新快照)。 */
export function setSnapshot(snapshot: Snapshot): void {
  store.snapshot = snapshot
  store.error = null
  emit()
}

export function storeInternal(): Store {
  return store
}

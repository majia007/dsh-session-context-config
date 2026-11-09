/** React 订阅胶水:以最小面暴露 store 的快照与错误。 */
import { useEffect, useState } from 'react'
import { loadSnapshot, storeInternal } from './store.ts'
import type { Snapshot } from '../contract/types.ts'

export function useSnapshot(): Snapshot | null {
  const [, tick] = useState(0)
  useEffect(() => {
    const listener = () => tick((value) => value + 1)
    const store = storeInternal()
    store.listeners.add(listener)
    if (!store.snapshot && !store.error) loadSnapshot().catch(() => {})
    return () => {
      store.listeners.delete(listener)
    }
  }, [])
  return storeInternal().snapshot
}

export function useError(): string | null {
  const [, tick] = useState(0)
  useEffect(() => {
    const listener = () => tick((value) => value + 1)
    const store = storeInternal()
    store.listeners.add(listener)
    return () => {
      store.listeners.delete(listener)
    }
  }, [])
  return storeInternal().error
}

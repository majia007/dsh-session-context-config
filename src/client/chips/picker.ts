/**
 * 两个 chip 共用的选择器逻辑:会话定位、当前档位、候选列表与切换请求。
 * 组件不再收 ctx:当前会话 id 由注册面(apply.ts 的 inject face)以 props 传入。
 */
import { useCallback, useMemo, useRef, useState } from 'react'
import { useSnapshot } from '../state/hooks.ts'
import { emit, request, setSnapshot } from '../state/store.ts'
import { NONE, presetNames, statsFor } from '../state/resolve.ts'
import type { Snapshot } from '../contract/types.ts'

const API_SESSION = '/session-context-config/api/session'

function resolveSessionId(props: { session?: { id?: unknown; sessionId?: unknown } | null; sessionId?: unknown }): string | null {
  const direct = (props?.session?.id ?? props?.session?.sessionId ?? props?.sessionId ?? null) as string | null
  return direct
}

export interface ChipProps {
  sessionId?: string | null
  session?: { id?: unknown; sessionId?: unknown } | null
}

export function usePicker(props: ChipProps, options?: { fallbackBlank?: boolean }) {
  const snapshot: Snapshot | null = useSnapshot()
  const anchor = useRef<HTMLElement | null>(null)
  const [open, setOpen] = useState(false)
  const fromProps = resolveSessionId(props)
  const fallbackBlank = options?.fallbackBlank ? snapshot?.live?.find((item) => item.blank)?.sessionId ?? null : null
  const sessionId = fromProps ?? fallbackBlank
  const live = snapshot?.live?.find((item) => item.sessionId === sessionId) ?? null
  const currentId = snapshot?.sessions?.[sessionId as string] ?? snapshot?.lastUsedId ?? NONE
  const current = snapshot?.profiles?.find((item) => item.id === currentId) ?? null

  const counts = useMemo(() => {
    if (!snapshot) return null
    const presetId = live?.preset ?? snapshot.defaultPreset
    const names = presetNames(snapshot, presetId)
    if (!names) return null
    return { names, presetId }
  }, [snapshot, live])

  const chips = useMemo(() => {
    if (!snapshot || !counts) return []
    const list: Array<{ id: string; name: string; desc: string; stats: ReturnType<typeof statsFor> | null }> = snapshot.profiles.map((item) => ({
      id: item.id,
      name: item.name,
      desc: item.description,
      stats: statsFor(item, snapshot.tools, counts.names),
    }))
    list.unshift({ id: NONE, name: '不处理', desc: '按模式原样注入', stats: null })
    return list
  }, [snapshot, counts])

  const choose = useCallback(
    async (profileId: string) => {
      if (!sessionId) return
      setOpen(false)
      try {
        const result = await request<{ snapshot: Snapshot }>(API_SESSION, { method: 'POST', body: JSON.stringify({ sessionId, profileId }) })
        setSnapshot(result.snapshot)
        emit()
      } catch (error) {
        console.warn('[session-context-config] 切换档位失败', error)
      }
    },
    [sessionId],
  )

  return { snapshot, sessionId, current, currentId, chips, open, setOpen, anchor, choose }
}

/**
 * 两个 chip 共用的选择器逻辑:会话定位、当前档位、候选列表与切换请求。
 * 组件不再收 ctx:当前会话 id 由注册面(apply.ts 的 inject face)以 props 传入。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSnapshot } from '../state/hooks.ts'
import { emit, request, setSnapshot } from '../state/store.ts'
import { NONE, presetNames, statsFor } from '../state/resolve.ts'
import type { Snapshot } from '../contract/types.ts'

const API_SESSION = '/session-context-config/api/session'
const API_STATE = '/session-context-config/api/state'

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
  const recorded = sessionId ? snapshot?.sessions?.[sessionId] ?? null : null
  // 已开始却没有套档位的会话(fork、恢复的历史会话、插件装载前就在跑的会话)必须显式
  // 报「不处理」:回落 lastUsedId 会把「新会话的默认档位」冒充成「本会话的档位」——
  // 用户看到 chip 写着「完整」,实际一条延迟占位都没有(实测踩过)。新会话的默认档位
  // 现在按工作区记在快照的 lastUsedByWorkspace 里,这里的 lastUsedId 只是无工作区
  // 信息时的兜底;有会话记录(recorded)时一律以记录为准。
  const untouched = live !== null && live.applied === false && !live.blank
  const currentId = recorded ?? (untouched ? NONE : snapshot?.lastUsedId ?? NONE)
  const current = snapshot?.profiles?.find((item) => item.id === currentId) ?? null

  // 快照是整页共享的(store 为空时、或打开配置面板时才重读):本会话若在快照之后才创建,
  // sessions / live 里都没有它,上面的回落就会把 lastUsedId 当成它的档位。
  // 这里按会话补拉一次(明确不相干时不拉,避免每轮都重算整份快照)。
  const covered = snapshot === null || sessionId === null || recorded !== null || live !== null
  const refreshedFor = useRef<string | null>(null)
  useEffect(() => {
    if (covered || sessionId === null || refreshedFor.current === sessionId) return
    refreshedFor.current = sessionId
    request<Snapshot>(API_STATE)
      .then((value) => {
        setSnapshot(value)
        emit()
      })
      .catch((error) => console.warn('[session-context-config] 补拉快照失败', error))
  }, [covered, sessionId])

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

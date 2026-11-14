/**
 * 会话头部的紧凑 chip:注入计数 + 全量工具状态清单 + 切换确认块。
 * 工具状态在挂载与每次打开时各取一次,保证清单最新。
 */
import { createElement as h, Fragment, useEffect, useState, type ReactElement } from 'react'
import { Popover } from '../menu/popup.ts'
import { MenuRow, Seat } from '../menu/seat.ts'
import { request } from '../state/store.ts'
import { DEFER, ON, STATE_LABEL } from '../state/resolve.ts'
import type { SessionStatus } from '../contract/types.ts'
import { usePicker, type ChipProps } from './picker.ts'
import menuStyles from '../menu/menu.module.css'

const API_SESSION = '/session-context-config/api/session'

export function SessionChip(props: ChipProps): ReactElement | null {
  const picker = usePicker(props)
  const [status, setStatus] = useState<SessionStatus | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const anchor = picker.anchor

  // 工具状态也是「注入计数」的来源:挂载时就取一次,别等用户点开才知道
  // 有几个工具在注入;打开时再取一次,保证清单是最新的。
  useEffect(() => {
    if (!picker.sessionId) return
    let alive = true
    request<SessionStatus>(`${API_SESSION}?id=${encodeURIComponent(picker.sessionId)}`)
      .then((value) => {
        if (alive) setStatus(value)
      })
      .catch(() => {
        if (alive) setStatus(null)
      })
    return () => {
      alive = false
    }
  }, [picker.open, picker.sessionId])

  if (!picker.snapshot || !picker.sessionId) return null

  return h(
    Fragment,
    null,
    h(Seat, {
      anchorRef: anchor,
      compact: true,
      open: picker.open,
      onClick: () => picker.setOpen(!picker.open),
      title: '本会话的工具档位',
      label: picker.current?.name ?? '不处理',
      count: status ? status.tools.filter((tool) => tool.state === ON).length : null,
    }),
    picker.open
      ? h(
          Popover,
          { anchor, onClose: () => picker.setOpen(false), label: '本会话工具状态' },
          h(
            'div',
            { className: menuStyles.menuHead },
            h('span', null, '本会话工具状态'),
            h('span', { className: menuStyles.menuNote }, status?.blank ? '尚未开始的会话可随时切换' : '切换会重建前缀缓存'),
          ),
          status
            ? h(
                'div',
                { className: menuStyles.status },
                h(
                  'div',
                  { className: menuStyles.statusRow },
                  h('span', null, `开启 ${status.tools.filter((tool) => tool.state === ON).length}`),
                  h('span', null, `延迟 ${status.tools.filter((tool) => tool.state === DEFER).length}`),
                  h('span', null, `关闭 ${status.tools.filter((tool) => tool.state === 'off').length}`),
                ),
                // 全部工具都进清单,区域高度固定、里面自己滚——不靠截断。
                h(
                  'div',
                  { className: menuStyles.tools },
                  ...status.tools.map((tool) =>
                    h(
                      'div',
                      { className: menuStyles.statusRow, key: tool.name },
                      h('span', { className: menuStyles.sw, 'data-s': tool.state }),
                      h('span', { className: menuStyles.nm }, tool.name),
                      h('span', { className: menuStyles.st }, tool.state === DEFER && tool.loaded ? '延迟 · 已取定义' : STATE_LABEL[tool.state]),
                    ),
                  ),
                ),
              )
            : h('div', { className: `${menuStyles.status} ${menuStyles.mini}` }, '正在读取状态…'),
          h('div', { className: menuStyles.menuSep }),
          ...picker.chips.map((chip) =>
            h(MenuRow, {
              key: chip.id,
              selected: chip.id === picker.currentId,
              name: chip.name,
              desc: chip.desc,
              count: chip.stats ? chip.stats.on + chip.stats.defer : null,
              onClick: () => setConfirmId(chip.id),
            }),
          ),
          confirmId
            ? h(
                'div',
                { className: menuStyles.status },
                h('div', { className: menuStyles.mini, style: { marginBottom: 8 } }, '确认切换？工具表整体替换，缓存从第一个变化的 schema 处重建。'),
                h(
                  'div',
                  { style: { display: 'flex', gap: 8, justifyContent: 'flex-end' } },
                  h('button', { className: menuStyles.btn, onClick: () => setConfirmId(null) }, '取消'),
                  h(
                    'button',
                    {
                      className: menuStyles.btn,
                      'data-kind': 'primary',
                      onClick: () => {
                        setConfirmId(null)
                        picker.choose(confirmId)
                      },
                    },
                    '确认',
                  ),
                ),
              )
            : null,
        )
      : null,
  )
}

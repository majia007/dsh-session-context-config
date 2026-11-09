/** 触发器与菜单行:新会话行用整尺寸 seat;会话头部用 compact(与宿主「模式」静态标签同字号/同色)。 */
import { createElement as h, type ReactElement } from 'react'
import styles from './menu.module.css'
import { Check, Chevron, Glyph } from './icons.ts'

export function Seat({ anchorRef, open, onClick, title, label, count, compact }: {
  anchorRef: { current: HTMLElement | null }
  open: boolean
  onClick(): void
  title: string
  label: string
  count?: number | null
  compact?: boolean
}): ReactElement {
  return h(
    'button',
    {
      ref: anchorRef,
      type: 'button',
      className: styles.seat,
      'data-compact': compact ? '1' : undefined,
      'aria-haspopup': 'menu',
      'aria-expanded': open ? 'true' : 'false',
      title,
      onClick,
    },
    h(Glyph, { size: compact ? 14 : 16, className: styles.seatIcon }),
    h('span', { className: styles.seatLabel }, label),
    count != null ? h('span', { className: styles.seatCount }, String(count)) : null,
    h(Chevron, { size: compact ? 14 : 16 }),
  )
}

export function MenuRow({ selected, onClick, name, desc, count }: {
  selected: boolean
  onClick(): void
  name: string
  desc?: string
  count?: number | null
}): ReactElement {
  return h(
    'button',
    {
      type: 'button',
      role: 'menuitemradio',
      'aria-checked': selected ? 'true' : 'false',
      className: styles.row,
      onClick,
    },
    h('span', { className: styles.rowMain }, h('span', { className: styles.rowName }, name), desc ? h('span', { className: styles.rowDesc }, desc) : null),
    count != null ? h('span', { className: styles.rowCount }, String(count)) : null,
    // 未选中也留出勾位,右侧计数才不会左右跳。
    selected ? h(Check, null) : h('span', { className: styles.rowCheck, 'aria-hidden': true }),
  )
}

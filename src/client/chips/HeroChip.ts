/** 新会话行(hero)的档位 chip:整尺寸 seat + 档位菜单。 */
import { createElement as h, Fragment, type ReactElement } from 'react'
import { Popover } from '../menu/popup.ts'
import { MenuRow, Seat } from '../menu/seat.ts'
import { presetNames, statsFor } from '../state/resolve.ts'
import { usePicker, type ChipProps } from './picker.ts'
import menuStyles from '../menu/menu.module.css'

export function HeroChip(props: ChipProps): ReactElement | null {
  const picker = usePicker(props, { fallbackBlank: true })
  if (!picker.snapshot || !picker.sessionId) return null
  const stats = picker.current
    ? statsFor(picker.current, picker.snapshot.tools, presetNames(picker.snapshot, picker.snapshot.live?.find((i) => i.sessionId === picker.sessionId)?.preset ?? picker.snapshot.defaultPreset))
    : null
  return h(
    Fragment,
    null,
    h(Seat, {
      anchorRef: picker.anchor,
      open: picker.open,
      onClick: () => picker.setOpen(!picker.open),
      title: '本会话的工具档位',
      label: picker.current?.name ?? '不处理',
      count: stats ? stats.on : null,
    }),
    picker.open
      ? h(
          Popover,
          { anchor: picker.anchor, onClose: () => picker.setOpen(false), label: '本会话的工具档位' },
          h('div', { className: menuStyles.menuHead }, h('span', null, '本次会话的工具档位'), h('span', { className: menuStyles.menuNote }, '只作用于本会话')),
          ...picker.chips.map((chip) =>
            h(MenuRow, {
              key: chip.id,
              selected: chip.id === picker.currentId,
              name: chip.name,
              desc: chip.desc,
              count: chip.stats ? chip.stats.on + chip.stats.defer : null,
              onClick: () => picker.choose(chip.id),
            }),
          ),
        )
      : null,
  )
}

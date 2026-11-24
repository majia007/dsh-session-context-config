/**
 * 档位页签:配置页正文首行的档位切换。
 *
 * 几何抄 `dsh-skill-mcp-command-manager` 的页签行(与宿主 `SegmentedTabs` 的 `sm` 档同
 * 口径:轨道 2px 内距 + 30px 段、选中片抬成 `bg-layer-3` 并补 0.5px 描边),不套卡片。
 * 不复用宿主 `SegmentedControl`:两个配置页的页签必须同一套观感,而分段选择留给组 /
 * server / 工具行。
 */
import { createElement as h, type ReactElement } from 'react'
import type { Profile } from '../contract/types.ts'
import styles from './panel.module.css'

export function ProfileTabs(props: {
  profiles: Profile[]
  value: string
  onSelect: (id: string) => void
}): ReactElement {
  return h(
    'div',
    { className: styles.profileTabs, role: 'tablist', 'aria-label': '档位' },
    props.profiles.map((profile) => h(
      'button',
      {
        key: profile.id,
        type: 'button',
        role: 'tab',
        'aria-selected': profile.id === props.value,
        className: profile.id === props.value
          ? `${styles.profileTab} ${styles.profileTabActive}`
          : styles.profileTab,
        onClick: () => props.onSelect(profile.id),
      },
      profile.name,
    )),
  )
}

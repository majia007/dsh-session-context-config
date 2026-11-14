/** 预览浮层:各 agent preset 下这套档位的开启/延迟/关闭统计。 */
import { createElement as h, type ReactElement } from 'react'
import { formatTokens, statsFor } from '../state/resolve.ts'
import type { Profile, Snapshot } from '../contract/types.ts'
import styles from './panel.module.css'

export function PreviewDialog({ profile, snapshot, onClose }: { profile: Profile; snapshot: Snapshot; onClose(): void }): ReactElement {
  const rows = snapshot.presets.map((preset) => {
    const names = new Set(preset.tools.map((tool) => tool.name))
    const stats = statsFor(profile, snapshot.tools, names)
    return { preset, stats }
  })
  return h(
    'div',
    { className: styles.pop, style: { left: '50%', top: 80, transform: 'translateX(-50%)', width: 460, maxWidth: '90vw' } },
    h('div', { className: styles.popHead }, h('span', null, `预览：${profile.name}`), h('button', { className: styles.link, onClick: onClose }, '关闭')),
    h(
      'div',
      { className: styles.status },
      ...rows.map(({ preset, stats }) =>
        h(
          'div',
          { className: styles.statusRow, key: preset.id },
          h('span', { className: styles.nm }, preset.name),
          h('span', { className: styles.st }, `开启 ${stats.on} · 延迟 ${stats.defer} · 关闭 ${stats.off} · ≈${formatTokens(stats.onTokens)} tokens`),
        ),
      ),
    ),
  )
}

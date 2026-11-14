/** 插件图标与菜单内的小图形(纯展示,样式类来自 menu.module.css)。 */
import { createElement as h, type ReactElement } from 'react'
import styles from './menu.module.css'

export function Glyph({ size = 18, className }: { size?: number; className?: string }): ReactElement {
  return h(
    'svg',
    {
      viewBox: '0 0 24 24',
      width: size,
      height: size,
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.7,
      strokeLinecap: 'round',
      'aria-hidden': true,
      className: className,
      style: { display: 'block' },
    },
    h('path', { d: 'M4 7h10' }),
    h('path', { d: 'M18 7h2' }),
    h('circle', { cx: 16, cy: 7, r: 2 }),
    h('path', { d: 'M4 17h4' }),
    h('path', { d: 'M12 17h8' }),
    h('circle', { cx: 10, cy: 17, r: 2 }),
  )
}

export function Chevron({ size = 16 }: { size?: number }): ReactElement {
  return h(
    'svg',
    {
      viewBox: '0 0 24 24',
      width: size,
      height: size,
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.6,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      'aria-hidden': true,
      className: styles.seatChevron,
      style: { display: 'block' },
    },
    h('path', { d: 'm6 9.5 6 6 6-6' }),
  )
}

export function Check(): ReactElement {
  return h(
    'svg',
    {
      viewBox: '0 0 16 16',
      width: 14,
      height: 14,
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.5,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      'aria-hidden': true,
      className: styles.rowCheck,
      style: { display: 'block' },
    },
    h('path', { d: 'M3.4 8.4 6.3 11.3 12.6 4.8' }),
  )
}

/** 「这里有说明」的标记：自己不显示文本，说明挂在宿主元素的原生 title 上。 */
export function Help({ size = 13 }: { size?: number }): ReactElement {
  return h(
    'svg',
    {
      viewBox: '0 0 16 16',
      width: size,
      height: size,
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.4,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      'aria-hidden': true,
      style: { display: 'block' },
    },
    h('circle', { cx: 8, cy: 8, r: 6.2 }),
    h('path', { d: 'M6.2 6.3a1.9 1.9 0 1 1 2.5 1.8c-.5.2-.8.7-.8 1.2v.2' }),
    h('path', { d: 'M7.9 11.6h.01' }),
  )
}

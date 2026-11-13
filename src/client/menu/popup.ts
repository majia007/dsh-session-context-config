/** 锚定浮层:portal 到 body,先量后放(同值 bail),下方放不下翻到触发器上方。 */
import { createElement as h, useEffect, useLayoutEffect, useRef, useState, type ReactElement, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import styles from './menu.module.css'

export function Popover({ anchor, onClose, label, children, onMouseEnter, onMouseLeave }: {
  anchor: { current: HTMLElement | null }
  onClose(): void
  label: string
  children?: ReactNode
  /** 悬停型菜单用:指针进入/离开浮层时取消或重排关闭计时。 */
  onMouseEnter?: () => void
  onMouseLeave?: () => void
}): ReactElement {
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const onDoc = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node) && !anchor?.current?.contains(event.target as Node)) onClose()
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [anchor, onClose])
  // 卡片尺寸要等渲染后才知道:先量再定位,翻不下就翻到触发器上方。
  useLayoutEffect(() => {
    const el = ref.current
    const box = anchor?.current
    if (!el || !box) return
    const a = box.getBoundingClientRect()
    const p = el.getBoundingClientRect()
    const left = Math.min(Math.max(8, a.left), Math.max(8, window.innerWidth - p.width - 8))
    let top = a.bottom + 4
    if (top + p.height > window.innerHeight - 8) top = Math.max(8, a.top - p.height - 4)
    setPos((prev) => (prev && prev.left === left && prev.top === top ? prev : { left, top }))
  })
  return createPortal(
    h(
      'div',
      {
        className: styles.menu,
        ref,
        role: 'menu',
        'aria-label': label,
        onMouseEnter,
        onMouseLeave,
        style: pos ? { left: pos.left, top: pos.top } : { left: -9999, top: -9999, visibility: 'hidden' },
      },
      children,
    ),
    document.body,
  )
}

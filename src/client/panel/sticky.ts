/**
 * 档位卡吸顶检测:档位 tab 栏顶边贴住滚动区的钉住位置 = 已吸顶。
 *
 * 判据取几何量而不是 IntersectionObserver:sticky 元素的矩形本身就是它钉住后的真实
 * 位置,一个量同时覆盖滚动、面板缩放与界面字号变化;`scrollTop > 0` 既排掉页面顶部的
 * 静止态,也顺带排掉无布局环境(happy-dom 里所有矩形都是 0)。
 *
 * ⚠️ 钉住位置是**内容盒顶边**,不是滚动区外框顶边:滚动区的 padding-top 会把 sticky
 * 的落点往下推(`.cp-scroll` 是 16px)。直接拿外框顶边比,吸顶永远不会成立。
 */
import { useEffect, useState } from 'react'

/** 1px 容差:分数缩放时 getBoundingClientRect 会给 0.5 级偏移,别让吸顶晚一帧。 */
const TOLERANCE = 1

/** `scrollerTop` 传的是钉住位置(滚动区外框顶边 + 边框 + 上内距),不是外框顶边。 */
export function isPinned(scrollTop: number, targetTop: number, scrollerTop: number): boolean {
  return scrollTop > 0 && targetTop <= scrollerTop + TOLERANCE
}

export function useStuck(scroller: HTMLElement | null, target: HTMLElement | null): boolean {
  const [stuck, setStuck] = useState(false)
  useEffect(() => {
    if (!scroller || !target) {
      setStuck(false)
      return
    }
    let inset = 0
    const measureInset = () => {
      const style = getComputedStyle(scroller)
      inset = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.borderTopWidth) || 0)
    }
    const measure = () => setStuck(isPinned(
      scroller.scrollTop,
      target.getBoundingClientRect().top,
      scroller.getBoundingClientRect().top + inset,
    ))
    measureInset()
    measure()
    scroller.addEventListener('scroll', measure, { passive: true })
    // 面板尺寸变化会改内距与卡片高度(决定吸顶从哪个滚动位置开始),量到就重算一次。
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(() => {
      measureInset()
      measure()
    }) : null
    observer?.observe(scroller)
    return () => {
      scroller.removeEventListener('scroll', measure)
      observer?.disconnect()
    }
  }, [scroller, target])
  return stuck
}

/**
 * 唯一跨域装配点:把 panel/chips 注册进槽位。
 *
 * ctx 纪律:ctx 只活在apply 世界;组件收 props——当前会话 id 由 hero/session 槽位
 * 注册的 inject face 以 `sessionId` 传入(替代旧版把 ctx 塞进组件的做法),
 * 面板的关闭动作由 main 槽位的 inject face 提供 closePanel。
 *
 * 样式不再走 ctx.effect 注入:CSS Modules 的注入器模块在 factory 执行时写入
 * 带 tag 的 <style>(幂等),视觉与旧版一致;详见 AGENTS.md 偏差清单。
 */
import { createElement as h } from 'react'
import { ConfigPanel } from './panel/ConfigPanel.ts'
import { HeroChip } from './chips/HeroChip.ts'
import { SessionChip } from './chips/SessionChip.ts'
import { Glyph } from './menu/icons.ts'

const LABEL = '上下文档位'

/** 浏览器 ctx 的最小面(apply 世界)。 */
interface ClientContext {
  get?(service: string): unknown
  inject(names: string[], callback: (scoped: ClientContext) => unknown): unknown
  effect?(fn: () => () => void, label?: string): unknown
  slots: {
    inject(name: string, factory: () => unknown): void
    register(options: Record<string, unknown>, component: unknown): unknown
  }
}

/**
 * session 作用域槽位的 inject face 会收到槽位渲染器传入的 sessionId(位置参数,
 * `ui-renderer/src/client/scoped-slots.tsx` 的 runInject 传 binding.key)。不要
 * 改回 `ctx.sessions.current()`:sessions 不在插件 inject 名单里,Cordis 注入检查
 * 会抛错,被吞掉后返回 null,会话头部 chip 就不渲染(只剩新会话行靠空白会话兜底)。
 */
function sessionIdFrom(argument: unknown): string | null {
  return typeof argument === 'string' && argument.length > 0 ? argument : null
}

export const inject = ['slots']

export function apply(ctx: ClientContext): void {
  let layoutService: unknown = null
  try {
    ctx.inject(['layout'], (scoped) => {
      layoutService = (scoped as { layout?: unknown }).layout
      return () => {
        layoutService = null
      }
    })
  } catch {
    /* 无 layout 时不可关闭面板 */
  }
  const layout = (): { selectPanel?: (id: unknown) => void } | undefined => {
    try {
      return (layoutService ?? (typeof ctx.get === 'function' ? ctx.get('layout') : undefined)) as { selectPanel?: (id: unknown) => void } | undefined
    } catch {
      return undefined
    }
  }

  function SidebarGlyph() {
    return h(Glyph, { size: 16 })
  }

  ctx.slots.inject('sidebar.panellist', () =>
    ctx.slots.register({ name: 'sidebar.panellist', id: 'session-context-config', order: 30, label: () => LABEL }, SidebarGlyph),
  )

  ctx.slots.inject('main', () =>
    ctx.slots.register(
      {
        name: 'main',
        key: 'session-context-config',
        inject: () => ({
          presentation: 'panel',
          closePanel: () => {
            try {
              layout()?.selectPanel?.(null)
            } catch {
              /* 控制器缺失 */
            }
          },
        }),
      },
      (props: unknown) => h(ConfigPanel, { ...(props as { closePanel?: () => void }) }),
    ),
  )

  ctx.slots.inject('conversation.hero.options', () =>
    ctx.slots.register({ name: 'conversation.hero.options', id: 'session-context-config', order: 20, inject: (sessionId: unknown) => ({ sessionId: sessionIdFrom(sessionId) }) }, (props: unknown) => h(HeroChip, { ...(props as object) })),
  )

  // 会话头部:和「模式」标签同槽(那个静态标签 order -10),排在它右侧;
  // 放进 utilities 会被推到整行最右端。
  ctx.slots.inject('conversation.session.header.actions', () =>
    ctx.slots.register({ name: 'conversation.session.header.actions', id: 'session-context-config', order: 10, inject: (sessionId: unknown) => ({ sessionId: sessionIdFrom(sessionId) }) }, (props: unknown) => h(SessionChip, { ...(props as object) })),
  )
}

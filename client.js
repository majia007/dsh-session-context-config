window.__ModuleLoader__.load({
  id: 'dsh-session-context-config',
  factory(require) {
    const React = require('react')
    const ReactDOM = require('react-dom')
    const h = React.createElement
    const { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } = React

    const API_STATE = '/session-context-config/api/state'
    const API_SESSION = '/session-context-config/api/session'
    const LABEL = '上下文档位'
    const NONE = 'none'

    const ON = 'on'
    const DEFER = 'defer'
    const OFF = 'off'
    const FORCE = 'force'

    const GROUP_STATES = [
      [FORCE, '强制开启', 'ok'],
      [ON, '开启', ''],
      [DEFER, '延迟', 'warn'],
      [OFF, '隐藏', 'mute'],
    ]
    const TOOL_STATES = [
      [ON, '开启', ''],
      [DEFER, '延迟', 'warn'],
      [OFF, '隐藏', 'mute'],
    ]
    const CHANNELS = [
      ['workspaceInstructions', '拦截工作区指令'],
      ['timeContext', '拦截时间采样'],
    ]

    const CSS = `
.cp-root{height:100%;min-height:0;display:flex;flex-direction:column;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px}
.cp-head{flex:none;display:flex;align-items:flex-start;gap:12px;padding:18px 22px 14px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.cp-headIcon{flex:none;width:34px;height:34px;border-radius:9px;background:var(--dsw-alias-bg-layer-2);display:flex;align-items:center;justify-content:center}
.cp-headText{flex:1;min-width:0}
.cp-title{margin:0;font-size:16px;font-weight:600;line-height:24px}
.cp-sub{margin:3px 0 0;font-size:12px;color:var(--dsw-alias-label-secondary)}
.cp-iconBtn{flex:none;width:30px;height:30px;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;display:flex;align-items:center;justify-content:center}
.cp-iconBtn:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.cp-scroll{flex:1;min-height:0;overflow:auto;padding:16px 22px 26px;display:flex;flex-direction:column;gap:14px}
.cp-card{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);border-radius:12px;padding:14px 16px}
.cp-cardTitle{margin:0 0 10px;font-size:13px;font-weight:600}
.cp-chipRow{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.cp-chip{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border-radius:999px;padding:5px 13px;font:inherit;font-size:12px;cursor:pointer;display:inline-flex;align-items:center;gap:6px}
.cp-chip:hover{border-color:var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2)}
.cp-chip[data-on="1"]{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-2);font-weight:600}
.cp-link{border:0;background:none;color:var(--dsw-alias-brand-primary);font:inherit;font-size:12px;cursor:pointer;padding:4px 2px}
.cp-link:hover{text-decoration:underline}
.cp-link[disabled]{color:var(--dsw-alias-state-idle-primary);cursor:default;text-decoration:none}
.cp-field{display:flex;flex-direction:column;gap:6px;margin-top:10px}
.cp-input,.cp-textarea,.cp-search{box-sizing:border-box;width:100%;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);border-radius:8px;padding:7px 10px;font:inherit;font-size:13px;outline:none}
.cp-input:focus,.cp-textarea:focus,.cp-search:focus{border-color:var(--dsw-alias-brand-primary)}
.cp-textarea{min-height:96px;resize:vertical;line-height:19px}
.cp-seg{display:inline-flex;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;overflow:hidden;background:var(--dsw-alias-bg-base);flex:none}
.cp-seg button{border:0;background:none;font:inherit;font-size:11px;line-height:22px;padding:0 9px;cursor:pointer;color:var(--dsw-alias-label-secondary);white-space:nowrap}
.cp-seg button+button{border-left:1px solid var(--dsw-alias-border-l1)}
.cp-seg button:hover{background:var(--dsw-alias-bg-layer-2)}
.cp-seg button[data-on="1"]{background:var(--dsw-alias-brand-primary);color:#fff;font-weight:600}
.cp-seg button[data-on="1"][data-tone="warn"]{background:#c98a1f}
.cp-seg button[data-on="1"][data-tone="mute"]{background:#6b7280}
.cp-seg button[data-on="1"][data-tone="ok"]{background:var(--dsw-alias-state-success-primary)}
.cp-seg.sm button{font-size:10.5px;padding:0 7px}
.cp-eff{font-size:11px;border-radius:999px;padding:1px 8px;white-space:nowrap;border:1px solid transparent}
.cp-eff[data-s="on"]{color:var(--dsw-alias-state-success-primary);background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l1)}
.cp-eff[data-s="defer"]{color:#a8720f;background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l1)}
.cp-eff[data-s="off"]{color:var(--dsw-alias-state-error-primary);background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l1)}
.cp-groupHead{display:flex;align-items:center;gap:8px;padding:8px 2px}
.cp-groupName{font-size:12.5px;font-weight:600}
.cp-count{font-size:11px;color:var(--dsw-alias-label-secondary)}
.cp-push{margin-left:auto}
.cp-serverRow{display:flex;align-items:center;gap:8px;padding:5px 8px;margin:4px 0 4px 12px;border-radius:8px;background:var(--dsw-alias-bg-layer-2)}
.cp-serverRow .srv{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11.5px}
.cp-tool{display:flex;align-items:center;gap:8px;padding:4px 2px 4px 26px;border-radius:7px}
.cp-tool:hover{background:var(--dsw-alias-bg-layer-2)}
.cp-tool .nm{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px}
.cp-tool .zh{font-size:11px;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:320px}
.cp-tool .cost{font-size:11px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}
.cp-foot{flex:none;display:flex;align-items:center;gap:10px;padding:12px 22px;border-top:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1)}
.cp-footNote{flex:1;min-width:0;font-size:12px;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cp-btn{font:inherit;font-size:12px;border-radius:8px;padding:7px 14px;cursor:pointer;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary)}
.cp-btn:hover{border-color:var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2)}
.cp-btn[data-kind="primary"]{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);color:#fff;font-weight:600}
.cp-btn[disabled]{opacity:.45;cursor:default}
.cp-empty{padding:16px 2px;font-size:12px;color:var(--dsw-alias-label-secondary)}
.cp-error{font-size:12px;color:var(--dsw-alias-state-error-primary);word-break:break-word}
.cp-sep{height:1px;background:var(--dsw-alias-border-l1);margin:10px 0}
.cp-pop{position:fixed;z-index:2000;min-width:300px;max-width:380px;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-overlay);box-shadow:0 16px 40px rgba(16,24,40,.18);overflow:hidden}
.cp-popHead{padding:9px 12px;border-bottom:1px solid var(--dsw-alias-border-l1);font-size:12px;color:var(--dsw-alias-label-secondary);display:flex;justify-content:space-between;gap:12px}
/* 触发按钮：与 DSH 自带的「工作区 / 模式」chip 同几何 —— 28 高、8px 内边距、
   radius-sm、13/20 字、之间 4px。悬停与展开用宿主同一层 hover fill。 */
.cp-seat{display:inline-flex;align-items:center;gap:4px;min-width:0;max-width:min(100%,240px);min-height:28px;padding:0 8px;border:0;border-radius:var(--dsw-radius-sm,8px);background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:20px;font-weight:500;white-space:nowrap;cursor:pointer}
.cp-seat[aria-expanded="true"],.cp-seat:not(:disabled):hover{background:var(--dsw-alias-interactive-bg-hover,rgba(38,49,72,.06))}
.cp-seat:disabled{cursor:default;color:var(--dsw-alias-label-quaternary,var(--dsw-alias-label-secondary))}
.cp-seatIcon{flex:none;color:var(--dsw-alias-label-primary)}
.cp-seatLabel{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cp-seatCount{flex:none;font-size:12px;line-height:20px;color:var(--dsw-alias-label-caption,var(--dsw-alias-label-secondary));font-variant-numeric:tabular-nums}
.cp-seatChevron{flex:none;color:var(--dsw-alias-label-caption,var(--dsw-alias-label-secondary))}
/* 会话头部：与宿主的「模式」静态标签同字号同色。值逐条抄自
   ui-agent-preset 的 AgentPresetLabel.module.css（它的类名是 CSS Module 哈希，
   跨插件拿不到）。它引用的 --dsw-alias-fill-tsp-secondary 在 UI 源码里没有定义，
   实际等于透明底——照抄，别自己补一个填充色。 */
.cp-seat[data-compact="1"]{min-height:22px;height:22px;gap:4px;padding:0 4px 0 2px;border-radius:var(--dsw-radius-xs,4px);background:var(--dsw-alias-fill-tsp-secondary);font-size:12px;line-height:22px;font-weight:400;color:var(--dsw-alias-label-tertiary)}
.cp-seat[data-compact="1"][aria-expanded="true"],.cp-seat[data-compact="1"]:not(:disabled):hover{background:var(--dsw-alias-interactive-bg-hover,rgba(38,49,72,.06))}
.cp-seat[data-compact="1"] .cp-seatCount{line-height:22px}
/* 新会话行把插件选项推到行尾（宿主 .heroOptions 带 margin-left:auto）。
   槽位的 data-slot 锚点是宿主的稳定寻址面（display:contents，不参与布局），
   用它选中“装着 conversation.hero.options 的那一层”，只挪本插件这一列。 */
div:has(> [data-slot="conversation.hero.options"]){margin-left:0}
/* 下拉卡片：照 DSH 菜单的材质与行几何写（MenuItem / MenuSurface）。 */
.cp-menu{position:fixed;z-index:1100;box-sizing:border-box;min-width:min(248px,calc(100vw - 24px));max-width:min(360px,calc(100vw - 24px));max-height:calc(100dvh - 24px);overflow-y:auto;padding:4px;border:0;border-radius:var(--dsw-radius-lg,16px);background:var(--dsw-specific-menu,var(--dsw-alias-bg-overlay));-webkit-backdrop-filter:var(--dsw-menu-backdrop-filter);backdrop-filter:var(--dsw-menu-backdrop-filter);box-shadow:var(--dsw-elevation-prominent,0 16px 40px rgba(16,24,40,.18));--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2)}
.cp-menuHead{display:flex;align-items:center;gap:8px;padding:6px 8px;font-size:11px;line-height:15px;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));white-space:nowrap}
.cp-menuNote{margin-left:auto;font-size:11px;color:var(--dsw-alias-label-caption,var(--dsw-alias-label-secondary));overflow:hidden;text-overflow:ellipsis}
.cp-row{display:flex;align-items:flex-start;gap:8px;width:100%;min-height:34px;padding:6px 8px;border:0;border-radius:var(--dsw-radius-md,12px);background:transparent;color:var(--dsw-alias-label-primary);font:inherit;text-align:left;cursor:pointer}
.cp-row:hover,.cp-row:focus-visible{background:var(--dsw-alias-interactive-bg-hover,rgba(38,49,72,.06));outline:none}
.cp-rowMain{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.cp-rowName{font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary)}
.cp-rowDesc{font-size:12px;line-height:16px;color:var(--dsw-alias-label-caption,var(--dsw-alias-label-secondary));white-space:normal}
.cp-rowCount{flex:none;margin-top:1px;font-size:11px;line-height:18px;color:var(--dsw-alias-label-caption,var(--dsw-alias-label-secondary));font-variant-numeric:tabular-nums}
.cp-rowCheck{flex:none;width:14px;height:14px;margin-top:3px;color:var(--dsw-alias-label-primary)}
.cp-menuSep{height:.5px;margin:3px 8px;background:var(--dsw-alias-border-l2,var(--dsw-alias-border-l1))}
/* 菜单里的状态块与行左右对齐（卡片自带 4px 内边距）。 */
.cp-menu .cp-status{padding:4px 8px 6px}
.cp-status{padding:10px 12px}
/* 工具清单：可视高度固定（约 12 行），工具再多也在里面滚，菜单不再跟着长高。 */
.cp-tools{max-height:224px;overflow-y:auto;overscroll-behavior:contain;padding-right:2px;margin-top:2px}
.cp-statusRow{display:flex;align-items:center;gap:8px;font-size:11.5px;padding:2px 0}
.cp-sw{width:7px;height:7px;border-radius:50%;flex:none}
.cp-sw[data-s="on"]{background:var(--dsw-alias-state-success-primary)}
.cp-sw[data-s="defer"]{background:#c98a1f}
.cp-sw[data-s="off"]{background:var(--dsw-alias-state-error-primary)}
.cp-statusRow .nm{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px}
.cp-statusRow .st{margin-left:auto;color:var(--dsw-alias-label-secondary)}
.cp-mini{font-size:11px;color:var(--dsw-alias-label-secondary)}
`

    /* ── 数据层 ─────────────────────────────────────────── */

    const store = { snapshot: null, error: null, inflight: null, listeners: new Set() }

    function emit() {
      for (const listener of [...store.listeners]) {
        try {
          listener()
        } catch {
          /* 忽略单个组件错误 */
        }
      }
    }

    async function request(url, options) {
      const response = await fetch(url, {
        cache: 'no-store',
        headers: options?.body ? { 'content-type': 'application/json' } : undefined,
        ...options,
      })
      const text = await response.text()
      let parsed = null
      try {
        parsed = text ? JSON.parse(text) : null
      } catch {
        throw new Error(`接口返回的不是 JSON（HTTP ${response.status}）`)
      }
      if (!response.ok || !parsed?.ok) throw new Error(parsed?.error || `请求失败（HTTP ${response.status}）`)
      return parsed
    }

    function loadSnapshot(force) {
      if (store.inflight && !force) return store.inflight
      store.inflight = request(API_STATE)
        .then((snapshot) => {
          store.snapshot = snapshot
          store.error = null
          store.inflight = null
          emit()
          return snapshot
        })
        .catch((error) => {
          store.error = error.message || String(error)
          store.inflight = null
          emit()
          throw error
        })
      return store.inflight
    }

    function useSnapshot() {
      const [, tick] = useState(0)
      useEffect(() => {
        const listener = () => tick((value) => value + 1)
        store.listeners.add(listener)
        if (!store.snapshot && !store.error) loadSnapshot().catch(() => {})
        return () => store.listeners.delete(listener)
      }, [])
      return store.snapshot
    }

    function useError() {
      const [, tick] = useState(0)
      useEffect(() => {
        const listener = () => tick((value) => value + 1)
        store.listeners.add(listener)
        return () => store.listeners.delete(listener)
      }, [])
      return store.error
    }

    /* ── 解析（与 Host 同一套规则） ──────────────────────── */

    function effective(profile, tool) {
      const groupState = profile.groups?.[tool.group] ?? ON
      const serverState = tool.server ? profile.servers?.[tool.server] ?? ON : ON
      const toolState = profile.tools?.[tool.name] ?? ON
      if (groupState === FORCE) return ON
      if (groupState === OFF) return OFF
      if (serverState === FORCE) return ON
      if (serverState === OFF) return OFF
      if (toolState === OFF) return OFF
      if (toolState === DEFER) return DEFER
      if (groupState === DEFER || serverState === DEFER) return DEFER
      return ON
    }

    function statsFor(profile, tools, presetToolNames) {
      let on = 0
      let defer = 0
      let off = 0
      let onTokens = 0
      let deferTokens = 0
      for (const tool of tools) {
        if (presetToolNames && !presetToolNames.has(tool.name)) continue
        const state = effective(profile, tool)
        if (state === ON) {
          on += 1
          onTokens += tool.tokens
        } else if (state === DEFER) {
          defer += 1
          deferTokens += Math.max(8, Math.round(tool.tokens * 0.35))
        } else {
          off += 1
        }
      }
      return { on, defer, off, onTokens, deferTokens }
    }

    function formatTokens(value) {
      if (!Number.isFinite(value)) return '—'
      if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`
      return String(Math.round(value))
    }

    function presetNames(snapshot, presetId) {
      const preset = snapshot?.presets?.find((item) => item.id === presetId)
      return preset ? new Set(preset.tools.map((tool) => tool.name)) : null
    }

    /* ── 基础组件 ───────────────────────────────────────── */

    function Seg({ value, options, onChange, small, disabled }) {
      return h(
        'div',
        { className: `cp-seg${small ? ' sm' : ''}` },
        ...options.map(([id, label, tone]) =>
          h(
            'button',
            {
              key: id,
              type: 'button',
              disabled,
              'data-on': value === id ? '1' : '0',
              'data-tone': tone || undefined,
              onClick: (event) => {
                event.preventDefault()
                event.stopPropagation()
                if (!disabled) onChange(id)
              },
            },
            label,
          ),
        ),
      )
    }

    const STATE_LABEL = { on: '注入', defer: '延迟', off: '隐藏', force: '强制开启' }

    function Eff({ state }) {
      if (!state) return null
      return h('span', { className: 'cp-eff', 'data-s': state }, STATE_LABEL[state] ?? state)
    }

    function Glyph({ size = 18, className }) {
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
          className,
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

    function Chevron({ size = 16 }) {
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
          className: 'cp-seatChevron',
          style: { display: 'block' },
        },
        h('path', { d: 'm6 9.5 6 6 6-6' }),
      )
    }

    function Check() {
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
          className: 'cp-rowCheck',
          style: { display: 'block' },
        },
        h('path', { d: 'M3.4 8.4 6.3 11.3 12.6 4.8' }),
      )
    }

    function Popover({ anchor, onClose, label, children }) {
      const [pos, setPos] = useState(null)
      const ref = useRef(null)
      useEffect(() => {
        const onDoc = (event) => {
          if (ref.current && !ref.current.contains(event.target) && !anchor?.current?.contains(event.target)) onClose()
        }
        const onKey = (event) => {
          if (event.key === 'Escape') onClose()
        }
        document.addEventListener('mousedown', onDoc)
        document.addEventListener('keydown', onKey)
        return () => {
          document.removeEventListener('mousedown', onDoc)
          document.removeEventListener('keydown', onKey)
        }
      }, [anchor, onClose])
      // 卡片尺寸要等渲染后才知道：先量再定位，翻不下就翻到触发器上方。
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
      return ReactDOM.createPortal(
        h(
          'div',
          {
            className: 'cp-menu',
            ref,
            role: 'menu',
            'aria-label': label,
            style: pos ? { left: pos.left, top: pos.top } : { left: -9999, top: -9999, visibility: 'hidden' },
          },
          children,
        ),
        document.body,
      )
    }

    /**
     * 触发器：新会话行用整尺寸 seat；会话头部用 compact（与宿主「模式」静态标签
     * 同字号/同色，见 `.cp-seat[data-compact="1"]`）。
     */
    function Seat({ anchorRef, open, onClick, title, label, count, compact }) {
      return h(
        'button',
        {
          ref: anchorRef,
          type: 'button',
          className: 'cp-seat',
          'data-compact': compact ? '1' : undefined,
          'aria-haspopup': 'menu',
          'aria-expanded': open ? 'true' : 'false',
          title,
          onClick,
        },
        h(Glyph, { size: compact ? 14 : 16, className: 'cp-seatIcon' }),
        h('span', { className: 'cp-seatLabel' }, label),
        count != null ? h('span', { className: 'cp-seatCount' }, String(count)) : null,
        h(Chevron, { size: compact ? 14 : 16 }),
      )
    }

    function MenuRow({ selected, onClick, name, desc, count }) {
      return h(
        'button',
        {
          type: 'button',
          role: 'menuitemradio',
          'aria-checked': selected ? 'true' : 'false',
          className: 'cp-row',
          onClick,
        },
        h('span', { className: 'cp-rowMain' }, h('span', { className: 'cp-rowName' }, name), desc ? h('span', { className: 'cp-rowDesc' }, desc) : null),
        count != null ? h('span', { className: 'cp-rowCount' }, String(count)) : null,
        // 未选中也留出勾位，右侧计数才不会左右跳。
        selected ? h(Check, null) : h('span', { className: 'cp-rowCheck', 'aria-hidden': true }),
      )
    }

    /* ── 配置页 ─────────────────────────────────────────── */

    function ConfigPanel(props) {
      const snapshot = useSnapshot()
      const error = useError()
      const [draft, setDraft] = useState(null)
      const [selectedId, setSelectedId] = useState(null)
      const [busy, setBusy] = useState(false)
      const [status, setStatus] = useState(null)
      const [previewOpen, setPreviewOpen] = useState(false)
      const [previewMode, setPreviewMode] = useState(null)
      const [summaryKey, setSummaryKey] = useState(null)

      useEffect(() => {
        if (!snapshot || draft) return
        setDraft(JSON.parse(JSON.stringify({ profiles: snapshot.profiles, lastUsedId: snapshot.lastUsedId })))
        setSelectedId(snapshot.profiles[0]?.id ?? null)
      }, [snapshot, draft])

      const profile = useMemo(
        () => draft?.profiles?.find((item) => item.id === selectedId) ?? null,
        [draft, selectedId],
      )

      const groups = snapshot?.groups ?? []
      const tools = snapshot?.tools ?? []
      const toolsByGroup = useMemo(() => {
        const map = new Map()
        for (const tool of tools) {
          if (!map.has(tool.group)) map.set(tool.group, [])
          map.get(tool.group).push(tool)
        }
        return map
      }, [tools])

      const dirty = useMemo(() => {
        if (!snapshot || !draft) return false
        return JSON.stringify(draft) !== JSON.stringify({ profiles: snapshot.profiles, lastUsedId: snapshot.lastUsedId })
      }, [snapshot, draft])

      const patch = useCallback(
        (mutate) => {
          setDraft((current) => {
            if (!current) return current
            const next = JSON.parse(JSON.stringify(current))
            const target = next.profiles.find((item) => item.id === selectedId)
            if (!target) return current
            mutate(target)
            return next
          })
          setStatus(null)
        },
        [selectedId],
      )

      const setGroupState = useCallback(
        (groupId, state) => {
          patch((target) => {
            if (state === ON) delete target.groups[groupId]
            else target.groups[groupId] = state
          })
        },
        [patch],
      )

      const setServerState = useCallback(
        (serverId, state) => {
          patch((target) => {
            if (state === ON) delete target.servers[serverId]
            else target.servers[serverId] = state
          })
        },
        [patch],
      )

      const setToolState = useCallback(
        (toolName, state) => {
          patch((target) => {
            if (state === ON) delete target.tools[toolName]
            else target.tools[toolName] = state
          })
        },
        [patch],
      )

      const clearGroupTools = useCallback(
        (groupId) => {
          patch((target) => {
            for (const tool of toolsByGroup.get(groupId) ?? []) delete target.tools[tool.name]
          })
        },
        [patch, toolsByGroup],
      )

      const addProfile = useCallback(() => {
        if (!draft) return
        let index = draft.profiles.length + 1
        let id = `custom-${index}`
        while (draft.profiles.some((item) => item.id === id)) {
          index += 1
          id = `custom-${index}`
        }
        setDraft({
          ...draft,
          profiles: [
            ...draft.profiles,
            { id, name: `档位 ${index}`, description: '', prompt: { mode: 'inherit', text: '' }, runtimeContext: true, channels: {}, groups: {}, servers: {}, tools: {}, summaries: {} },
          ],
        })
        setSelectedId(id)
        setStatus(null)
      }, [draft])

      const removeProfile = useCallback(() => {
        if (!draft || draft.profiles.length <= 1) return
        const rest = draft.profiles.filter((item) => item.id !== selectedId)
        setDraft({ ...draft, profiles: rest })
        setSelectedId(rest[0].id)
        setStatus(null)
      }, [draft, selectedId])

      const save = useCallback(async () => {
        if (!draft) return
        setBusy(true)
        try {
          const result = await request(API_STATE, { method: 'POST', body: JSON.stringify(draft) })
          store.snapshot = result.snapshot
          setDraft(JSON.parse(JSON.stringify({ profiles: result.snapshot.profiles, lastUsedId: result.snapshot.lastUsedId })))
          setStatus('已保存')
          emit()
        } catch (cause) {
          setStatus(cause.message || String(cause))
        } finally {
          setBusy(false)
        }
      }, [draft])

      if (error) {
        return h(
          'div',
          { className: 'cp-root' },
          h(
            'div',
            { className: 'cp-scroll' },
            h('div', { className: 'cp-card' }, h('p', { className: 'cp-error' }, error), h('button', { className: 'cp-btn', onClick: () => loadSnapshot(true), style: { marginTop: 10 } }, '重试')),
          ),
        )
      }
      if (!snapshot || !draft || !profile) {
        return h('div', { className: 'cp-root' }, h('div', { className: 'cp-empty' }, '正在读取…'))
      }

      const modeNames = presetNames(snapshot, previewMode ?? snapshot.defaultPreset) ?? presetNames(snapshot, snapshot.defaultPreset)
      const s = statsFor(profile, tools, modeNames)

      const perMode = snapshot.presets.map((preset) => ({
        id: preset.id,
        name: preset.name,
        ...statsFor(profile, tools, new Set(preset.tools.map((tool) => tool.name))),
      }))

      const groupRows = groups.map((group) => {
        const list = toolsByGroup.get(group.id) ?? []
        const configuredServers = group.id === 'mcp' ? Object.keys(profile.servers ?? {}) : []
        const servers = [
          ...new Set([...list.map((tool) => tool.server).filter(Boolean), ...configuredServers]),
        ]
        if (list.length === 0 && servers.length === 0) return null
        const groupState = profile.groups?.[group.id] ?? ON
        const groupDeferred =
          groupState === DEFER ||
          (groupState !== OFF && groupState !== FORCE && list.some((tool) => effective(profile, tool) === DEFER))
        const summaryInput = (key, hint) =>
          summaryKey === key
            ? h(
                'div',
                { className: 'cp-field', style: { margin: '2px 0 8px 12px' } },
                h('input', {
                  className: 'cp-input',
                  value: profile.summaries?.[key] ?? '',
                  placeholder: hint,
                  onChange: (event) => {
                    const value = event.target.value
                    patch((target) => {
                      if (value.trim()) target.summaries[key] = value
                      else delete target.summaries[key]
                    })
                  },
                }),
              )
            : null
        return h(
          'div',
          { className: 'cp-card', key: group.id },
          h(
            'div',
            { className: 'cp-groupHead' },
            h('span', { className: 'cp-groupName' }, group.title),
            h('span', { className: 'cp-count' }, `${list.length} 个`),
            group.id === 'mcp' && servers.length > 0 ? h('span', { className: 'cp-mini' }, `${servers.length} 个 server`) : null,
            h('span', { className: 'cp-push' }),
            groupDeferred
              ? h(
                  'button',
                  { className: 'cp-link', type: 'button', title: '目录摘要', onClick: () => setSummaryKey(summaryKey === group.id ? null : group.id) },
                  '摘要',
                )
              : null,
            h(Seg, { value: groupState, options: GROUP_STATES, onChange: (next) => setGroupState(group.id, next) }),
          ),
          summaryInput(group.id, '目录摘要（默认取首个工具描述的首句）'),
          group.id === 'mcp'
            ? servers.map((serverId) => {
                const serverTools = list.filter((tool) => tool.server === serverId)
                const serverState = profile.servers?.[serverId] ?? ON
                return h(
                  'div',
                  { key: serverId },
                  h(
                    'div',
                    { className: 'cp-serverRow' },
                    h('span', { className: 'srv' }, serverId),
                    h('span', { className: 'cp-count' }, serverTools.length > 0 ? `${serverTools.length} 个` : '未上线'),
                    h('span', { className: 'cp-push' }),
                    h(Eff, { state: effective(profile, { name: '', group: group.id, server: serverId }) }),
                    h(
                      'button',
                      { className: 'cp-link', type: 'button', title: '目录摘要', onClick: () => setSummaryKey(summaryKey === serverId ? null : serverId) },
                      '摘要',
                    ),
                    h(Seg, { small: true, value: serverState, options: GROUP_STATES, onChange: (next) => setServerState(serverId, next) }),
                  ),
                  summaryInput(serverId, `目录摘要（server ${serverId}）`),
                  ...serverTools.map((tool) => toolRow(tool, profile, setToolState)),
                )
              })
            : list.map((tool) => toolRow(tool, profile, setToolState)),
          group.id === 'mcp'
            ? null
            : h(
                'button',
                { className: 'cp-link', type: 'button', onClick: () => clearGroupTools(group.id), style: { marginTop: 4 } },
                '清除本组工具级设置',
              ),
        )
      })

      return h(
        'div',
        { className: 'cp-root' },
        h(
          'header',
          { className: 'cp-head' },
          h('div', { className: 'cp-headIcon' }, h(Glyph, { size: 18 })),
          h(
            'div',
            { className: 'cp-headText' },
            h('h1', { className: 'cp-title' }, LABEL),
            h('p', { className: 'cp-sub' }, '在这里配置档位；新会话与已开始的会话都可以选它。组只提供默认值，隐藏与强制开启会压过子项。'),
          ),
          props?.closePanel
            ? h('button', { className: 'cp-iconBtn', onClick: props.closePanel, title: '关闭' }, '✕')
            : null,
        ),
        h(
          'div',
          { className: 'cp-scroll' },
          h(
            'section',
            { className: 'cp-card' },
            h(
              'div',
              { className: 'cp-chipRow' },
              ...draft.profiles.map((item) =>
                h(
                  'button',
                  { key: item.id, className: 'cp-chip', 'data-on': item.id === selectedId ? '1' : '0', onClick: () => setSelectedId(item.id) },
                  item.name,
                ),
              ),
              h('button', { className: 'cp-link', type: 'button', onClick: addProfile }, '+ 新建档位'),
              h('button', { className: 'cp-link', type: 'button', onClick: removeProfile, disabled: draft.profiles.length <= 1 }, '删除当前'),
            ),
            h(
              'div',
              { className: 'cp-field' },
              h('input', {
                className: 'cp-input',
                value: profile.name,
                maxLength: 60,
                'aria-label': '档位名称',
                onChange: (event) => {
                  const value = event.target.value
                  patch((target) => {
                    target.name = value
                  })
                },
              }),
              h('input', {
                className: 'cp-input',
                value: profile.description,
                maxLength: 200,
                placeholder: '一句话说明这套档位用来做什么',
                'aria-label': '档位说明',
                onChange: (event) => {
                  const value = event.target.value
                  patch((target) => {
                    target.description = value
                  })
                },
              }),
            ),
            h('div', { className: 'cp-sep' }),
            h(
              'div',
              { className: 'cp-chipRow' },
              h('span', { className: 'cp-mini' }, `注入 ${s.on} · 延迟 ${s.defer} · 隐藏 ${s.off}`),
              h('span', { className: 'cp-mini' }, `≈ ${formatTokens(s.onTokens)} tokens`),
              h('button', { className: 'cp-link', type: 'button', onClick: () => setPreviewOpen(true) }, '预览各模式结果'),
            ),
            h(
              'div',
              { className: 'cp-chipRow', style: { marginTop: 6 } },
              ...perMode.map((item) => h('span', { className: 'cp-mini', key: item.id }, `${item.name} ${item.on}${item.defer ? `+${item.defer}迟` : ''}`)),
            ),
          ),

          h(
            'section',
            { className: 'cp-card' },
            h('h2', { className: 'cp-cardTitle' }, '系统提示词'),
            h(
              'div',
              { className: 'cp-chipRow' },
              ...[
                ['inherit', '沿用'],
                ['replace', '替换人格段'],
                ['complete', '极简（仅这段）'],
              ].map(([mode, name]) =>
                h(
                  'button',
                  { key: mode, className: 'cp-chip', 'data-on': profile.prompt.mode === mode ? '1' : '0', onClick: () => patch((target) => { target.prompt.mode = mode }) },
                  name,
                ),
              ),
              h('span', { className: 'cp-push' }),
              h('input', {
                type: 'checkbox',
                checked: profile.runtimeContext !== false,
                onChange: (event) => {
                  const value = event.target.checked
                  patch((target) => {
                    target.runtimeContext = value
                  })
                },
              }),
              h('span', { className: 'cp-mini' }, '注入运行时上下文'),
            ),
            h(
              'div',
              { className: 'cp-chipRow', style: { marginTop: 6 } },
              ...CHANNELS.map(([key, label]) =>
                h(
                  React.Fragment,
                  { key },
                  h('input', {
                    type: 'checkbox',
                    checked: profile.channels?.[key] === OFF,
                    title: '拦截只影响发给模型的请求；消息仍写入会话记录',
                    onChange: (event) => {
                      const blocked = event.target.checked
                      patch((target) => {
                        target.channels = target.channels ?? {}
                        if (blocked) target.channels[key] = OFF
                        else delete target.channels[key]
                      })
                    },
                  }),
                  h('span', { className: 'cp-mini' }, label),
                ),
              ),
              h('span', { className: 'cp-mini' }, '（只滤请求，会话记录保留）'),
            ),
            profile.prompt.mode === 'inherit'
              ? null
              : h('div', { className: 'cp-field' }, h('textarea', {
                  className: 'cp-textarea',
                  value: profile.prompt.text,
                  maxLength: 20000,
                  placeholder: '例如：你是一个只做最小改动的编码代理，回复用中文，先给结论。',
                  onChange: (event) => {
                    const value = event.target.value
                    patch((target) => {
                      target.prompt.text = value
                    })
                  },
                })),
          ),

          ...groupRows,

          snapshot.live?.some((item) => !item.blank)
            ? h(
                'p',
                { className: 'cp-mini' },
                '已开始的会话不会自动套用这里的改动；它们只在会话头部确认切换时重算。',
              )
            : null,
        ),
        h(
          'footer',
          { className: 'cp-foot' },
          h('div', { className: 'cp-footNote' }, status ?? (dirty ? '有未保存的改动' : '已保存')),
          h('button', { className: 'cp-btn', type: 'button', onClick: () => loadSnapshot(true), disabled: busy }, '重新读取'),
          h('button', { className: 'cp-btn', 'data-kind': 'primary', type: 'button', onClick: save, disabled: busy || !dirty }, busy ? '保存中…' : '保存'),
        ),
        previewOpen ? h(PreviewDialog, { profile, snapshot, onClose: () => setPreviewOpen(false) }) : null,
      )
    }

    function toolRow(tool, profile, setToolState) {
      const state = effective(profile, tool)
      const raw = profile.tools?.[tool.name] ?? ON
      return h(
        'div',
        { className: 'cp-tool', key: tool.name },
        h('span', { className: 'nm' }, tool.name),
        tool.server ? null : h('span', { className: 'zh' }, tool.description?.slice(0, 44) ?? ''),
        h('span', { className: 'cp-push' }),
        h('span', { className: 'cost' }, `≈${formatTokens(tool.tokens)}`),
        h('span', { className: 'cp-eff', 'data-s': state, title: `记录：${STATE_LABEL[raw]}` }, STATE_LABEL[state]),
        h(Seg, { small: true, value: raw, options: TOOL_STATES, onChange: (next) => setToolState(tool.name, next) }),
      )
    }

    function PreviewDialog({ profile, snapshot, onClose }) {
      const rows = snapshot.presets.map((preset) => {
        const names = new Set(preset.tools.map((tool) => tool.name))
        const stats = statsFor(profile, snapshot.tools, names)
        return { preset, stats }
      })
      return h(
        'div',
        { className: 'cp-pop', style: { left: '50%', top: 80, transform: 'translateX(-50%)', width: 460, maxWidth: '90vw' } },
        h('div', { className: 'cp-popHead' }, h('span', null, `预览：${profile.name}`), h('button', { className: 'cp-link', onClick: onClose }, '关闭')),
        h(
          'div',
          { className: 'cp-status' },
          ...rows.map(({ preset, stats }) =>
            h(
              'div',
              { className: 'cp-statusRow', key: preset.id },
              h('span', { className: 'nm' }, preset.name),
              h('span', { className: 'st' }, `注入 ${stats.on} · 延迟 ${stats.defer} · 隐藏 ${stats.off} · ≈${formatTokens(stats.onTokens)} tokens`),
            ),
          ),
        ),
      )
    }

    /* ── 选择器（新会话 / 会话内） ──────────────────────── */

    function resolveSessionId(props, ctx) {
      const direct = props?.session?.id ?? props?.session?.sessionId ?? props?.sessionId ?? null
      if (direct) return direct
      try {
        const service = ctx?.sessions
        const current = typeof service?.current === 'function' ? service.current() : service?.current
        return current?.id ?? current?.sessionId ?? null
      } catch {
        return null
      }
    }

    function usePicker(props, ctx, options) {
      const snapshot = useSnapshot()
      const anchor = useRef(null)
      const [open, setOpen] = useState(false)
      const fromProps = resolveSessionId(props, ctx)
      const fallbackBlank = options?.fallbackBlank ? snapshot?.live?.find((item) => item.blank)?.sessionId ?? null : null
      const sessionId = fromProps ?? fallbackBlank
      const live = snapshot?.live?.find((item) => item.sessionId === sessionId) ?? null
      const currentId = snapshot?.sessions?.[sessionId] ?? snapshot?.lastUsedId ?? NONE
      const current = snapshot?.profiles?.find((item) => item.id === currentId) ?? null

      const counts = useMemo(() => {
        if (!snapshot) return null
        const presetId = live?.preset ?? snapshot.defaultPreset
        const names = presetNames(snapshot, presetId)
        if (!names) return null
        return { names, presetId }
      }, [snapshot, live])

      const chips = useMemo(() => {
        if (!snapshot || !counts) return []
        const list = snapshot.profiles.map((item) => ({
          id: item.id,
          name: item.name,
          desc: item.description,
          stats: statsFor(item, snapshot.tools, counts.names),
        }))
        list.unshift({ id: NONE, name: '不处理', desc: '按模式原样注入', stats: null })
        return list
      }, [snapshot, counts])

      const choose = useCallback(
        async (profileId) => {
          if (!sessionId) return
          setOpen(false)
          try {
            const result = await request(API_SESSION, { method: 'POST', body: JSON.stringify({ sessionId, profileId }) })
            store.snapshot = result.snapshot
            emit()
          } catch (error) {
            console.warn('[session-context-config] 切换档位失败', error)
          }
        },
        [sessionId],
      )

      return { snapshot, sessionId, current, currentId, chips, open, setOpen, anchor, choose }
    }

    function HeroChip(props) {
      const ctx = props?.ctx
      const picker = usePicker(props, ctx, { fallbackBlank: true })
      if (!picker.snapshot || !picker.sessionId) return null
      const stats = picker.current
        ? statsFor(picker.current, picker.snapshot.tools, presetNames(picker.snapshot, picker.snapshot.live?.find((i) => i.sessionId === picker.sessionId)?.preset ?? picker.snapshot.defaultPreset))
        : null
      return h(
        React.Fragment,
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
              h('div', { className: 'cp-menuHead' }, h('span', null, '本次会话的工具档位'), h('span', { className: 'cp-menuNote' }, '只作用于本会话')),
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

    function SessionChip(props) {
      const ctx = props?.ctx
      const picker = usePicker(props, ctx)
      const [status, setStatus] = useState(null)
      const [confirmId, setConfirmId] = useState(null)
      const anchor = picker.anchor

      // 工具状态也是「注入计数」的来源：挂载时就取一次，别等用户点开才知道
      // 有几个工具在注入；打开时再取一次，保证清单是最新的。
      useEffect(() => {
        if (!picker.sessionId) return
        let alive = true
        request(`${API_SESSION}?id=${encodeURIComponent(picker.sessionId)}`)
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
        React.Fragment,
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
                { className: 'cp-menuHead' },
                h('span', null, '本会话工具状态'),
                h('span', { className: 'cp-menuNote' }, status?.blank ? '尚未开始的会话可随时切换' : '切换会重建前缀缓存'),
              ),
              status
                ? h(
                    'div',
                    { className: 'cp-status' },
                    h(
                      'div',
                      { className: 'cp-statusRow' },
                      h('span', null, `注入 ${status.tools.filter((tool) => tool.state === ON).length}`),
                      h('span', null, `延迟 ${status.tools.filter((tool) => tool.state === DEFER).length}`),
                      h('span', null, `隐藏 ${status.tools.filter((tool) => tool.state === OFF).length}`),
                    ),
                    // 全部工具都进清单，区域高度固定、里面自己滚——不靠截断。
                    h(
                      'div',
                      { className: 'cp-tools' },
                      ...status.tools.map((tool) =>
                        h(
                          'div',
                          { className: 'cp-statusRow', key: tool.name },
                          h('span', { className: 'cp-sw', 'data-s': tool.state }),
                          h('span', { className: 'nm' }, tool.name),
                          h('span', { className: 'st' }, tool.state === DEFER && tool.loaded ? '延迟 · 已取定义' : STATE_LABEL[tool.state]),
                        ),
                      ),
                    ),
                  )
                : h('div', { className: 'cp-status cp-mini' }, '正在读取状态…'),
              h('div', { className: 'cp-menuSep' }),
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
                    { className: 'cp-status' },
                    h('div', { className: 'cp-mini', style: { marginBottom: 8 } }, '确认切换？工具表整体替换，缓存从第一个变化的 schema 处重建。'),
                    h(
                      'div',
                      { style: { display: 'flex', gap: 8, justifyContent: 'flex-end' } },
                      h('button', { className: 'cp-btn', onClick: () => setConfirmId(null) }, '取消'),
                      h(
                        'button',
                        {
                          className: 'cp-btn',
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

    /* ── 注册 ───────────────────────────────────────────── */

    function SidebarGlyph() {
      return h(Glyph, { size: 16 })
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        // 样式必须挂在插件层：配置页只是其中一处，两个 chip 在别的槽里，
        // 样式若跟着面板渲染，chip 就会是裸元素。
        ctx.effect(() => {
          const style = document.createElement('style')
          style.setAttribute('data-dsh-plugin', 'session-context-config')
          style.textContent = CSS
          document.head.appendChild(style)
          return () => style.remove()
        }, 'session-context-config: styles')

        let layoutService = null
        try {
          ctx.inject(['layout'], (scoped) => {
            layoutService = scoped.layout
            return () => {
              layoutService = null
            }
          })
        } catch {
          /* 无 layout 时不可关闭面板 */
        }
        const layout = () => {
          try {
            return layoutService ?? (typeof ctx.get === 'function' ? ctx.get('layout') ?? ctx.layout : undefined)
          } catch {
            return undefined
          }
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
            (props) => h(ConfigPanel, { ...props }),
          ),
        )

        ctx.slots.inject('conversation.hero.options', () =>
          ctx.slots.register({ name: 'conversation.hero.options', id: 'session-context-config', order: 20 }, (props) => h(HeroChip, { ...props, ctx })),
        )

        // 会话头部：和「模式」标签同槽（那个静态标签 order -10），排在它右侧；
        // 放进 utilities 会被推到整行最右端。
        ctx.slots.inject('conversation.session.header.actions', () =>
          ctx.slots.register({ name: 'conversation.session.header.actions', id: 'session-context-config', order: 10 }, (props) => h(SessionChip, { ...props, ctx })),
        )
      },
    }
  },
})

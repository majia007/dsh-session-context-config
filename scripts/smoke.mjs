/**
 * Client bundle 冒烟：把 lib/client.js 装进 `window.__ModuleLoader__` 桩，
 * 用假的 /session-context-config/api 数据在 happy-dom 里渲染配置面板与两个 chip，
 * 并模拟点击。
 *
 * 只断言结构与语义（seat 结构、aria-checked、勾只在选中行、分段选择/复选行的原生
 * 语义、头部菜单含状态块与确认块），不做像素比对——外观核对看真实窗口截图。
 *
 * 依赖来自本项目 devDependencies（react/react-dom/happy-dom）；跑之前先 pnpm build。
 * 断言与旧版逐字一致，仅三处随结构迁移：bundle 路径 client.js → lib/client.js、
 * 依赖从 DSH_SRC 的 pnpm store 借改为本地 node_modules、mount 时把注册面的
 * inject face 合并进 props（组件不再收 ctx，sessionId 由 face 提供）。
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const bundle = resolve(here, '..', 'lib', 'client.js')

const require = createRequire(import.meta.url)
const React = require('react')
const ReactDOM = require('react-dom')
const ReactDOMClient = require('react-dom/client')
const ReactDOMTestUtils = require('react-dom/test-utils')
const act = React.act ?? ReactDOMTestUtils.act

const { Window } = await import('happy-dom')
const win = new Window({ url: 'http://localhost/', width: 1280, height: 800 })
for (const key of [
  'window', 'document', 'navigator', 'Node', 'Element', 'HTMLElement', 'SVGElement', 'Text',
  'Event', 'MouseEvent', 'KeyboardEvent', 'CustomEvent', 'getComputedStyle',
  'requestAnimationFrame', 'cancelAnimationFrame', 'ResizeObserver',
]) {
  const value = key === 'window' ? win : key === 'document' ? win.document : win[key]
  try {
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true })
  } catch {
    /* navigator 在 Node 里是只读访问器，跳过即可 */
  }
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

/* ── 假数据：两个档位、十五个工具（超过可视行数，验证不截断）、一个空白会话 ── */

const tools = [
  { name: 'read', description: 'Read a file', group: 'files', server: null, chars: 100, tokens: 80 },
  { name: 'write', description: 'Write a file', group: 'files', server: null, chars: 120, tokens: 90 },
  ...Array.from({ length: 13 }, (_, index) => ({
    name: `tool_${String(index + 1).padStart(2, '0')}`,
    description: `Generated tool ${index + 1}`,
    group: 'files',
    server: null,
    chars: 80,
    tokens: 40,
  })),
]
const profile = (id, name, description) => ({
  id, name, description, groups: {}, servers: {}, tools: {},
  prompt: { mode: 'inherit', text: '' }, runtimeContext: true, summaries: {},
})
const snapshot = {
  ok: true,
  version: 2,
  profiles: [profile('standard', '完整', '标准档位，处理代码和资料'), profile('lean', '精简', '只留必要工具')],
  lastUsedId: 'standard',
  sessions: { s1: 'standard' },
  baseline: { contract: true, cardReceipt: true, untrustedFiles: true, environmentFacts: true, inCompletePrompt: true },
  presets: [{ id: 'standard', name: '标准模式', tools }],
  defaultPreset: 'standard',
  tools,
  groups: [{ id: 'files', title: '文件' }],
  live: [{ sessionId: 's1', preset: 'standard', blank: true, profileId: 'standard', deferred: 1, hidden: 0, loaded: 0 }],
  diagnostics: [],
}
const sessionState = {
  ok: true,
  blank: true,
  tools: tools.map((tool, index) => ({
    name: tool.name,
    state: index % 5 === 4 ? 'off' : index % 3 === 2 ? 'defer' : 'on',
    loaded: false,
  })),
}

const fetches = []
globalThis.fetch = async (url) => {
  fetches.push(String(url))
  const body = String(url).includes('/api/session') ? sessionState : snapshot
  return { ok: true, status: 200, text: async () => JSON.stringify(body) }
}
win.fetch = globalThis.fetch

/* ── 装载 bundle 并拿到注册的渲染函数 ─────────────────────── */

let factory = null
win.__ModuleLoader__ = { load: (registration) => { factory = registration.factory } }
new Function('window', 'document', 'fetch', readFileSync(bundle, 'utf8'))(win, win.document, globalThis.fetch)

const plugin = factory((name) => {
  if (name === 'react') return React
  if (name === 'react-dom') return ReactDOM
  throw new Error(`client bundle 只应该 require react / react-dom，实际要了：${name}`)
})

const renders = new Map()
const faces = new Map()
plugin.apply({
  effect(callback) { return callback() },
  inject(_names, callback) { try { return callback({}) } catch { return () => {} } },
  get() { return undefined },
  sessions: { current: () => ({ id: 's1' }) },
  slots: {
    inject(_name, callback) { callback() },
    register(options, render) { renders.set(options.name, render); faces.set(options.name, options.inject?.() ?? {}); return () => {} },
    registerFactory() { return () => {} },
  },
})

/* ── 断言 ─────────────────────────────────────────────────── */

const failures = []
const check = (label, condition, detail) => {
  if (condition) console.log(`  ✔ ${label}`)
  else failures.push(`${label}${detail === undefined ? '' : ` — ${detail}`}`)
}
const flush = async () => {
  await act(async () => { await new Promise((done) => setTimeout(done, 10)) })
}
const click = async (element) => {
  await act(async () => { element?.dispatchEvent(new win.MouseEvent('click', { bubbles: true })) })
  await flush()
}
const mount = async (name) => {
  const element = win.document.createElement('div')
  win.document.body.appendChild(element)
  const root = ReactDOMClient.createRoot(element)
  act(() => { root.render(React.createElement(renders.get(name), faces.get(name))) })
  await flush()
  return element
}
const menus = () => [...win.document.querySelectorAll('.cp-menu')]
const lastMenu = () => menus()[menus().length - 1]

console.log(`bundle: ${bundle}`)

console.log('\n[hero] 新会话行 chip')
const hero = await mount('conversation.hero.options')
const heroSeat = hero.querySelector('button.cp-seat')
check('触发器是 seat 结构（含图标/箭头）', heroSeat !== null && heroSeat.querySelector('.cp-seatIcon') !== null && heroSeat.querySelector('.cp-seatChevron') !== null)
check('触发器显示当前档位名与计数', heroSeat?.querySelector('.cp-seatLabel')?.textContent === '完整' && heroSeat?.querySelector('.cp-seatCount')?.textContent === String(tools.length), heroSeat?.textContent)
check('初始未展开且声明了菜单语义', heroSeat?.getAttribute('aria-expanded') === 'false' && heroSeat?.getAttribute('aria-haspopup') === 'menu')
check('新会话行用整尺寸 seat', heroSeat?.getAttribute('data-compact') === null)

await click(heroSeat)
const heroMenu = lastMenu()
const heroRows = [...(heroMenu?.querySelectorAll('.cp-row') ?? [])]
check('点击后展开菜单', heroSeat?.getAttribute('aria-expanded') === 'true' && heroMenu !== undefined)
check('菜单含档位标题行', heroMenu?.querySelector('.cp-menuHead')?.textContent?.includes('本次会话的工具档位') === true)
check('行数 = 不处理 + 两个档位', heroRows.length === 3, String(heroRows.length))
check('只有选中行带勾', heroRows.filter((row) => row.querySelector('svg.cp-rowCheck') !== null).length === 1)
check('选中行 aria-checked 正确', heroRows.find((row) => row.querySelector('.cp-rowName')?.textContent === '完整')?.getAttribute('aria-checked') === 'true')
check('未选中行也留了勾位（计数不跳）', heroRows.find((row) => row.querySelector('.cp-rowName')?.textContent === '精简')?.querySelector('.cp-rowCheck') !== null)

console.log('\n[panel] 配置面板')
const panel = await mount('main')
const promptCard = [...panel.querySelectorAll('.cp-card')].find((card) => card.querySelector('.cp-cardTitle')?.textContent === '系统提示词')
const promptChoice = promptCard?.querySelector('.cp-choice')
const promptOpts = [...(promptChoice?.querySelectorAll('.cp-choiceOpt') ?? [])]
check('提示词来源是分段选择', promptChoice?.getAttribute('role') === 'radiogroup')
check('三个档位都是带原生 radio 的可点 label', promptOpts.length === 3 && promptOpts.every((opt) => opt.tagName === 'LABEL' && opt.querySelector('input[type="radio"]') !== null))
const checkRows = [...(promptCard?.querySelectorAll('.cp-check') ?? [])]
check('系统提示词卡里三个布尔项统一为复选行', checkRows.length === 3, String(checkRows.length))
check('复选行把 checkbox 放在文字前（左对齐格式）', checkRows.every((row) => row.firstElementChild?.matches('input[type="checkbox"]') === true))
const runtimeBox = checkRows[0]?.querySelector('input[type="checkbox"]')
check('运行时上下文默认勾选', runtimeBox?.checked === true)
await click(checkRows[0]?.querySelector('.cp-checkLabel'))
check('点 label 文字即可切换复选', runtimeBox?.checked === false)
check('通道行各带自己的说明', checkRows[1]?.querySelector('.cp-checkDesc')?.textContent?.includes('AGENTS.md') === true)
const toolRowEl = panel.querySelector('.cp-tool')
const stateRadios = [...(toolRowEl?.querySelectorAll('.cp-choiceInput') ?? [])]
check('工具状态是三元原生 radio 组', stateRadios.length === 3 && new Set(stateRadios.map((input) => input.name)).size === 1)
check('工具行固定为名字/描述/生效/成本/状态五列', toolRowEl?.children.length === 5, String(toolRowEl?.children.length))
check('生效列在未改写时留空但保留位置', toolRowEl?.querySelector('.cp-shift')?.textContent === '')
check('组状态复用同一分段选择', panel.querySelector('.cp-groupHead .cp-choice') !== null)
await click(promptOpts[2])
check('选「极简」后出现提示词输入框', panel.querySelector('.cp-textarea') !== null)

const baselineCard = [...panel.querySelectorAll('.cp-card')].find((card) => card.querySelector('.cp-cardTitle')?.textContent === '基线（所有新会话）')
const baselineRows = [...(baselineCard?.querySelectorAll('.cp-check') ?? [])]
check('基线卡存在且有 5 个开关', baselineRows.length === 5, String(baselineRows.length))
check('基线开关默认全勾选', baselineRows.every((row) => row.querySelector('input[type="checkbox"]')?.checked === true))
check('基线卡说明与档位无关', baselineCard?.textContent?.includes('与档位无关') === true)
await click(baselineRows[0]?.querySelector('.cp-checkLabel'))
check('关掉行为契约后按钮进入未保存态', panel.querySelector('.cp-footNote')?.textContent?.includes('未保存') === true)

console.log('\n[session header] 会话头部 chip')
const header = await mount('conversation.session.header.actions')
const headerSeat = header.querySelector('button.cp-seat')
check('触发器渲染', headerSeat?.querySelector('.cp-seatLabel')?.textContent === '完整')
const expectedOn = sessionState.tools.filter((tool) => tool.state === 'on').length
check('挂载即显示注入计数（不必先点开）', headerSeat?.querySelector('.cp-seatCount')?.textContent === String(expectedOn), headerSeat?.querySelector('.cp-seatCount')?.textContent)
check('会话头部用紧凑变体（与「模式」标签同字号同色）', headerSeat?.getAttribute('data-compact') === '1' && headerSeat?.querySelector('.cp-seatIcon')?.getAttribute('width') === '14')
const headerStyle = win.getComputedStyle(headerSeat)
check('紧凑变体 = 12px 字号 / 22px 高', headerStyle.fontSize === '12px' && headerStyle.height === '22px', `${headerStyle.fontSize} / ${headerStyle.height}`)
check('新会话行仍是整尺寸 13px', win.getComputedStyle(heroSeat).fontSize === '13px', win.getComputedStyle(heroSeat).fontSize)
// 悬停不展开：React 从 mouseover 合成 onMouseEnter，所以用 mouseover 模拟。
const menusBeforeHover = win.document.querySelectorAll('.cp-menu').length
await act(async () => { headerSeat?.dispatchEvent(new win.MouseEvent('mouseover', { bubbles: true })) })
await flush()
check('悬停不展开（只点击触发）', headerSeat?.getAttribute('aria-expanded') === 'false' && win.document.querySelectorAll('.cp-menu').length === menusBeforeHover)
await click(headerSeat)
const headerMenu = lastMenu()
const headerRows = [...(headerMenu?.querySelectorAll('.cp-row') ?? [])]
const statusRows = headerMenu?.querySelectorAll('.cp-statusRow') ?? []
check('状态块 = 摘要行 + 全部工具（不截断）', statusRows.length === tools.length + 1, String(statusRows.length))
check('工具清单有独立滚动区', headerMenu?.querySelector('.cp-tools') !== null)
check('不再出现「另外 N 个」截断提示', headerMenu?.textContent?.includes('另外') !== true)
check('状态块与选项之间有分隔线', headerMenu?.querySelector('.cp-menuSep') !== null)
check('选项行完整', headerRows.length === 3)
await click(headerRows.find((row) => row.querySelector('.cp-rowName')?.textContent === '精简'))
check('点档位后出现确认块', lastMenu()?.textContent?.includes('确认切换？') === true)

check('只拉取了快照接口', fetches.every((url) => url.startsWith('/session-context-config/api/')))

if (failures.length > 0) {
  console.error(`\n✖ ${failures.length} 项失败：`)
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}
console.log('\n✔ 全部通过')

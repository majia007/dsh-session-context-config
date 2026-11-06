/**
 * Client bundle 冒烟：把 client.js 装进 `window.__ModuleLoader__` 桩，
 * 用假的 /session-context-config/api 数据在 happy-dom 里渲染两个 chip，并模拟点击。
 *
 * 只断言结构与语义（seat 结构、aria-checked、勾只在选中行、头部菜单含状态块
 * 与确认块），不做像素比对——外观核对看真实窗口截图。
 *
 * 依赖 DSH 源码仓库的 pnpm store：react / react-dom / happy-dom 都从那里借，
 * 免得本项目多一份 node_modules。仓库路径用环境变量 DSH_SRC 指定：
 *
 *   node scripts/smoke.mjs
 *   DSH_SRC=D:\somewhere\deepseek-harness node scripts/smoke.mjs
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const bundle = resolve(here, '..', 'client.js')
const repo = process.env.DSH_SRC
if (!repo) {
  console.error('缺少环境变量 DSH_SRC：请指向 DSH 源码仓库根目录（借用其 node_modules/.pnpm 里的依赖）。')
  process.exit(2)
}
const store = join(repo, 'node_modules', '.pnpm')

if (!existsSync(store)) {
  console.error(`找不到 pnpm store：${store}\n请用 DSH_SRC 指向 DSH 源码仓库根目录。`)
  process.exit(2)
}

/** 在 pnpm store 里按「包名@版本前缀」找实际目录，返回包的安装路径。 */
function findPackage(prefixes, subpath) {
  const candidates = readdirSync(store)
    .filter((entry) => prefixes.some((prefix) => entry.startsWith(prefix)))
    .sort((a, b) => b.localeCompare(a, 'en', { numeric: true }))
  for (const entry of candidates) {
    const path = join(store, entry, 'node_modules', subpath)
    if (existsSync(join(path, 'package.json'))) return path
  }
  throw new Error(`pnpm store 里找不到 ${prefixes.join(' / ')}（${store}）`)
}

const require = createRequire(import.meta.url)
const React = require(join(findPackage(['react@18'], 'react'), 'index.js'))
const ReactDOM = require(join(findPackage(['react-dom@18'], 'react-dom'), 'index.js'))
const ReactDOMClient = require(join(findPackage(['react-dom@18'], 'react-dom'), 'client.js'))
const ReactDOMTestUtils = require(join(findPackage(['react-dom@18'], 'react-dom'), 'test-utils.js'))
const act = React.act ?? ReactDOMTestUtils.act
const happyDom = join(findPackage(['happy-dom@'], 'happy-dom'), 'lib', 'index.js')

const { Window } = await import(pathToFileURL(happyDom).href)
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
plugin.apply({
  effect(callback) { return callback() },
  inject(_names, callback) { try { return callback({}) } catch { return () => {} } },
  get() { return undefined },
  sessions: { current: () => ({ id: 's1' }) },
  slots: {
    inject(_name, callback) { callback() },
    register(options, render) { renders.set(options.name, render); return () => {} },
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
  act(() => { root.render(React.createElement(renders.get(name), { ctx: undefined })) })
  await flush()
  return element
}
const menus = () => [...win.document.querySelectorAll('.cp-menu')]
const lastMenu = () => menus()[menus().length - 1]

console.log(`bundle: ${bundle}`)
console.log(`store : ${store}`)

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

/**
 * Client bundle 冒烟：把 lib/client.js 装进 `window.__ModuleLoader__` 桩，
 * 用假的 /session-context-config/api 数据在 happy-dom 里渲染配置面板与两个 chip，
 * 并模拟点击。
 *
 * 只断言结构与语义（seat 结构、aria-checked、勾只在选中行、宿主 SegmentedControl
 * 的 tablist 语义、复选行的原生语义、头部菜单含状态块与确认块），不做像素比对——
 * 外观核对看真实窗口截图。
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
  'requestAnimationFrame', 'cancelAnimationFrame', 'ResizeObserver', 'localStorage',
]) {
  const value = key === 'window' ? win : key === 'document' ? win.document : win[key]
  try {
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true })
  } catch {
    /* navigator 在 Node 里是只读访问器，跳过即可 */
  }
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

// happy-dom 不解析 min();把共享字号变量钉在 14px 标准档的设计值上,
// 让 12/13px 的 computed 断言仍然可读。
for (const px of [11, 12, 13, 14]) {
  win.document.body.style.setProperty(`--dsh-plugin-fs-${px}`, `${px}px`)
}

/* ── 假数据：两个档位、十五个工具（超过可视行数，验证不截断）、一个空白会话 ── */

const tools = [
  {
    name: 'read',
    description: 'Read a file',
    group: 'files',
    server: null,
    chars: 100,
    tokens: 80,
    source: { kind: 'plugin', label: '文件工具', detail: '插件：@deepseek-ai/dsh-tool-fs\n判定：DSH 官方工具目录', evidence: 'catalog' },
  },
  { name: 'write', description: 'Create or fully replace a UTF-8 text file.', group: 'files', server: null, chars: 120, tokens: 90 },
  ...Array.from({ length: 13 }, (_, index) => ({
    name: `tool_${String(index + 1).padStart(2, '0')}`,
    description: `Generated tool ${index + 1}`,
    group: 'files',
    server: null,
    chars: 80,
    tokens: 40,
  })),
]
const personaSlot = () => ({ enabled: true, override: false, text: '' })
const profile = (id, name, description) => ({
  id, name, description, groups: {}, servers: {}, tools: {}, contexts: {}, sections: {}, channels: {},
  prompt: { prefix: personaSlot(), suffix: personaSlot() }, summaries: {},
})
const snapshot = {
  ok: true,
  version: 4,
  profiles: [profile('standard', '完整', '标准档位，处理代码和资料'), profile('lean', '精简', '只留必要工具')],
  lastUsedId: 'standard',
  sessions: { s1: 'standard' },
  baseline: { contract: true, cardReceipt: true, untrustedFiles: true, custom: false, customText: '' },
  presets: [{ id: 'standard', name: '标准模式', tools }],
  defaultPreset: 'standard',
  tools,
  groups: [{ id: 'files', title: '文件' }],
  sections: [
    // 按真实装配顺序排列(identity -1000 → 宿主段 → 工具引导 → 收尾段);
    // 空文本段不进目录(与 /api/state 的过滤一致)。
    { name: 'harness:identity', chars: 48 },
    { name: 'subagent-roles:catalog', chars: 420 },
    { name: 'context:file-reference', chars: 300 },
    { name: 'tool:read', chars: 150 },
    { name: 'tool:write', chars: 100 },
    { name: 'tool:subagent', chars: 400 },
    { name: 'ui:deliverable-file-references', chars: 900 },
    { name: 'harness:source', chars: 240 },
    { name: 'app:web-surface', chars: 900 },
  ],
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
const translateCalls = []
let holdFirstTranslate = true
let pendingTranslate = null
globalThis.fetch = async (url, options) => {
  const target = String(url)
  fetches.push(target)
  if (target.includes('/api/translate')) {
    const text = JSON.parse(String(options?.body ?? '{}')).text
    translateCalls.push(text)
    if (holdFirstTranslate) {
      holdFirstTranslate = false
      return new Promise((resolve) => {
        pendingTranslate = (zh) => resolve({ ok: true, status: 200, text: async () => JSON.stringify({ ok: true, zh }) })
      })
    }
    return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, zh: `译：${text.slice(0, 24)}` }) }
  }
  const body = target.includes('/api/session') ? sessionState : snapshot
  return { ok: true, status: 200, text: async () => JSON.stringify(body) }
}
win.fetch = globalThis.fetch

/* ── 装载 bundle 并拿到注册的渲染函数 ─────────────────────── */

let factory = null
win.__ModuleLoader__ = { load: (registration) => { factory = registration.factory } }
new Function('window', 'document', 'fetch', readFileSync(bundle, 'utf8'))(win, win.document, globalThis.fetch)

/* ui-primitives 桩:镜像宿主 SegmentedControl 的 DOM 契约(tablist + tab 按钮 +
   aria-selected/roving tabindex,见 ui-primitives/src/SegmentedControl.tsx)与 Tag
   的 data-tone 契约(胶囊视觉由宿主 CSS 提供,冒烟只断言语义);几何与键盘走位
   不在冒烟范围,点选路径已覆盖。 */
const SegmentedControlStub = ({ id, value, options, onChange, label }) =>
  React.createElement(
    'div',
    { role: 'tablist', 'aria-label': label },
    options.map((option) =>
      React.createElement(
        'button',
        {
          key: option.value,
          id: `${id}-${option.value}`,
          type: 'button',
          role: 'tab',
          'aria-selected': option.value === value,
          tabIndex: option.value === value ? 0 : -1,
          onClick: () => { if (option.value !== value) onChange(option.value) },
        },
        option.label,
      ),
    ),
  )

const TagStub = ({ tone = 'outline', className, children }) =>
  React.createElement('span', { className: className ?? 'cp-tagStub', 'data-tone': tone }, children)

const plugin = factory((name) => {
  if (name === 'react') return React
  if (name === 'react-dom') return ReactDOM
  if (name === '@deepseek-ai/dsh-client-ui-primitives') return { SegmentedControl: SegmentedControlStub, Tag: TagStub }
  throw new Error(`client bundle 只应该 require react / react-dom / ui-primitives，实际要了：${name}`)
})

const renders = new Map()
const faces = new Map()
/** 与宿主渲染器一致:session 作用域槽位的 inject face 收到会话 id 作为位置参数
 *  (ui-renderer/src/client/scoped-slots.tsx 的 runInject 传 binding.key)。 */
const SESSION_SCOPED_SLOTS = new Set(['conversation.hero.options', 'conversation.session.header.actions'])
const SLOT_SESSION_ID = 's1'
plugin.apply({
  effect(callback) { return callback() },
  inject(_names, callback) { try { return callback({}) } catch { return () => {} } },
  get() { return undefined },
  slots: {
    inject(_name, callback) { callback() },
    register(options, render) {
      renders.set(options.name, render)
      const injected = SESSION_SCOPED_SLOTS.has(options.name) ? options.inject?.(SLOT_SESSION_ID) : options.inject?.()
      faces.set(options.name, injected ?? {})
      return () => {}
    },
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
const profileTabs = [...panel.querySelectorAll('.cp-chipRow [role="tab"]')]
check('档位行用宿主分段选择渲染全部档位', profileTabs.length === 2 && profileTabs.map((tab) => tab.textContent).join('/') === '完整/精简', profileTabs.map((tab) => tab.textContent).join('/'))
const systemCard = [...panel.querySelectorAll('.cp-card')].find((card) => card.querySelector('.cp-msgCardTitle')?.textContent === '系统提示词')
check('system 卡存在', systemCard !== undefined)
check('system 卡不再有提示词来源 tablist', systemCard?.querySelector('[role="tablist"]') == null)
const systemTitleRow = systemCard?.querySelector('.cp-msgTitleRow')
const systemBadge = systemTitleRow?.querySelector('.cp-msgBadge')
check('角色标签跟在标题后面且内容为 role: developer', systemTitleRow?.lastElementChild === systemBadge && systemBadge?.textContent === 'role: developer', systemTitleRow?.innerHTML?.slice(0, 200))
check('卡片不再有 meta 与 footer', panel.querySelector('.cp-msgMeta') === null && panel.querySelector('.cp-msgFoot') === null)
const systemNote = systemCard?.querySelector('.cp-msgNote')?.textContent ?? ''
check('提示不再出现段计数与条件段说明', !systemNote.includes('当前会话装配到') && !systemNote.includes('条件段'))
check('footer 的全局/档位说明已并入提示', systemNote.includes('只作用于根会话') && systemNote.includes('附加规则'))

const segmentRows = () => [...(systemCard?.querySelectorAll('.cp-segment') ?? [])]
const rowByText = (text) => segmentRows().find((row) => row.querySelector('.cp-segmentLabel')?.textContent?.includes(text))
const rowByChip = (name) => segmentRows().find((row) => row.querySelector('.cp-codeChip')?.textContent === name)
const prefixRow = () => rowByChip('deployment:persona-prefix')
const suffixRow = () => rowByChip('deployment:persona-suffix')
const fieldLabels = [...panel.querySelectorAll('.cp-fieldLabel')].map((el) => el.textContent)
check('档位名称/描述有可见 label', fieldLabels.join('/') === '名称/描述', fieldLabels.join('/'))
check('前置人设默认开启', prefixRow()?.querySelector('input[type="checkbox"]')?.checked === true)
check('前置覆盖默认关闭、文本不可用', prefixRow()?.nextElementSibling?.querySelector('input')?.checked === false && prefixRow()?.nextElementSibling?.nextElementSibling?.disabled === true)
await click(prefixRow()?.nextElementSibling?.querySelector('.cp-segmentLabel'))
check('勾选前置覆盖后文本可用', prefixRow()?.nextElementSibling?.nextElementSibling?.disabled === false)
check('两个槽位分开配置:前置覆盖不影响后缘', suffixRow()?.nextElementSibling?.querySelector('input')?.checked === false)
await click(suffixRow()?.querySelector('.cp-segmentLabel'))
check('关闭后缘槽位只禁用后缘自己的覆盖', suffixRow()?.nextElementSibling?.querySelector('input')?.disabled === true && prefixRow()?.nextElementSibling?.querySelector('input')?.checked === true)
await click(suffixRow()?.querySelector('.cp-segmentLabel'))

check('不再区分人设/宿主/工具小区域', systemCard?.querySelector('.cp-groupLabel') === null)
check('段列表不再包滚动容器', systemCard?.querySelector('.cp-sectionList') === null)
const orderNames = segmentRows().map((row) => row.querySelector('.cp-codeChip')?.textContent).filter(Boolean)
check('工具引导段不在这里配置（跟随工具状态）', orderNames.every((name) => !name.startsWith('tool:')))
const expectedOrder = [
  'harness:identity',
  'deployment:persona-prefix',
  'subagent-roles:catalog',
  'context:file-reference',
  'ui:deliverable-file-references',
  'harness:source',
  'app:web-surface',
  'deployment:persona-suffix',
  'session-context-config:contract',
  'session-context-config:card-receipt',
  'session-context-config:untrusted-files',
  'session-context-config:custom-text',
]
check('顺序=实际装配顺序（identity 最前、人设后缀收尾、附加规则最后）', orderNames.join('>') === expectedOrder.join('>'), orderNames.join('>'))
const baselineHeading = [...systemCard.querySelectorAll('.cp-sectionTitle')].find((el) => el.textContent.includes('本插件附加'))
check('附加规则上方有「本插件附加」小标题与说明', baselineHeading?.nextElementSibling?.textContent?.includes('不属于 DSH 自带') === true)
check('每个段行都是 checkbox 前置 + 说明', segmentRows().every((row) => row.firstElementChild?.matches('input[type="checkbox"]') === true && row.querySelector('.cp-segmentDesc') !== null))

const baselineLabels = ['行为契约', '卡片回执', '不可信下载', '自定义文本']
const baselineRows = () => baselineLabels.map(rowByText)
const fixedBaselineRows = () => baselineLabels.slice(0, 3).map(rowByText)
check('附加规则前三段各是一行且默认全开', fixedBaselineRows().every((row) => row?.querySelector('input[type="checkbox"]')?.checked === true))
check('附加规则行标了全局', baselineRows().every((row) => row?.textContent?.includes('全局')))
check('附加规则排在所有段之后', segmentRows().slice(-4).every((row, index) => row.querySelector('.cp-segmentLabel')?.textContent?.includes(baselineLabels[index]) === true))
check('三段固定文本的 tooltip 是注入全文且保留换行', (
  rowByText('行为契约')?.getAttribute('title')?.includes('## 工作契约\n\n- 不可逆') === true &&
  rowByText('卡片回执')?.getAttribute('title')?.includes('## 工具卡片\n\n- 工具结果注明') === true &&
  rowByText('不可信下载')?.getAttribute('title')?.includes('## 不可信下载\n\n把每个下载') === true
))
const customRow = rowByText('自定义文本')
const customTextarea = customRow?.nextElementSibling
check('自定义文本默认未勾选,输入框存在、有可访问名且未禁用(未勾选也可编辑)', customRow?.querySelector('input[type="checkbox"]')?.checked === false && customTextarea?.tagName === 'TEXTAREA' && customTextarea?.getAttribute('aria-label') === '自定义附加文本' && customTextarea?.disabled === false)
await act(async () => {
  // React 受控组件:直接设 value 会被 input value tracker 忽略,要走原型 setter。
  const setValue = Object.getOwnPropertyDescriptor(win.HTMLTextAreaElement.prototype, 'value')?.set
  setValue?.call(customTextarea, '自定义提示第一行\n第二行')
  customTextarea?.dispatchEvent(new win.Event('input', { bubbles: true }))
})
await flush()
check('未勾选时输入文本生效(草稿进入未保存态)', panel.querySelector('.cp-footNote')?.textContent?.includes('未保存') === true && customTextarea?.value === '自定义提示第一行\n第二行', customTextarea?.value)

const snapshotCard = [...panel.querySelectorAll('.cp-card')].find((card) => card.querySelector('.cp-msgCardTitle')?.textContent === '运行时上下文快照')
const snapshotRows = [...(snapshotCard?.querySelectorAll('.cp-segment') ?? [])]
check('快照卡是 7 个段', snapshotRows.length === 7, String(snapshotRows.length))
check('快照段默认全开', snapshotRows.every((row) => row.querySelector('input[type="checkbox"]')?.checked === true))
check('快照段标出上下文名', snapshotCard?.textContent?.includes('working-directory:current') === true)
check('user 卡片角色标签是 role: user', snapshotCard?.querySelector('.cp-msgBadge')?.textContent === 'role: user')
const workspaceCard = [...panel.querySelectorAll('.cp-card')].find((card) => card.querySelector('.cp-msgCardTitle')?.textContent === '工作区指令')
check('工作区指令卡有 checkbox + 说明', workspaceCard?.querySelector('.cp-segment input[type="checkbox"]') !== null && workspaceCard?.textContent?.includes('AGENTS.md') === true)
check('工作区指令卡 footer 并入提示', workspaceCard?.querySelector('.cp-msgNote')?.textContent?.includes('已写入会话记录的消息不会被删除') === true)
const timeCard = [...panel.querySelectorAll('.cp-card')].find((card) => card.querySelector('.cp-msgCardTitle')?.textContent === '时间采样')
check('时间采样卡有 checkbox + 说明', timeCard?.querySelector('.cp-segment input[type="checkbox"]') !== null && timeCard?.textContent?.includes('10 分钟') === true)
check('时间采样卡 footer 并入提示', timeCard?.querySelector('.cp-msgNote')?.textContent?.includes('refreshIntervalMs') === true)
const catalogHeading = [...panel.querySelectorAll('.cp-sectionTitle')].find((el) => el.textContent === '工具目录')
check('工具目录上方有分区标题与说明', catalogHeading?.nextElementSibling?.textContent?.includes('工具引导文本跟随工具状态') === true)
const toolRowEl = panel.querySelector('.cp-tool')
const stateTabs = [...(toolRowEl?.querySelectorAll('[role="tab"]') ?? [])]
const toolByName = (name) => [...panel.querySelectorAll('.cp-tool')].find((row) => row.querySelector('.cp-nm')?.textContent === name)
check('工具状态是三元分段选择', stateTabs.length === 3 && stateTabs.filter((tab) => tab.getAttribute('aria-selected') === 'true').length === 1)
check('工具行固定为 名字(含标签)/描述/状态 三列', toolRowEl?.children.length === 3, String(toolRowEl?.children.length))
check('名字与状态标签同在一个单元格', toolRowEl?.querySelector('.cp-nameCell .cp-nm')?.textContent === 'read')
check('每个工具都显示最终状态标签（开启 / success）', toolRowEl?.querySelector('.cp-stateTag')?.textContent === '开启' && toolRowEl?.querySelector('.cp-stateTag [data-tone]')?.getAttribute('data-tone') === 'success')
check('状态标签带同色描边', toolRowEl?.querySelector('.cp-stateTag .cp-stateTagInner') !== null)
check('状态标签旁并排 token 标签（默认描边灰）', toolRowEl?.querySelector('.cp-tokenTag')?.textContent === '≈80' && toolRowEl?.querySelector('.cp-tokenTag [data-tone]')?.getAttribute('data-tone') === 'outline', toolRowEl?.querySelector('.cp-tokenTag')?.textContent)
check('token 标签是状态标签的兄弟节点、不再有独立成本列', toolRowEl?.querySelector('.cp-nameLine > .cp-stateTag + .cp-tokenTag') !== null && toolRowEl?.querySelector('.cp-cost') === null)
check('工具行显示来源短名与完整依据', toolRowEl?.querySelector('.cp-source')?.textContent === '来源 · 文件工具' && toolRowEl?.querySelector('.cp-source')?.getAttribute('title')?.includes('@deepseek-ai/dsh-tool-fs') === true)
check('没有来源的工具显示未识别', toolByName('write')?.querySelector('.cp-source')?.textContent === '来源 · 未识别')
check('组状态复用同一分段选择', panel.querySelector('.cp-groupHead [role="tablist"]') !== null)
check('组标题不再有「摘要」入口与摘要输入', !panel.textContent.includes('目录摘要') && panel.querySelectorAll('.cp-groupHead .cp-link').length === 0)
check('工具目录非空时不显示空目录告警', ![...panel.querySelectorAll('.cp-cardTitle')].some((el) => el.textContent === '工具目录'))

console.log('\n[tool state] 生效状态标签')
const stateText = (row) => row?.querySelector('.cp-stateTag')?.textContent
check('未被改写时无 tooltip', toolByName('read')?.querySelector('.cp-stateTag')?.getAttribute('title') === null)
await click([...panel.querySelectorAll('.cp-groupHead [role="tab"]')].find((tab) => tab.textContent === '延迟'))
const shiftTag = toolByName('read')?.querySelector('.cp-stateTag')
check('组改写生效状态时,标签紧跟在工具名右侧', shiftTag?.previousElementSibling?.classList.contains('cp-nm') === true)
check('标签显示最终状态（延迟）且用告警色调', stateText(toolByName('read')) === '延迟' && shiftTag?.firstElementChild?.getAttribute('data-tone') === 'warning', stateText(toolByName('read')))
check('被改写时 tooltip 说明本行选择', shiftTag?.getAttribute('title')?.includes('本行选择：开启') === true, shiftTag?.getAttribute('title') ?? '')
check('右侧按钮组旁不再有生效列', toolByName('read')?.querySelector('.cp-shift') === null)
await click([...(toolByName('read')?.querySelectorAll('[role="tab"]') ?? [])].find((tab) => tab.textContent === '延迟'))
check('行内选择与生效一致时仍显示标签,只是不再有 tooltip', stateText(toolByName('read')) === '延迟' && toolByName('read')?.querySelector('.cp-stateTag')?.getAttribute('title') === null)
check('换成隐藏时用中性色调', (await (async () => {
  await click([...(toolByName('read')?.querySelectorAll('[role="tab"]') ?? [])].find((tab) => tab.textContent === '隐藏'))
  return stateText(toolByName('read')) === '隐藏' && toolByName('read')?.querySelector('.cp-stateTag [data-tone]')?.getAttribute('data-tone') === 'neutral'
})()))
await click([...(toolByName('read')?.querySelectorAll('[role="tab"]') ?? [])].find((tab) => tab.textContent === '开启'))
await click([...panel.querySelectorAll('.cp-groupHead [role="tab"]')].find((tab) => tab.textContent === '开启'))

console.log('\n[translate] 工具说明切换')
const storedLang = () => JSON.parse(win.localStorage.getItem('dsh-session-context-config:tool-lang') ?? '{}')
const writeRow = toolByName('write')
check('默认显示内置中文', writeRow?.querySelector('.cp-zhText')?.textContent === '创建或完整替换一个 UTF-8 文本文件。' && writeRow?.querySelector('.cp-trBtn')?.textContent === '文A')
await click(writeRow?.querySelector('.cp-trBtn'))
check('点一下切回原文', writeRow?.querySelector('.cp-zhText')?.textContent === 'Create or fully replace a UTF-8 text file.')
await click(writeRow?.querySelector('.cp-trBtn'))
check('再点切回中文且不发翻译请求', writeRow?.querySelector('.cp-zhText')?.textContent === '创建或完整替换一个 UTF-8 文本文件。' && translateCalls.filter((text) => text.includes('Create or fully replace')).length === 0)
check('切换后的语言偏好被记住', storedLang().write === 'zh', JSON.stringify(storedLang()))
const readRow = toolByName('read')
check('未知工具默认自动翻译并进入 loading', readRow?.querySelector('.cp-trBtn')?.textContent === '翻译中…' && readRow?.querySelector('.cp-zhText')?.textContent === 'Read a file')
await act(async () => { pendingTranslate?.('读取一个文件。'); await new Promise((done) => setTimeout(done, 10)) })
check('未知工具译完默认显示中文', readRow?.querySelector('.cp-zhText')?.textContent === '读取一个文件。' && readRow?.querySelector('.cp-trBtn')?.textContent === '文A')
await click(readRow?.querySelector('.cp-trBtn'))
check('未知工具可切回原文并记住', readRow?.querySelector('.cp-zhText')?.textContent === 'Read a file' && storedLang().read === 'source')
await click(readRow?.querySelector('.cp-trBtn'))
check('再切中文不重复请求', readRow?.querySelector('.cp-zhText')?.textContent === '读取一个文件。' && translateCalls.filter((text) => text === 'Read a file').length === 1)

await click(baselineRows()[0]?.querySelector('.cp-segmentLabel'))
check('关掉行为契约后按钮进入未保存态', panel.querySelector('.cp-footNote')?.textContent?.includes('未保存') === true)

console.log('\n[session header] 会话头部 chip')
// 回归守卫:sessionId 只能来自槽位渲染器传入的位置参数,不能依赖 ctx.sessions
// (假 ctx 已不提供 sessions,改回 ctx.sessions 这条路这里会直接渲染不出 seat)。
check('inject face 从槽位参数拿到 sessionId', faces.get('conversation.session.header.actions')?.sessionId === SLOT_SESSION_ID, JSON.stringify(faces.get('conversation.session.header.actions')))
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

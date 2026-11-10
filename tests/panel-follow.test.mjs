/**
 * 配置面板草稿跟随快照的回归(2026-11-10 code-review MEDIUM):
 * 修复前面板开着时外部快照更新(会话 chip 切档位 → POST /api/session → setSnapshot)
 * 不会重建干净草稿,footer 误报「有未保存的改动」,此时保存会把旧 lastUsedId 回滚。
 *
 * 直读 src(Node 类型剥离);宿主 ui-primitives 与 CSS Modules 由 ./client-module-hooks.mjs
 * 桩掉;happy-dom + react-dom 渲染,配方同 scripts/smoke.mjs。
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { register } from 'node:module'

register(new URL('./client-module-hooks.mjs', import.meta.url))

const React = (await import('react')).default
const ReactDOMClient = await import('react-dom/client')
const { act } = React
const { Window } = await import('happy-dom')
const { ConfigPanel } = await import('../src/client/panel/ConfigPanel.ts')
const { setSnapshot } = await import('../src/client/state/store.ts')

const win = new Window({ url: 'http://localhost/', width: 1280, height: 800 })
for (const key of [
  'window', 'document', 'Node', 'Element', 'HTMLElement', 'SVGElement', 'Text',
  'Event', 'MouseEvent', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'localStorage',
]) {
  const value = key === 'window' ? win : key === 'document' ? win.document : win[key]
  try {
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true })
  } catch {
    /* 只读访问器跳过 */
  }
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

/* ── 假快照:两个档位、无工具(回归只关心草稿跟随,不需要工具目录) ── */

const personaSlot = () => ({ enabled: true, override: false, text: '' })
const profile = (id, name) => ({
  id, name, description: '', groups: {}, servers: {}, tools: {}, contexts: {}, sections: {}, channels: {},
  prompt: { prefix: personaSlot(), suffix: personaSlot() }, summaries: {},
})
const snapshotWith = (overrides = {}) => ({
  ok: true,
  version: 4,
  profiles: [profile('full', '完整'), profile('lean', '精简')],
  lastUsedId: 'full',
  sessions: { s1: 'full' },
  baseline: { contract: true, cardReceipt: true, untrustedFiles: true, custom: false, customText: '' },
  presets: [{ id: 'standard', name: '标准模式', tools: [] }],
  defaultPreset: 'standard',
  tools: [],
  groups: [],
  sections: [],
  live: [{ sessionId: 's1', preset: 'standard', blank: true, profileId: 'full', deferred: 0, hidden: 0, loaded: 0 }],
  diagnostics: [],
  ...overrides,
})

globalThis.fetch = async () => ({ ok: true, status: 200, text: async () => JSON.stringify(snapshotWith()) })

const flush = async () => {
  await act(async () => { await new Promise((done) => setTimeout(done, 10)) })
}
const click = async (element) => {
  await act(async () => { element?.dispatchEvent(new win.MouseEvent('click', { bubbles: true })) })
  await flush()
}

test('面板开着时外部快照更新:干净草稿跟随重建不误报,脏草稿冻结', async () => {
  const host = win.document.createElement('div')
  win.document.body.appendChild(host)
  const root = ReactDOMClient.createRoot(host)
  act(() => { root.render(React.createElement(ConfigPanel, {})) })
  await flush()

  const footer = () => host.querySelector('.cp-footNote')?.textContent ?? ''
  const saveButton = () => [...host.querySelectorAll('button')].find((button) => button.textContent === '保存')
  const contractRow = () => [...host.querySelectorAll('label.cp-segment')]
    .find((row) => row.textContent?.includes('行为契约'))
  const contractInput = () => contractRow()?.querySelector('input[type="checkbox"]')

  // 初始:干净,footer=已保存,保存按钮禁用。
  assert.equal(footer(), '已保存')
  assert.equal(saveButton()?.disabled, true)

  // 外部快照更新(chip 切档位:POST /api/session 返回新快照 → setSnapshot)。
  // 回归点:干净草稿必须跟随重建,dirty 不误报;修复前这里变成「有未保存的改动」,
  // 此时点保存会把携带旧 lastUsedId 的草稿写回。
  await act(async () => { setSnapshot(snapshotWith({ lastUsedId: 'lean', sessions: { s1: 'lean' } })) })
  await flush()
  assert.equal(footer(), '已保存')
  assert.equal(saveButton()?.disabled, true)

  // 用户改动:点掉「行为契约」→ 草稿变脏。
  await click(contractRow()?.querySelector('.cp-segmentLabel'))
  assert.equal(contractInput()?.checked, false)
  assert.match(footer(), /未保存/)
  assert.equal(saveButton()?.disabled, false)

  // 脏草稿在外部快照再次更新时冻结:仍报未保存,用户改动不被冲掉。
  await act(async () => { setSnapshot(snapshotWith({ lastUsedId: 'full', sessions: { s1: 'full' } })) })
  await flush()
  assert.match(footer(), /未保存/)
  assert.equal(contractInput()?.checked, false)
  assert.equal(saveButton()?.disabled, false)
})

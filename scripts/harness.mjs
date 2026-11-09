/**
 * 离线激活脚手架(阶段 B0 预检的 session-context-config 版):
 * 按 loader 方式加载 lib/client.js,桩模块表物化 + apply,验 id、四个槽位注册、
 * 样式注入与 inject face(sessionId)。行为细节由 tests/ 与 scripts/smoke.mjs 覆盖。
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import assert from 'node:assert/strict'

const require = createRequire(import.meta.url)
const React = require('react')
const ReactDOM = require('react-dom')

let captured = null
globalThis.window = { __ModuleLoader__: { load(def) { captured = def } } }
const appended = []
globalThis.document = {
  querySelector: () => null,
  createElement: () => ({ dataset: {}, set textContent(value) { appended.push(value) } }),
  head: { appendChild: () => {} },
}

new Function('window', 'document', readFileSync(fileURLToPath(new URL('../lib/client.js', import.meta.url)), 'utf8'))(globalThis.window, globalThis.document)
assert.equal(captured?.id, 'dsh-session-context-config', 'factory id 必须是包名')
const face = captured.factory((name) => {
  if (name === 'react') return React
  if (name === 'react-dom') return ReactDOM
  throw new Error(`模块表没有 ${name}`)
})

assert.deepEqual(face.inject, ['slots'])
assert.equal(typeof face.apply, 'function')

const registrations = new Map()
const ctx = {
  get: () => undefined,
  effect: (fn) => { fn(); return () => {} },
  inject: (names, cb) => { if (names.includes('layout')) return; cb(ctx) },
  sessions: { current: () => ({ id: 's-live' }) },
  slots: {
    inject(name, factory) { factory() },
    register(options, component) { registrations.set(options.name, { options, component }) },
  },
}
face.apply(ctx)
for (const slot of ['sidebar.panellist', 'main', 'conversation.hero.options', 'conversation.session.header.actions']) {
  assert.ok(registrations.has(slot), `槽位 ${slot} 必须注册`)
}
const heroFace = registrations.get('conversation.hero.options').options.inject()
assert.equal(heroFace.sessionId, 's-live', 'hero 槽位的 inject face 要提供当前会话 id')
const mainFace = registrations.get('main').options.inject()
assert.equal(typeof mainFace.closePanel, 'function')
assert.ok(appended.length >= 2 && appended.every((css) => css.includes('.cp-')), '两个 module.css 的样式都要注入')

console.log('harness: lib/client.js 离线激活 OK(id=%s, 槽位 %d 个, 样式 %d 份)', captured.id, registrations.size, appended.length)

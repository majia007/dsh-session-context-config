/**
 * Host 侧的纯函数契约：档位解析、延迟占位、状态归一化。
 *
 * 这三块此前完全没有测试覆盖（smoke 只测 client bundle），而它们决定了「哪个工具进不发」
 * 和「磁盘上坏掉的状态读回来是什么形状」——都是错了也只在运行时才暴露的地方。
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import { defaultState, normalizeState } from '../src/host/state.ts'
import { effectiveState, groupOf, placehold, serverOf, skeleton, summaryFor } from '../src/host/tools.ts'
import { apply, inject, name } from '../src/index.ts'

/** 只写与默认不同的项：状态表里「开启」不落盘。 */
const profile = (overrides = {}) => ({
  groups: {},
  servers: {},
  tools: {},
  summaries: {},
  ...overrides,
})

test('插件面：name / inject / apply 形状不变', () => {
  assert.equal(name, 'session-context-config')
  assert.deepEqual(inject, ['agents', 'tools', 'systemPrompt'])
  assert.equal(typeof apply, 'function')
})

test('分组与 server 归属：锚定前缀，不靠子串猜', () => {
  assert.equal(groupOf('read'), 'files')
  assert.equal(groupOf('pwsh'), 'terminal')
  assert.equal(groupOf('mcp__github__create_issue'), 'mcp')
  assert.equal(groupOf('build_deploy'), 'other')
  assert.equal(serverOf('mcp__github__create_issue'), 'github')
  assert.equal(serverOf('mcp_connector_list'), 'mcp_connector')
  assert.equal(serverOf('read'), null)
})

test('解析优先级：终态压过子项，延迟是可被隐藏覆盖的软状态', () => {
  // 组隐藏：工具自己开启也拦不住
  assert.equal(effectiveState(profile({ groups: { files: 'off' }, tools: { read: 'on' } }), 'read'), 'off')
  // 组强制开启：工具自己隐藏也拦不住
  assert.equal(effectiveState(profile({ groups: { files: 'force' }, tools: { read: 'off' } }), 'read'), 'on')
  // server 终态压过工具
  assert.equal(effectiveState(profile({ servers: { github: 'off' }, tools: { 'mcp__github__x': 'on' } }), 'mcp__github__x'), 'off')
  // 组延迟 + 工具开启 = 延迟
  assert.equal(effectiveState(profile({ groups: { mcp: 'defer' } }), 'mcp__github__x'), 'defer')
  // 工具隐藏压过组延迟
  assert.equal(effectiveState(profile({ groups: { mcp: 'defer' }, tools: { 'mcp__github__x': 'off' } }), 'mcp__github__x'), 'off')
  // 默认全开
  assert.equal(effectiveState(profile(), 'read'), 'on')
})

test('延迟占位：只留必需参数，可选参数交回 tool_search', () => {
  const schema = {
    type: 'object',
    required: ['path'],
    properties: {
      path: { type: 'string', title: 'Path' },
      mode: { type: 'string', enum: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'] },
    },
  }
  const kept = skeleton(schema)
  assert.deepEqual(Object.keys(kept.properties), ['path'])
  assert.equal(kept.properties.path.title, undefined)
  assert.equal(kept.required[0], 'path')
})

test('摘要优先级：server 手写 > 组手写 > 描述首句 > 工具名', () => {
  const p = profile({ summaries: { github: 'GitHub 操作', mcp: '组摘要' } })
  assert.equal(summaryFor(p, 'mcp__github__list', '原文。后半句。'), 'GitHub 操作')
  assert.equal(summaryFor(p, 'mcp__gitlab__list', '原文。后半句。'), '组摘要')
  assert.equal(summaryFor(profile(), 'read', '读取文件。别的描述。'), '读取文件。')
  assert.equal(summaryFor(profile(), 'read', ''), 'read')
})

test('占位定义带延迟标记，且参数已剥成骨架', () => {
  const placeholder = placehold(
    { name: 'read', parameters: { type: 'object', required: ['path'], properties: { path: { type: 'string' }, limit: { type: 'number' } } } },
    '读取文件',
  )
  assert.equal(placeholder.name, 'read')
  assert.match(placeholder.description, /^【延迟】/)
  assert.deepEqual(Object.keys(placeholder.parameters.properties), ['path'])
})

test('状态归一化：版本不符整份作废，重复 id 去掉，坏引用回落', () => {
  const base = defaultState()
  assert.equal(base.lastUsedId, 'none')
  assert.equal(base.profiles.length, 3)

  assert.deepEqual(normalizeState({ version: 1, profiles: [{ id: 'x' }] }), base)

  const normalized = normalizeState({
    version: 2,
    lastUsedId: 'ghost',
    profiles: [
      { id: 'a', name: 'A' },
      { id: 'a', name: '重复' },
      { id: 'Bad Id', name: '非法 id' },
    ],
    sessions: { s1: 'a', s2: 'ghost' },
  })
  assert.deepEqual(normalized.profiles.map((p) => p.id), ['a', 'profile-3'])
  assert.deepEqual(normalized.sessions, { s1: 'a' })
  assert.equal(normalized.lastUsedId, 'none')
})

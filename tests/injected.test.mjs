/**
 * 注入消息清单:按 source.kind 聚合、跳过人类输入、截断超长正文、
 * 与会话历史合并时计数取最大值(避免 `/api/state` 每读一次就翻倍)。
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import { collectInjected, createInjectedMessages } from '../src/host/injected.ts'

const text = (value) => [{ type: 'text', text: value }]

test('observe:按 kind 聚合、只收 user 角色、跳过人类输入/回执', () => {
  const inventory = createInjectedMessages()
  inventory.observe([
    { role: 'user', source: { kind: 'agent-instructions' }, content: text('工作区指令') },
    { role: 'user', source: { kind: 'time-context' }, content: text('Time sampled') },
    { role: 'user', source: { kind: 'time-context' }, content: text('Time sampled again') },
    { role: 'user', source: { kind: 'user' }, content: text('人类输入') },
    { role: 'user', source: { kind: 'user-approval' }, content: text('审批回执') },
    { role: 'assistant', source: { kind: 'model' }, content: text('模型回复') },
    { role: 'user', source: { kind: 'empty' }, content: [] },
  ])
  const entries = new Map(inventory.list().map((entry) => [entry.kind, entry]))
  assert.deepEqual([...entries.keys()].sort(), ['agent-instructions', 'time-context'])
  assert.equal(entries.get('time-context').count, 2)
  assert.equal(entries.get('time-context').text, 'Time sampled again')
  assert.equal(entries.get('agent-instructions').chars, '工作区指令'.length)
})

test('observe:按档位分桶,并行会话的 kind 不串档', () => {
  const inventory = createInjectedMessages()
  inventory.observe([
    { role: 'user', source: { kind: 'alpha-kind' }, content: text('A') },
  ], 'full')
  inventory.observe([
    { role: 'user', source: { kind: 'beta-kind' }, content: text('B') },
  ], 'lean')
  assert.deepEqual(inventory.list('full').map((entry) => entry.kind), ['alpha-kind'])
  assert.deepEqual(inventory.list('lean').map((entry) => entry.kind), ['beta-kind'])
  assert.deepEqual(inventory.list(), [])
})

test('collectInjected:历史里同 kind 计数累加,超长正文截断且标记', () => {
  const long = 'x'.repeat(4100)
  const entries = collectInjected([
    { role: 'user', source: { kind: 'skill-catalog' }, content: text('first') },
    { role: 'user', source: { kind: 'skill-catalog' }, content: text(long) },
    { role: 'user', source: { kind: 'user' }, content: text('human') },
  ])
  assert.equal(entries.length, 1)
  assert.equal(entries[0].count, 2)
  assert.equal(entries[0].chars, long.length)
  assert.equal(entries[0].text.length, 4000)
  assert.equal(entries[0].truncated, true)
})



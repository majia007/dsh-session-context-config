/**
 * 根会话判定回归:宿主没有 `ctx.agents.roots()`。
 *
 * 旧实现每次都调它,rc.1 / rc.2 的 AgentRegistry 都没有这个方法 —— 调用即 TypeError、
 * 被 catch 吞掉后恒返回 true,档位与通道过滤因此套到了子代理头上(线上日志里 792 次
 * "ctx.agents.roots is not a function")。
 *
 * 契约:子代理按会话头 `origin: 'subagent'` 判定;fork 会话带 parentSession 但没有
 * origin,仍是根会话;拿不到会话信息时保守按根处理。
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import { createSessionKit } from '../src/host/sessions.ts'

function createKit() {
  const notes = []
  const ctx = {
    get: () => undefined,
    agents: {
      list: () => [],
      turnBoundaryOf: () => ({ openTurnStartSeq: null, lastTurn: 0, lastStepStartSeq: null }),
      // 旧实现会调它:宿主没有这个方法,谁调谁抛。新实现一次都不该碰。
      roots: () => { throw new TypeError('ctx.agents.roots is not a function') },
    },
    tools: { schemas: () => [], definitions: () => [] },
  }
  return { sessions: createSessionKit(ctx, (source, error) => notes.push({ source, error })), notes }
}

const agentWith = (header) => ({ id: 'agent-1', session: { id: 'session-1', header } })

test('isRootAgent:子代理(origin=subagent)不是根会话', () => {
  const { sessions, notes } = createKit()
  assert.equal(sessions.isRootAgent(agentWith({ origin: 'subagent' })), false)
  assert.deepEqual(notes, [], '不得再调用不存在的 agents.roots')
})

test('isRootAgent:fork 会话与普通会话都是根会话', () => {
  const { sessions } = createKit()
  assert.equal(sessions.isRootAgent(agentWith({ parentSession: 'parent' })), true, 'fork 不是子代理')
  assert.equal(sessions.isRootAgent(agentWith({ cwd: 'C:/work' })), true)
})

test('isRootAgent:拿不到会话信息时保守按根处理', () => {
  const { sessions } = createKit()
  assert.equal(sessions.isRootAgent(undefined), true)
  assert.equal(sessions.isRootAgent({ id: 'agent-1' }), true)
  assert.equal(sessions.isRootAgent({ id: 'agent-1', session: { id: 'session-1' } }), true)
})

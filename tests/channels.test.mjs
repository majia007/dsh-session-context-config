/**
 * 通道过滤器的注册位置回归。
 *
 * time-context 属于 agent preset,在会话创建时挂载,并用 prepend 追加时间消息;
 * 它晚于插件的全局注册,会排到全局 pre-step 过滤器前面,导致关掉「注入时间采样」
 * 后仍漏进一条 time-context user 消息。过滤器必须在 agent/created 时按 agent
 * 再注册一次(prepend),才能包住预设插件。这里用最小假 ctx 固定这个契约。
 */
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { apply } from '../src/index.ts'

/** 假 ctx:只实现 apply 实际用到的面,记录事件监听与 effect。 */
function fakeHost() {
  const events = new Map()
  const ctx = {
    get(name) {
      if (name === 'sessions') return { get: () => null }
      return undefined
    },
    on(name, listener, options) {
      const hooks = events.get(name) ?? []
      const hook = { listener, options }
      if (options?.prepend) hooks.unshift(hook)
      else hooks.push(hook)
      events.set(name, hooks)
      return () => {
        const index = hooks.indexOf(hook)
        if (index >= 0) hooks.splice(index, 1)
      }
    },
    inject(_names, callback) {
      callback({ get: () => undefined, effect: () => () => {} })
    },
    effect(fn) {
      const dispose = fn()
      return typeof dispose === 'function' ? dispose : () => {}
    },
    tools: {
      register: () => () => {},
      schemas: () => [],
      definitions: () => [],
      view: () => ({ restrictableNames: [] }),
    },
    agents: { list: () => [], roots: () => [], turnBoundaryOf: () => ({ lastTurn: 0 }) },
    systemPrompt: {
      section: () => () => {},
      assemble: async () => ({ sections: [], contexts: [] }),
      refreshContext: (assembly) => assembly,
    },
  }
  return { ctx, events }
}

function fakeAgent() {
  const registrations = []
  const ctx = {
    on(name, listener, options) {
      const registration = { name, listener, options }
      registrations.push(registration)
      return () => {
        const index = registrations.indexOf(registration)
        if (index >= 0) registrations.splice(index, 1)
      }
    },
    tools: { restrict: () => () => {}, register: () => () => {} },
    systemPrompt: {
      section: () => () => {},
      context: () => () => {},
      getSectionOrder: () => 0,
      getContextOrder: () => 0,
    },
  }
  const agent = { id: 's1', sessionId: 's1', session: { id: 's1', header: {} }, ctx }
  return { agent, registrations }
}

test('通道关闭：agent 作用域过滤器包住后挂的 time-context，两类消息都被滤掉', async () => {
  const home = mkdtempSync(join(tmpdir(), 'scc-channels-'))
  writeFileSync(join(home, 'session-context-config.json'), JSON.stringify({
    version: 3,
    lastUsedId: 'chat',
    profiles: [{
      id: 'chat',
      name: 'Chat',
      description: '',
      prompt: { override: true, text: '' },
      contexts: {},
      sections: {},
      channels: { workspaceInstructions: 'off', timeContext: 'off' },
      groups: {},
      servers: {},
      tools: {},
      summaries: {},
    }],
    sessions: {},
    baseline: { contract: false, cardReceipt: false, untrustedFiles: false },
  }))
  const previousHome = process.env.DSH_HOME
  process.env.DSH_HOME = home
  try {
    const { ctx, events } = fakeHost()
    apply(ctx)

    const { agent, registrations } = fakeAgent()
    ctx.agents.roots = () => [agent]
    const created = events.get('agent/created')?.[0]?.listener
    assert.equal(typeof created, 'function')
    await created({ agent })

    // 关键契约:agent/created 时必须按 agent 注册 pre-step 过滤器,且 prepend。
    const channel = registrations.find((entry) => entry.name === 'agent/pre-step')
    assert.ok(channel, 'agent/created 里没有注册 agent/pre-step 过滤器')
    assert.equal(channel.options?.prepend, true)

    const decision = {
      kind: 'enter',
      messages: [
        { source: { kind: 'user' } },
        { source: { kind: 'time-context' } },
        { source: { kind: 'agent-instructions' } },
      ],
    }
    const result = await channel.listener({ agent }, async () => decision)
    assert.deepEqual(result.messages.map((message) => message.source.kind), ['user'])
  } finally {
    if (previousHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previousHome
  }
})

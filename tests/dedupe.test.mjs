/**
 * 技能注入去重（profile.injectDuplicateSkills，默认开）回归。
 *
 * 默认与宿主一致：用户消息里写 /技能名 会让宿主注入整份技能正文，即使模型此前已用
 * skill 工具加载过同一技能。关闭开关（injectDuplicateSkills=false）后，插件在 pre-step
 * 过滤器里按「可见历史」判定：同正文已经在 deriveMessages() 里就剔除本次注入；历史里
 * 查不到（含已被压缩/替换）则保留，绝不丢指令。
 */
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { apply } from '../src/index.ts'

const BODY = '<skill_content name="demo-skill">\n技能正文\n</skill_content>'

/** 假 ctx：只实现 apply 实际用到的面，记录事件监听与 effect。 */
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

function fakeAgent({ history = [], deriveThrows = false } = {}) {
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
  const session = {
    id: 's1',
    header: {},
    deriveMessages: () => {
      if (deriveThrows) throw new Error('derivation failed')
      return history
    },
  }
  const agent = { id: 's1', sessionId: 's1', session, ctx }
  return { agent, registrations }
}

/** 写一份档位状态；`profile` 覆盖在默认档位上，`sessions` 把会话钉在该档位。 */
function writeState(home, profile) {
  writeFileSync(join(home, 'session-context-config.json'), JSON.stringify({
    version: 4,
    lastUsedId: 'demo',
    profiles: [{
      id: 'demo',
      name: 'Demo',
      description: '',
      prompt: {},
      contexts: {},
      sections: {},
      channels: {},
      groups: {},
      servers: {},
      tools: {},
      summaries: {},
      baseline: { contract: false, cardReceipt: false, untrustedFiles: false },
      ...profile,
    }],
    sessions: { s1: 'demo' },
    baseline: { contract: false, cardReceipt: false, untrustedFiles: false },
  }))
}

/** 跑一遍 pre-step：返回过滤器交给宿主的消息。 */
async function runStep({ injectDuplicates, legacyDedupe = false, history, deriveThrows = false }) {
  const home = mkdtempSync(join(tmpdir(), 'scc-dedupe-'))
  // 旧字段语义相反：dedupeSkillInjection=true 表示不重复注入，读入时应迁移成 false。
  writeState(home, legacyDedupe ? { dedupeSkillInjection: true } : { injectDuplicateSkills: injectDuplicates })
  const previousHome = process.env.DSH_HOME
  process.env.DSH_HOME = home
  try {
    const { ctx, events } = fakeHost()
    apply(ctx)
    const { agent, registrations } = fakeAgent({ history, deriveThrows })
    const created = events.get('agent/created')?.[0]?.listener
    assert.equal(typeof created, 'function')
    await created({ agent })
    const channel = registrations.find((entry) => entry.name === 'agent/pre-step')
    assert.ok(channel, 'agent/created 里没有注册 agent/pre-step 过滤器')
    const decision = {
      kind: 'enter',
      messages: [
        { role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '参考 /demo-skill' }] },
        { role: 'user', source: { kind: 'skill-invocation', name: 'demo-skill' }, content: [{ type: 'text', text: BODY }] },
      ],
    }
    const result = await channel.listener({ agent }, async () => decision)
    return result.messages.map((message) => message.source.kind)
  } finally {
    if (previousHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previousHome
  }
}

test('默认（字段缺省）：即使历史里有同正文也照旧注入', async () => {
  const kinds = await runStep({
    history: [{ role: 'tool', source: { kind: 'tool' }, content: [{ type: 'text', text: BODY }] }],
  })
  assert.deepEqual(kinds, ['user', 'skill-invocation'])
})

test('关闭注入重复正文：同正文已在可见历史里，手势注入被剔除', async () => {
  const kinds = await runStep({
    injectDuplicates: false,
    history: [{ role: 'tool', source: { kind: 'tool' }, content: [{ type: 'text', text: BODY }] }],
  })
  assert.deepEqual(kinds, ['user'])
})

test('关闭注入重复正文：历史里没有同正文（如已被压缩），注入保留', async () => {
  const kinds = await runStep({ injectDuplicates: false, history: [] })
  assert.deepEqual(kinds, ['user', 'skill-invocation'])
})

test('关闭注入重复正文：正文被别的文本包围（非逐字相同）不算命中', async () => {
  const kinds = await runStep({
    injectDuplicates: false,
    history: [{ role: 'tool', content: [{ type: 'text', text: `前缀\n${BODY}` }] }],
  })
  assert.deepEqual(kinds, ['user', 'skill-invocation'])
})

test('关闭注入重复正文但派生历史失败：不做去重，注入保留', async () => {
  const kinds = await runStep({ injectDuplicates: false, history: [], deriveThrows: true })
  assert.deepEqual(kinds, ['user', 'skill-invocation'])
})

test('旧字段迁移：dedupeSkillInjection=true 等同关闭注入重复正文', async () => {
  const kinds = await runStep({
    legacyDedupe: true,
    history: [{ role: 'tool', content: [{ type: 'text', text: BODY }] }],
  })
  assert.deepEqual(kinds, ['user'])
})

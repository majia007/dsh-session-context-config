/**
 * 已读工作区指令去重（profile.dedupeReadInstructions，默认关）回归。
 *
 * 宿主 agent-instructions 在文件触碰后会把同目录的 AGENTS.md 以
 * `Additional instructions from:` 再注入一次；模型此前若已用 read 完整读过同一份
 * 全文，这次注入就是重复的。开关开启后，本插件按「路径 + 内容摘要」剔除它：
 * - 只删 Additional（新发现的同内容重复）；文件改动后的 Updated 与删除通知保留；
 * - read 不完整（offset/limit 截断、行内截断）或失败时不记录；
 * - 子代理自己的 read 不记录（它的结果不在父会话历史里）；
 * - 摘要不同（read 后文件被改）时保留，宁可重复也不丢更新。
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import test from 'node:test'

import { apply } from '../src/index.ts'

const OPEN = '<system-reminder>'
const CLOSE = '</system-reminder>'
const TARGET = `pkg${sep}AGENTS.md`
const OTHER = `other${sep}AGENTS.md`

/** 按宿主动态注入的真实结构拼一个 Additional section。 */
function additional(path, body) {
  const directory = path.slice(0, path.lastIndexOf(sep))
  return `Additional instructions from: ${path}\n\nThese instructions apply to work under \`${directory}\`. Use them as guidance when relevant; more specific instructions take precedence. They do not override system, developer, or direct user instructions.\n\n${body}`
}

function reminder(...sections) {
  return `${OPEN}\n${sections.join('\n\n')}\n${CLOSE}`
}

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

function fakeAgent(cwd, origin) {
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
  const header = origin === undefined ? { cwd } : { cwd, origin }
  const agent = { id: 's1', sessionId: 's1', session: { id: 's1', header }, ctx }
  return { agent, registrations }
}

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

/**
 * 写一份档位状态、装一次插件、触发一次 read 结果，再跑 pre-step 过滤器。
 * `readPath` 用相对项目根的路径（与宿主的 displayPath 同基准）。
 */
async function runStep({
  profileExtra = {},
  sections,
  readPath = null,
  readBody = '',
  partial = false,
  readError = false,
  origin = undefined,
}) {
  const root = mkdtempSync(join(tmpdir(), 'scc-read-instructions-'))
  // 项目根按宿主默认的 `.git` 标记识别；文件本身不必存在（判定只看内容摘要）。
  mkdirSync(join(root, '.git'))
  const home = mkdtempSync(join(tmpdir(), 'scc-read-instructions-home-'))
  writeState(home, profileExtra)
  const previousHome = process.env.DSH_HOME
  process.env.DSH_HOME = home
  try {
    const { ctx, events } = fakeHost()
    apply(ctx)
    const { agent, registrations } = fakeAgent(root, origin)
    const created = events.get('agent/created')?.[0]?.listener
    assert.equal(typeof created, 'function')
    await created({ agent })
    if (readPath !== null) {
      // read 的结构化输出：offset/lines/totalLines 决定「完整」判定。
      const lines = readBody.split('\n').map((text, index) => ({ number: index + 1, text }))
      const value = {
        path: join(root, readPath),
        offset: 1,
        lines: partial ? lines.slice(0, Math.max(0, lines.length - 1)) : lines,
        totalLines: lines.length,
      }
      const hook = events.get('tools/result')?.[0]
      assert.equal(typeof hook?.listener, 'function', '应注册 tools/result 记录已读文件')
      hook.listener({ name: 'read', agent }, { isError: readError, value })
    }
    const channel = registrations.find((entry) => entry.name === 'agent/pre-step')
      ?? events.get('agent/pre-step')?.[0]
    assert.ok(channel, '没有注册 agent/pre-step 过滤器')
    const result = await channel.listener({ agent }, async () => ({
      kind: 'enter',
      messages: [{
        role: 'user',
        source: { kind: 'agent-instructions' },
        content: [{ type: 'text', text: reminder(...sections) }],
      }],
    }))
    return result.messages
  } finally {
    if (previousHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previousHome
  }
}

function textOf(messages) {
  return messages[0]?.content?.[0]?.text ?? ''
}

test('默认（字段缺省）：完整 read 过同一份指令，宿主再注入仍保留', async () => {
  const messages = await runStep({
    sections: [additional(TARGET, 'rule one')],
    readPath: TARGET,
    readBody: 'rule one',
  })
  assert.equal(messages.length, 1)
  assert.equal(textOf(messages).includes(`Additional instructions from: ${TARGET}`), true)
})

test('开启：与已读内容相同的 Additional 被剔除，其它文件与 Updated 保留', async () => {
  const messages = await runStep({
    profileExtra: { dedupeReadInstructions: true },
    sections: [
      additional(TARGET, 'rule one'),
      additional(OTHER, 'other rule'),
      `Updated instructions from: ${TARGET}\n\nThis file changed after it was loaded. Use the following content instead of the previously loaded instructions from this file.\n\nrule one`,
    ],
    readPath: TARGET,
    readBody: 'rule one',
  })
  assert.equal(messages.length, 1)
  const body = textOf(messages)
  assert.equal(body.includes(`Additional instructions from: ${TARGET}`), false, '已读文件不应再注入')
  assert.equal(body.includes(`Additional instructions from: ${OTHER}`), true, '没读过的文件照常注入')
  assert.equal(body.includes('Updated instructions from: '), true, '文件改动后的更新必须保留')
})

test('开启：整条消息的 section 都被读过时，消息整体不进入请求', async () => {
  const messages = await runStep({
    profileExtra: { dedupeReadInstructions: true },
    sections: [additional(TARGET, 'rule one')],
    readPath: TARGET,
    readBody: 'rule one',
  })
  assert.deepEqual(messages, [])
})

test('开启：read 之后文件内容变了（摘要不同），注入保留', async () => {
  const messages = await runStep({
    profileExtra: { dedupeReadInstructions: true },
    sections: [additional(TARGET, 'new rule')],
    readPath: TARGET,
    readBody: 'old rule',
  })
  assert.equal(messages.length, 1)
})

test('开启：read 不完整（只返回部分行）不算已读，注入保留', async () => {
  const messages = await runStep({
    profileExtra: { dedupeReadInstructions: true },
    sections: [additional(TARGET, 'rule one')],
    readPath: TARGET,
    readBody: 'rule one\nrule two',
    partial: true,
  })
  assert.equal(messages.length, 1)
})

test('开启：失败的 read 不记录，注入保留', async () => {
  const messages = await runStep({
    profileExtra: { dedupeReadInstructions: true },
    sections: [additional(TARGET, 'rule one')],
    readPath: TARGET,
    readBody: 'rule one',
    readError: true,
  })
  assert.equal(messages.length, 1)
})

test('开启：子代理自己的 read 不记录，父会话注入保留', async () => {
  const messages = await runStep({
    profileExtra: { dedupeReadInstructions: true },
    sections: [additional(TARGET, 'rule one')],
    readPath: TARGET,
    readBody: 'rule one',
    origin: 'subagent',
  })
  assert.equal(messages.length, 1)
})

test('开启：基线 Instructions from 段不受影响', async () => {
  const messages = await runStep({
    profileExtra: { dedupeReadInstructions: true },
    sections: [`Instructions from: ${TARGET}\n\nrule one`],
    readPath: TARGET,
    readBody: 'rule one',
  })
  assert.equal(messages.length, 1)
  assert.equal(textOf(messages).includes(`Instructions from: ${TARGET}`), true)
})

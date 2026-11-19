/**
 * 「哪些会话套档位、套哪个」的回归。
 *
 * - 空白新会话:按 lastUsedId 套用并记录;
 * - fork(宿主 isSeeded):按**继承前缀**的日志指纹找回来源会话,继承它的档位——
 *   先扫活会话(零 I/O),再按最新优先回读有限条已结束会话的日志;
 * - 不是 fork、或来源已不可读:显式记成「不处理」,绝不回落 lastUsedId(那会让 chip
 *   显示一个根本没生效的档位,实测 fork 后「完整」写着却一条延迟占位都没有)。
 */
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { apply } from '../src/index.ts'

/**
 * 等条件成立再断言:persistSoon 的 400ms 防抖在负载下可能远超固定 sleep
 * (实测连续两次 build 之后跑测试,固定 600ms 等待出现过一次抖动失败)。
 * 轮询到条件成立为止,超过截止时间抛错让用例失败。
 */
async function waitFor(check, ms = 4000) {
  const deadline = Date.now() + ms
  for (;;) {
    if (check()) return
    if (Date.now() > deadline) throw new Error('waitFor 超时:条件在截止时间内未成立')
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}

/** 一段三事件的继承前缀:fork 认亲按 seq|type|time 逐条比对。 */
const SOURCE_EVENTS = [
  { seq: 0, type: 'permission/preset', time: 1000 },
  { seq: 1, type: 'turn/start', time: 2000 },
  { seq: 2, type: 'user/message', time: 3000 },
]
const OWN_EVENTS = [{ seq: 3, type: 'turn/start', time: 5000 }]

function tool(name) {
  return {
    name,
    description: `${name} 的完整描述第一句。第二句不该进摘要。`,
    parameters: { type: 'object', properties: { [name]: { type: 'string' } } },
  }
}

/** 假宿主:工具表 + 事件表;definitions() 把 agent 作用域的影子叠回去(同真机 view())。 */
function fakeHost() {
  const events = new Map()
  const rootRegistrations = []
  const state = { definitions: [], shadows: [], sessionQuery: undefined }
  const host = {
    state,
    rootRegistrations,
    events,
    ctx: {
      get(name) {
        if (name === 'sessions') return { get: () => null }
        if (name === 'sessionQuery') return state.sessionQuery
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
        register(definition) {
          rootRegistrations.push(definition)
          return () => {}
        },
        schemas: () => [],
        definitions: () => {
          const merged = new Map(state.definitions.map((definition) => [definition.name, definition]))
          for (const record of state.shadows) merged.set(record.definition.name, record.definition)
          return [...merged.values()]
        },
        view: () => ({ restrictableNames: state.definitions.map((definition) => definition.name) }),
      },
      agents: {
        list: () => [],
        roots: () => [],
        turnBoundaryOf: () => ({ lastTurn: 0 }),
      },
      systemPrompt: {
        section: () => () => {},
        assemble: async () => ({ sections: [], contexts: [] }),
        refreshContext: (assembly) => assembly,
      },
    },
  }
  return host
}

/**
 * 假 agent:注册进宿主共享的 shadows(模拟本作用域影子),同时留档供断言。
 * events/inheritedEventCount/header 是 fork 认亲要读的会话面;reader 选读事件的公开方法
 * (真机两者都有,这里分别覆盖 eventAt 主路径与 snapshotEvents 回退路径)。
 */
function fakeAgent(sessionId, host, options = {}) {
  const registerCalls = []
  const restrictCalls = []
  const live = host.state.shadows
  const events = options.events ?? []
  const ctx = {
    on() {
      return () => {}
    },
    tools: {
      register(definition) {
        registerCalls.push(definition)
        const record = { definition, disposed: false }
        live.push(record)
        return () => {
          record.disposed = true
          const index = live.indexOf(record)
          if (index >= 0) live.splice(index, 1)
        }
      },
      restrict(filter) {
        const record = { filter, disposed: false }
        restrictCalls.push(record)
        return () => {
          record.disposed = true
        }
      },
    },
    systemPrompt: {
      section: () => () => {},
      context: () => () => {},
      getSectionOrder: () => 0,
      getContextOrder: () => 0,
    },
  }
  const session = {
    id: sessionId,
    header: options.header ?? {},
    deriveMessages: () => [],
    ...(options.reader === 'snapshot'
      ? { snapshotEvents: () => events }
      : { eventAt: (index) => events[index] }),
    ...(options.inheritedEventCount === undefined ? {} : { inheritedEventCount: options.inheritedEventCount }),
  }
  return {
    agent: { id: sessionId, sessionId, session, ctx },
    registerCalls,
    live,
    restrictCalls,
  }
}

function profile(id, groups) {
  return {
    id,
    name: id,
    description: '',
    prompt: { override: true, text: '' },
    contexts: {},
    sections: {},
    channels: {},
    groups,
    servers: {},
    tools: {},
    summaries: {},
  }
}

/** 在临时 DSH_HOME 里放一份状态文件;回调拿到 home 以便读回落盘结果。 */
function withHome(config, run) {
  const home = mkdtempSync(join(tmpdir(), 'scc-decision-'))
  writeFileSync(join(home, 'session-context-config.json'), JSON.stringify({
    version: 3,
    lastUsedId: config.lastUsedId,
    profiles: config.profiles,
    sessions: config.sessions ?? {},
    baseline: { contract: false, cardReceipt: false, untrustedFiles: false },
  }))
  const previousHome = process.env.DSH_HOME
  process.env.DSH_HOME = home
  return Promise.resolve()
    .then(() => run(home))
    .finally(() => {
      if (previousHome === undefined) delete process.env.DSH_HOME
      else process.env.DSH_HOME = previousHome
    })
}

function recordedSessions(home) {
  return JSON.parse(readFileSync(join(home, 'session-context-config.json'), 'utf8')).sessions ?? {}
}

function listenerOf(host) {
  const created = host.events.get('agent/created')?.[0]?.listener
  assert.equal(typeof created, 'function')
  return created
}

/** fork 子会话:带 isSeeded 头、继承前缀长度与「前缀 + 自己的事件」的日志;options 可覆盖。 */
function forkAgent(sessionId, host, options = {}) {
  return fakeAgent(sessionId, host, {
    header: { isSeeded: true, createdAt: 9000 },
    inheritedEventCount: SOURCE_EVENTS.length,
    events: [...SOURCE_EVENTS, ...OWN_EVENTS],
    ...options,
  })
}

const FULL = () => [profile('full', { devtools: 'defer' })]

test('空白新会话按 lastUsedId 套用并记录', async () => {
  await withHome({ lastUsedId: 'full', profiles: FULL() }, async (home) => {
    const host = fakeHost()
    host.state.definitions = [tool('plugin_manager'), tool('read')]
    apply(host.ctx)

    const child = fakeAgent('s-new', host)
    host.ctx.agents.list = () => [child.agent]
    await listenerOf(host)({ agent: child.agent })

    assert.deepEqual(child.registerCalls.map((definition) => definition.name), ['plugin_manager'])
    assert.match(child.registerCalls[0].description, /^【延迟】/)
    await waitFor(() => recordedSessions(home)['s-new'] === 'full')
  })
})

test('fork:从活着的来源会话继承档位(eventAt 主路径)', async () => {
  await withHome({ lastUsedId: 'lean', profiles: FULL(), sessions: { 'src-live': 'full' } }, async (home) => {
    const host = fakeHost()
    host.state.definitions = [tool('plugin_manager'), tool('read')]
    apply(host.ctx)

    // 真机两个读接口都在;这里只给 eventAt,覆盖主路径。
    const source = fakeAgent('src-live', host, { header: { createdAt: 500 }, events: SOURCE_EVENTS, reader: 'eventAt' })
    const child = forkAgent('s-fork', host, { reader: 'eventAt' })
    host.ctx.agents.list = () => [source.agent, child.agent]
    // fork 带继承的轮次:不是空白会话。
    host.ctx.agents.turnBoundaryOf = () => ({ lastTurn: 3 })
    await listenerOf(host)({ agent: child.agent })

    // 继承的是来源的 full(devtools 延迟),不是 lastUsedId 的 lean。
    assert.deepEqual(child.registerCalls.map((definition) => definition.name), ['plugin_manager'])
    assert.equal(source.registerCalls.length, 0, '来源会话不该被这次决策动到')
    await waitFor(() => recordedSessions(home)['s-fork'] === 'full')
  })
})

test('fork:继承前缀太短时不做认亲(避免同毫秒建的无关会话撞指纹)', async () => {
  await withHome({ lastUsedId: 'full', profiles: FULL(), sessions: { 'src-live': 'full' } }, async (home) => {
    const host = fakeHost()
    host.state.definitions = [tool('plugin_manager'), tool('read')]
    apply(host.ctx)

    // 前缀只有 2 个事件(低于 MIN_INHERITED_EVENTS),即使逐条能对上也不认。
    const source = fakeAgent('src-live', host, { header: { createdAt: 500 }, events: SOURCE_EVENTS })
    const child = forkAgent('s-fork', host, { inheritedEventCount: 2 })
    host.ctx.agents.list = () => [source.agent, child.agent]
    host.ctx.agents.turnBoundaryOf = () => ({ lastTurn: 3 })
    await listenerOf(host)({ agent: child.agent })

    assert.equal(child.registerCalls.length, 0, '短前缀不该被当成来源证据')
    await waitFor(() => recordedSessions(home)['s-fork'] === 'none')
  })
})

test('fork:来源记的档位已被删掉时按「不处理」,不记幽灵档位', async () => {
  await withHome({ lastUsedId: 'full', profiles: FULL(), sessions: { 'src-live': 'ghost' } }, async (home) => {
    const host = fakeHost()
    host.state.definitions = [tool('plugin_manager'), tool('read')]
    apply(host.ctx)

    const source = fakeAgent('src-live', host, { header: { createdAt: 500 }, events: SOURCE_EVENTS })
    const child = forkAgent('s-fork', host)
    host.ctx.agents.list = () => [source.agent, child.agent]
    host.ctx.agents.turnBoundaryOf = () => ({ lastTurn: 3 })
    await listenerOf(host)({ agent: child.agent })

    assert.equal(child.registerCalls.length, 0)
    await waitFor(() => recordedSessions(home)['s-fork'] === 'none')
  })
})

test('fork:活会话不命中时回读已结束来源的日志并继承', async () => {
  await withHome({ lastUsedId: 'lean', profiles: FULL(), sessions: { 'src-cold': 'full' } }, async (home) => {
    const host = fakeHost()
    host.state.definitions = [tool('plugin_manager'), tool('read')]
    apply(host.ctx)
    const reads = []
    host.state.sessionQuery = {
      listSessions: async () => [
        { header: { id: 's-fork', createdAt: 9000 } },
        { header: { id: 'src-cold', createdAt: 100 } },
      ],
      readSession: async (id) => {
        reads.push(id)
        return id === 'src-cold' ? { session: { id: 'src-cold', createdAt: 100 }, events: SOURCE_EVENTS } : null
      },
    }

    const child = forkAgent('s-fork', host)
    host.ctx.agents.list = () => [child.agent]
    host.ctx.agents.turnBoundaryOf = () => ({ lastTurn: 3 })
    await listenerOf(host)({ agent: child.agent })

    assert.deepEqual(reads, ['src-cold'], '只该回读记录里的候选来源')
    assert.deepEqual(child.registerCalls.map((definition) => definition.name), ['plugin_manager'])
    await waitFor(() => recordedSessions(home)['s-fork'] === 'full')
  })
})

test('fork:来源自己被记为「不处理」时,fork 也不处理', async () => {
  await withHome({ lastUsedId: 'full', profiles: FULL(), sessions: { 'src-none': 'none' } }, async (home) => {
    const host = fakeHost()
    host.state.definitions = [tool('plugin_manager'), tool('read')]
    apply(host.ctx)

    const source = fakeAgent('src-none', host, { header: { createdAt: 500 }, events: SOURCE_EVENTS })
    const child = forkAgent('s-fork', host)
    host.ctx.agents.list = () => [source.agent, child.agent]
    host.ctx.agents.turnBoundaryOf = () => ({ lastTurn: 3 })
    await listenerOf(host)({ agent: child.agent })

    assert.equal(child.registerCalls.length, 0)
    await waitFor(() => recordedSessions(home)['s-fork'] === 'none')
  })
})

test('fork:认不出来源(或来源无记录)时显式记「不处理」,不回落 lastUsedId', async () => {
  await withHome({ lastUsedId: 'full', profiles: FULL() }, async (home) => {
    const host = fakeHost()
    host.state.definitions = [tool('plugin_manager'), tool('read')]
    apply(host.ctx)

    const child = forkAgent('s-fork', host)
    host.ctx.agents.list = () => [child.agent]
    host.ctx.agents.turnBoundaryOf = () => ({ lastTurn: 3 })
    await listenerOf(host)({ agent: child.agent })

    assert.equal(child.registerCalls.length, 0, '未套档位就不该注册延迟占位')
    assert.equal(child.restrictCalls.length, 0)
    await waitFor(() => recordedSessions(home)['s-fork'] === 'none')
  })
})

test('子代理不套档位、也不写会话记录', async () => {
  await withHome({ lastUsedId: 'full', profiles: FULL() }, async (home) => {
    const host = fakeHost()
    host.state.definitions = [tool('plugin_manager'), tool('read')]
    apply(host.ctx)

    const child = fakeAgent('s-sub', host, { header: { origin: 'subagent', parentSession: 's-x' } })
    host.ctx.agents.list = () => [child.agent]
    await listenerOf(host)({ agent: child.agent })

    assert.equal(child.registerCalls.length, 0)
    await waitFor(() => !('s-sub' in recordedSessions(home)))
  })
})

test('已记录的会话重开时按记录套用,不改写记录', async () => {
  await withHome({ lastUsedId: 'lean', profiles: FULL(), sessions: { 's-4': 'full' } }, async (home) => {
    const host = fakeHost()
    host.state.definitions = [tool('plugin_manager'), tool('read')]
    apply(host.ctx)

    const child = fakeAgent('s-4', host)
    host.ctx.agents.list = () => [child.agent]
    await listenerOf(host)({ agent: child.agent })

    assert.deepEqual(child.registerCalls.map((definition) => definition.name), ['plugin_manager'])
    await waitFor(() => recordedSessions(home)['s-4'] === 'full')
  })
})

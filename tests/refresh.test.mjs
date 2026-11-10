/**
 * 延迟占位的增量刷新回归。
 *
 * 宿主的每个 step 有一份按「定义 + 注册」对象身份比对的准入集:工具表变化后如果
 * 整份 release→重注册,该 step 内所有延迟工具都会报 unknown tool(真机现场:
 * governance 重载触发 tools/change,去抖落在下一步,plugin_manager 与
 * cordis_inspect_query 连续两次 UNKNOWN_TOOL,再下一步自愈)。
 *
 * 这里用最小假 ctx 固定住「未变化的工具不得重新注册」这条契约。
 */
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { apply } from '../src/index.ts'

const tick = (ms = 360) => new Promise((resolve) => setTimeout(resolve, ms))

function tool(name) {
  return {
    name,
    description: `${name} 的完整描述第一句。第二句不该进摘要。`,
    parameters: { type: 'object', properties: { [name]: { type: 'string' } } },
  }
}

/**
 * 假宿主:工具表可增删,记录根作用域注册(tool_search)与事件监听。
 *
 * 关键:`definitions()` 要把 agent 作用域的注册叠回工具表——真机 host 的 view() 就是这样
 * (本作用域影子遮住同名全局工具)。少了这一层,「占位背后的实现是否还在」根本测不出来。
 */
function fakeHost() {
  const events = new Map()
  const rootRegistrations = []
  /** definitions = 继承层(全局)注册;shadows = agent 作用域里的影子注册(延迟占位)。 */
  const state = { definitions: [], shadows: [] }
  const host = {
    state,
    rootRegistrations,
    events,
    ctx: {
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
        // 真机 view() 的 restrictableNames 只含继承层,本作用域的影子不在其中。
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

/** 假 agent:注册进宿主共享的 shadows(模拟本作用域影子),同时留档供断言。 */
function fakeAgent(sessionId, host) {
  const registerCalls = []
  const live = host.state.shadows
  const restrictCalls = []
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
  return {
    agent: { id: sessionId, sessionId, session: { id: sessionId, header: {} }, ctx },
    registerCalls,
    live,
    restrictCalls,
  }
}

function withHome(profiles, run) {
  const home = mkdtempSync(join(tmpdir(), 'scc-refresh-'))
  writeFileSync(join(home, 'session-context-config.json'), JSON.stringify({
    version: 3,
    lastUsedId: profiles[0].id,
    profiles,
    sessions: Object.fromEntries(profiles.map((profile) => [profile.session, profile.id])),
    baseline: { contract: false, cardReceipt: false, untrustedFiles: false },
  }))
  const previousHome = process.env.DSH_HOME
  process.env.DSH_HOME = home
  return Promise.resolve()
    .then(() => run())
    .finally(() => {
      if (previousHome === undefined) delete process.env.DSH_HOME
      else process.env.DSH_HOME = previousHome
    })
}

function profile(id, session, groups) {
  return {
    id,
    name: id,
    description: '',
    session,
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

test('工具表变化只增量刷新:已注册的延迟工具保持原定义对象,新工具补注册', async () => {
  await withHome([profile('defer-all', 's1', { devtools: 'defer' })], async () => {
    const host = fakeHost()
    host.state.definitions = [tool('plugin_manager'), tool('read')]
    apply(host.ctx)

    const fake = fakeAgent('s1', host)
    host.ctx.agents.roots = () => [fake.agent]
    host.ctx.agents.list = () => [fake.agent]
    const created = host.events.get('agent/created')?.[0]?.listener
    assert.equal(typeof created, 'function')
    await created({ agent: fake.agent })

    const firstPlaceholder = fake.registerCalls.find((definition) => definition.name === 'plugin_manager')
    assert.ok(firstPlaceholder, 'applyTo 没有为延迟工具注册占位')
    assert.equal(fake.registerCalls.filter((definition) => definition.name === 'plugin_manager').length, 1)
    // 非延迟工具(read)不注册占位。
    assert.equal(fake.registerCalls.some((definition) => definition.name === 'read'), false)

    // 模拟 governance 重载:工具表新增一个 devtools 组的延迟工具。
    host.state.definitions = [tool('plugin_manager'), tool('read'), tool('cordis_inspect_query')]
    for (const hook of host.events.get('tools/change') ?? []) hook.listener()
    await tick()

    // 核心断言:已存在的占位没有被重建(同一对象、只注册过一次)。
    const placeholders = fake.registerCalls.filter((definition) => definition.name === 'plugin_manager')
    assert.equal(placeholders.length, 1, 'refresh 不应重注册未变化的延迟工具')
    assert.equal(placeholders[0], firstPlaceholder)
    // 新工具补了占位,且带【延迟】标记。
    const added = fake.registerCalls.filter((definition) => definition.name === 'cordis_inspect_query')
    assert.equal(added.length, 1)
    assert.match(added[0].description, /^【延迟】/)

    // 工具消失:只撤销它自己,别人的注册身份不变。
    host.state.definitions = [tool('plugin_manager'), tool('read')]
    for (const hook of host.events.get('tools/change') ?? []) hook.listener()
    await tick()

    const live = fake.live.map((record) => record.definition.name)
    assert.deepEqual(live, ['plugin_manager'])
    assert.equal(fake.registerCalls.filter((definition) => definition.name === 'plugin_manager').length, 1)
  })
})

test('hidden 面变化时重建 restrict,但不触碰延迟工具的注册对象', async () => {
  await withHome([profile('hide-tools', 's2', { devtools: 'off' })], async () => {
    const host = fakeHost()
    host.state.definitions = [tool('plugin_manager'), tool('read')]
    apply(host.ctx)

    const fake = fakeAgent('s2', host)
    host.ctx.agents.roots = () => [fake.agent]
    host.ctx.agents.list = () => [fake.agent]
    const created = host.events.get('agent/created')?.[0]?.listener
    await created({ agent: fake.agent })

    assert.equal(fake.restrictCalls.length, 1)
    assert.deepEqual(fake.restrictCalls[0].filter.deny, ['plugin_manager'])

    host.state.definitions = [tool('plugin_manager'), tool('read'), tool('cordis_inspect_query')]
    for (const hook of host.events.get('tools/change') ?? []) hook.listener()
    await tick()

    // 隐藏集合扩到两个工具 → 旧 restrict 撤销、新 restrict 重建。
    assert.equal(fake.restrictCalls.length, 2)
    assert.equal(fake.restrictCalls[0].disposed, true)
    assert.deepEqual(fake.restrictCalls[1].filter.deny.sort(), ['cordis_inspect_query', 'plugin_manager'])
    // 隐藏面变化不改写延迟注册(本档位没有延迟工具)。
    assert.equal(fake.registerCalls.length, 0)
    // 根作用域的 tool_search 只在有延迟工具时注册。
    assert.equal(host.rootRegistrations.some((definition) => definition.name === 'tool_search'), false)
  })
})

test('背后实现卸载时撤掉该占位;同名工具重新注册后按新定义重建', async () => {
  await withHome([profile('defer-all', 's3', { devtools: 'defer' })], async () => {
    const host = fakeHost()
    host.state.definitions = [tool('plugin_manager'), tool('read')]
    apply(host.ctx)

    const fake = fakeAgent('s3', host)
    host.ctx.agents.roots = () => [fake.agent]
    host.ctx.agents.list = () => [fake.agent]
    await host.events.get('agent/created')?.[0]?.listener({ agent: fake.agent })

    // 第二个延迟工具出现 → 补占位。
    host.state.definitions = [tool('plugin_manager'), tool('read'), tool('cordis_inspect_query')]
    for (const hook of host.events.get('tools/change') ?? []) hook.listener()
    await tick()
    const before = fake.registerCalls.filter((definition) => definition.name === 'cordis_inspect_query').at(-1)
    assert.ok(before, '新增的延迟工具没有注册占位')

    // 背后实现卸载(插件被停用):占位必须随之撤销,否则会留下一个仍可调用的幽灵工具。
    host.state.definitions = [tool('plugin_manager'), tool('read')]
    for (const hook of host.events.get('tools/change') ?? []) hook.listener()
    await tick()
    assert.deepEqual(fake.live.map((record) => record.definition.name), ['plugin_manager'])
    assert.equal(fake.live[0].definition, fake.registerCalls.find((definition) => definition.name === 'plugin_manager'))

    // 同一工具重新注册且描述变了:按新定义重建占位,【延迟】只套一层。
    const upgraded = { ...tool('cordis_inspect_query'), description: '升级后的完整描述。第二句不该进摘要。' }
    host.state.definitions = [tool('plugin_manager'), tool('read'), upgraded]
    for (const hook of host.events.get('tools/change') ?? []) hook.listener()
    await tick()
    const rebuilt = fake.registerCalls.filter((definition) => definition.name === 'cordis_inspect_query').at(-1)
    assert.notEqual(rebuilt, before)
    assert.match(rebuilt.description, /^【延迟】升级后的完整描述。/)
    assert.equal((rebuilt.description.match(/【延迟】/g) ?? []).length, 1)
    assert.equal(rebuilt.parameters.properties.cordis_inspect_query.type, 'string')
    assert.deepEqual(fake.live.map((record) => record.definition.name).sort(), ['cordis_inspect_query', 'plugin_manager'])
  })
})

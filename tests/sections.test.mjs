/**
 * 系统段开关的回归:
 * - v2 状态迁移(prompt.mode -> prompt.override,新增 sections);v3 -> v4 替换内置三档。
 * - system-prompt/assemble 按 profile.sections 过滤;人设/附加规则受保护。
 * - sccFullSections 旁路返回完整段名单,供面板列目录。
 */
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { apply } from '../src/index.ts'
import { normalizeState } from '../src/host/state.ts'

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
  const ctx = {
    on: () => () => {},
    tools: { restrict: () => () => {}, register: () => () => {} },
    systemPrompt: {
      section: () => () => {},
      context: () => () => {},
      getSectionOrder: () => 0,
      getContextOrder: () => 0,
    },
  }
  return { id: 's1', sessionId: 's1', session: { id: 's1', header: {} }, ctx }
}

test('v2 状态迁移:mode 映射 override,sections 默认空,inCompletePrompt 丢弃', () => {
  const migrated = normalizeState({
    version: 2,
    profiles: [
      { id: 'a', prompt: { mode: 'inherit', text: 'x' } },
      { id: 'b', prompt: { mode: 'replace', text: 'y' } },
      { id: 'c', prompt: { mode: 'complete', text: 'z' } },
    ],
    baseline: { contract: true, cardReceipt: true, untrustedFiles: true, inCompletePrompt: false },
  })
  const emptySlot = () => ({ enabled: true, override: false, text: '' })
  assert.deepEqual(migrated.profiles.map((profile) => profile.prompt), [
    { prefix: { enabled: true, override: false, text: 'x' }, suffix: emptySlot() },
    { prefix: { enabled: true, override: true, text: 'y' }, suffix: emptySlot() },
    { prefix: { enabled: true, override: true, text: 'z' }, suffix: emptySlot() },
  ])
  assert.deepEqual(migrated.profiles.map((profile) => profile.sections), [{}, {}, {}])
  assert.equal(migrated.version, 4)
  assert.equal(Object.hasOwn(migrated.baseline, 'inCompletePrompt'), false)
})

test('v3 状态只保留普通段的 sections=false;工具引导段与人设槽位不进通配表', () => {
  const current = normalizeState({
    version: 3,
    profiles: [{
      id: 'a',
      sections: {
        'tool:read': false,
        'tool:write': true,
        'deployment:persona-suffix': false,
        'harness:source': false,
        'harness:identity': 'off',
      },
    }],
  })
  // tool:* 强绑定工具状态,不接受单独配置;旧状态里的残留读入时剪掉。
  assert.deepEqual(current.profiles[0].sections, { 'harness:source': false })
})

test('v3 → v4:内置三档换新定义,自定义档位与会话保留', () => {
  const state = normalizeState({
    version: 3,
    lastUsedId: 'custom-1',
    profiles: [
      { id: 'full', name: '完整', groups: { platform: 'off' } },
      { id: 'lean' },
      { id: 'minimal' },
      { id: 'custom-1', name: 'Chat' },
    ],
    sessions: { s1: 'custom-1' },
    baseline: { contract: false },
  })
  assert.equal(state.version, 4)
  assert.deepEqual(state.profiles.map((profile) => profile.id), ['full', 'lean', 'minimal', 'custom-1'])
  assert.deepEqual(state.profiles[0].groups, { workflow: 'defer', goal: 'defer', schedule: 'defer', mcp: 'defer', devtools: 'defer', other: 'defer' })
  assert.deepEqual(state.profiles[2].groups, {
    interaction: 'off', skill: 'off', delegation: 'off', workflow: 'off', goal: 'off',
    schedule: 'off', mcp: 'off', devtools: 'off', other: 'off',
  })
  assert.equal(state.profiles[3].name, 'Chat')
  assert.equal(state.sessions.s1, 'custom-1')
})

test('人设槽位:旧扁平 prompt 迁到 prefix,suffix 默认沿用', () => {
  const emptySlot = () => ({ enabled: true, override: false, text: '' })
  const state = normalizeState({
    version: 3,
    profiles: [
      { id: 'a' },
      { id: 'b', prompt: { enabled: false, override: true, text: 'x' } },
      { id: 'c', prompt: { prefix: { enabled: true, override: true, text: 'p' }, suffix: { enabled: false, override: false, text: 's' } } },
    ],
  })
  assert.deepEqual(state.profiles.map((profile) => profile.prompt), [
    { prefix: emptySlot(), suffix: emptySlot() },
    { prefix: { enabled: false, override: true, text: 'x' }, suffix: emptySlot() },
    { prefix: { enabled: true, override: true, text: 'p' }, suffix: { enabled: false, override: false, text: 's' } },
  ])
})

test('装配过滤:关掉的段被移除,人设/附加规则受保护,sccFullSections 旁路', async () => {
  const home = mkdtempSync(join(tmpdir(), 'scc-sections-'))
  writeFileSync(join(home, 'session-context-config.json'), JSON.stringify({
    version: 3,
    lastUsedId: 'chat',
    profiles: [{
      id: 'chat',
      name: 'Chat',
      description: '',
      prompt: {
        prefix: { enabled: true, override: false, text: '' },
        suffix: { enabled: true, override: false, text: '' },
      },
      contexts: {},
      sections: {
        'harness:identity': false,
        'deployment:persona-prefix': false,
        'session-context-config:contract': false,
      },
      channels: {},
      groups: {},
      servers: {},
      // 工具引导不单独配置:read 工具隐藏后 tool:read 由 hiddenToolGuide 自动移除。
      tools: { read: 'off' },
      summaries: {},
    }],
    sessions: { s1: 'chat' },
    baseline: { contract: true, cardReceipt: true, untrustedFiles: true },
  }))
  const previousHome = process.env.DSH_HOME
  process.env.DSH_HOME = home
  try {
    const { ctx, events } = fakeHost()
    apply(ctx)
    const agent = fakeAgent()
    ctx.agents.roots = () => [agent]
    const created = events.get('agent/created')?.[0]?.listener
    assert.equal(typeof created, 'function')
    await created({ agent })

    const hook = events.get('system-prompt/assemble')?.[0]
    assert.ok(hook, '没有注册 system-prompt/assemble 过滤器')
    // assemble 走 scopeTarget 按 agent scope 过滤派发,不带 global:true 的话真机上
    // 监听器根本收不到事件(单测直接调 listener,只能靠这条断言守住)。
    assert.equal(hook.options?.global, true, 'assemble 过滤器必须带 global:true')
    const assembly = {
      sections: [
        { name: 'harness:identity', text: 'identity' },
        { name: 'deployment:persona-prefix', text: 'persona' },
        { name: 'session-context-config:contract', text: 'contract' },
        { name: 'tool:read', text: 'read' },
        { name: 'tool:write', text: 'write' },
      ],
      contexts: [{ name: 'working-directory:current', text: 'cwd' }],
    }
    const filtered = await hook.listener(assembly, { agent }, async () => assembly)
    // deployment:persona-prefix 的 false 在归一化时被剪掉(人设走专用开关);
    // tool:read 因为 read 工具本身被隐藏而自动移除,tool:write 仍保留。
    assert.deepEqual(filtered.sections.map((section) => section.name), [
      'deployment:persona-prefix',
      'session-context-config:contract',
      'tool:write',
    ])
    assert.deepEqual(filtered.contexts, assembly.contexts)

    const full = await hook.listener(assembly, { agent, sccFullSections: true }, async () => assembly)
    assert.deepEqual(full.sections.map((section) => section.name), assembly.sections.map((section) => section.name))
  } finally {
    if (previousHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previousHome
  }
})

/** 记录 agent 作用域注册了哪些 systemPrompt.section / context。 */
function recordingAgent() {
  const sections = []
  const contexts = []
  const ctx = {
    on: () => () => {},
    tools: { restrict: () => () => {}, register: () => () => {} },
    systemPrompt: {
      section(section) {
        sections.push(section)
        return () => {}
      },
      context(context) {
        contexts.push(context)
        return () => {}
      },
      getSectionOrder: (name) => ({ DEPLOYMENT_PERSONA_PREFIX: 0, DEPLOYMENT_PERSONA_SUFFIX: 10200 })[name] ?? 0,
      getContextOrder: (name) => ({ SUBAGENT_DELEGATION: 120 })[name] ?? 0,
    },
  }
  return { agent: { id: 's1', sessionId: 's1', session: { id: 's1', header: {} }, ctx }, sections, contexts }
}

async function applyWithProfile(overrides) {
  const home = mkdtempSync(join(tmpdir(), 'scc-persona-'))
  writeFileSync(join(home, 'session-context-config.json'), JSON.stringify({
    version: 3,
    lastUsedId: 'chat',
    profiles: [{
      id: 'chat',
      name: 'Chat',
      description: '',
      prompt: {
        prefix: { enabled: true, override: false, text: '' },
        suffix: { enabled: true, override: false, text: '' },
      },
      contexts: {},
      sections: {},
      channels: {},
      groups: {},
      servers: {},
      tools: {},
      summaries: {},
      ...overrides,
    }],
    sessions: { s1: 'chat' },
    baseline: { contract: true, cardReceipt: true, untrustedFiles: true },
  }))
  const previousHome = process.env.DSH_HOME
  process.env.DSH_HOME = home
  try {
    const { ctx, events } = fakeHost()
    apply(ctx)
    const recorded = recordingAgent()
    ctx.agents.roots = () => [recorded.agent]
    const created = events.get('agent/created')?.[0]?.listener
    await created({ agent: recorded.agent })
    return { ...recorded, events }
  } finally {
    if (previousHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previousHome
  }
}

async function applyWithPrompt(prompt) {
  const { sections } = await applyWithProfile({ prompt })
  return sections.filter((section) => section.name.startsWith('deployment:persona'))
}

async function applyWithContexts(contexts) {
  return applyWithProfile({ contexts })
}

const slot = (patch = {}) => ({ enabled: true, override: false, text: '', ...patch })

test('关闭前置槽位:只注册前置空影子,后缘不动', async () => {
  const sections = await applyWithPrompt({ prefix: slot({ enabled: false, override: true, text: 'x' }), suffix: slot() })
  assert.deepEqual(sections.map((section) => [section.name, section.text]), [
    ['deployment:persona-prefix', ''],
  ])
})

test('覆盖前置:只换前置文本', async () => {
  const sections = await applyWithPrompt({ prefix: slot({ override: true, text: '你是大肥鱼.' }), suffix: slot() })
  assert.deepEqual(sections.map((section) => [section.name, section.text]), [
    ['deployment:persona-prefix', '你是大肥鱼.'],
  ])
})

test('覆盖后缘:只换后缘文本,前置沿用部署', async () => {
  const sections = await applyWithPrompt({ prefix: slot(), suffix: slot({ override: true, text: '结尾叮嘱' }) })
  assert.deepEqual(sections.map((section) => [section.name, section.text]), [
    ['deployment:persona-suffix', '结尾叮嘱'],
  ])
})

test('两个槽位独立:前置覆盖 + 后缘关闭', async () => {
  const sections = await applyWithPrompt({ prefix: slot({ override: true, text: 'A' }), suffix: slot({ enabled: false }) })
  assert.deepEqual(sections.map((section) => [section.name, section.text]), [
    ['deployment:persona-prefix', 'A'],
    ['deployment:persona-suffix', ''],
  ])
})

test('都开启且不覆盖:不注册任何影子,沿用部署配置', async () => {
  const sections = await applyWithPrompt({ prefix: slot(), suffix: slot() })
  assert.deepEqual(sections, [])
})

test('工具引导强绑定工具组:terminal 隐藏时 pwsh/jobs 段自动移除,read 保留', async () => {
  const { agent, events } = await applyWithProfile({ groups: { terminal: 'off' } })
  const hook = events.get('system-prompt/assemble')?.[0]
  assert.ok(hook, '没有注册 system-prompt/assemble 过滤器')
  const assembly = {
    sections: [
      { name: 'tool:pwsh', text: 'pwsh guidance' },
      { name: 'tool:jobs', text: 'jobs guidance' },
      { name: 'tool:read', text: 'read guidance' },
    ],
    contexts: [],
  }
  const filtered = await hook.listener(assembly, { agent }, async () => assembly)
  assert.deepEqual(filtered.sections.map((section) => section.name), ['tool:read'])
})

test('关闭根代理身份上下文:注册同名空影子,order 取 SUBAGENT_DELEGATION', async () => {
  const { contexts } = await applyWithContexts({ 'subagent:identity': false })
  // 名字必须与宿主 tool-subagent-control 注册的一致;空影子遮住 required 标志,
  // 外层 assemble 过滤器再按名字删,refreshContext 就不会把它补回来。
  // 环境事实是本插件自己的上下文,也在同一 agent 作用域注册,这里只看目标项。
  assert.deepEqual(contexts.filter((context) => context.name === 'subagent:identity').map((context) => [context.name, context.text, context.order]), [
    ['subagent:identity', '', 120],
  ])
})

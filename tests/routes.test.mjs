/**
 * /api/state 快照里的「自动发现」数据:
 * - sections/contexts 来自一次干跑装配,变量已渲染、空段被过滤、空上下文保留;
 * - channels 取已知两条通道的最新正文;
 * - observedChannels 从会话历史聚合所有 user 消息来源(第三方 kind 也在内)。
 *
 * 不经过 HTTP:直接调 createRoutes().snapshot(),验证的是面板真正消费的形状。
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import { createInjectedMessages } from '../src/host/injected.ts'
import { createRoutes } from '../src/host/routes.ts'
import { defaultState } from '../src/host/state.ts'

const MESSAGES = [
  { role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '人类输入' }] },
  { role: 'user', source: { kind: 'user-approval' }, content: [{ type: 'text', text: '审批回执' }] },
  { role: 'user', source: { kind: 'agent-instructions' }, content: [{ type: 'text', text: '工作区指令正文' }] },
  { role: 'user', source: { kind: 'time-context' }, content: [{ type: 'text', text: 'Time sampled: 2026-11-12' }] },
  { role: 'user', source: { kind: 'skill-catalog' }, content: [{ type: 'text', text: '- demo: 示例技能' }] },
  { role: 'user', source: { kind: 'skill-catalog' }, content: [{ type: 'text', text: '- demo: 示例技能（更新）' }] },
  { role: 'assistant', source: { kind: 'model' }, content: [{ type: 'text', text: '模型回复' }] },
]

function harness() {
  const agent = {
    id: 's1',
    sessionId: 's1',
    session: { id: 's1', header: {}, deriveMessages: () => MESSAGES },
    ctx: null,
  }
  const state = defaultState()
  state.profiles = state.profiles.map((profile) => ({ ...profile }))
  state.sessions = { s1: 'full' }
  const ctx = {
    agents: {
      list: () => [agent],
      roots: () => [agent],
      turnBoundaryOf: () => ({ lastTurn: 1 }),
    },
    tools: { register: () => () => {}, schemas: () => [], definitions: () => [], view: () => ({ restrictableNames: [] }) },
    systemPrompt: {
      assemble: async (input) => {
        assert.equal(input.sccFullSections, true, '面板目录必须走 sccFullSections 旁路')
        return {
          sections: [
            { name: 'harness:identity', text: 'identity' },
            { name: 'deployment:persona-prefix', text: 'Model {{model}}.' },
            { name: 'tool:pwsh', text: 'pwsh guidance' },
            { name: 'third-party:probe', text: '第三方段正文' },
            { name: 'empty:section', text: '' },
          ],
          contexts: [
            { name: 'subagent:identity', text: 'You are the root agent.' },
            { name: 'tool:subagent:depth', text: '' },
            { name: 'third-party:context', text: '第三方上下文正文' },
          ],
          variables: { model: 'deepseek-v4' },
        }
      },
    },
    get: () => undefined,
  }
  const kit = {
    isRootAgent: () => true,
    sessionOf: (value) => value?.session ?? null,
    sessionIdOf: () => 's1',
    isBlank: () => false,
    visibleSchemas: () => [
      { name: 'read' },
      { name: 'mcp__srv__call' },
      // tool_search 是自动注入的基础设施,干跑清单不列它。
      { name: 'tool_search' },
    ],
    definitionsOf: () => [],
    agentFor: () => agent,
  }
  const profiles = {
    applied: new Map([['s1', { profileId: 'full' }]]),
    loadedNamesOf: () => new Set(),
    profileById: (id) => state.profiles.find((profile) => profile.id === id) ?? null,
  }
  const injected = createInjectedMessages()
  // 进程内观察到的、已被通道开关过滤掉的消息也要出现在清单里;按档位分桶。
  injected.observe([{ role: 'user', source: { kind: 'filtered-kind' }, content: [{ type: 'text', text: '被过滤的正文' }] }], 'full')
  const diagnostics = []
  const routes = createRoutes({
    ctx,
    store: { state, persistNow: () => {}, persistSoon: () => {} },
    kit,
    profiles,
    sources: { report: () => ({}), resolve: () => undefined, resolveMany: async () => {} },
    translations: {},
    injected,
    note: (source, error) => diagnostics.push({ source, error: String(error) }),
    diagnostics,
  })
  return { routes, diagnostics, agent }
}

test('snapshot:内置预设来自当前插件版本,不是已安装档位', async () => {
  const { routes } = harness()
  const snapshot = await routes.snapshot()
  assert.deepEqual(snapshot.defaults.map((profile) => profile.id), ['full', 'lean', 'minimal', 'chat', 'pi'])
  // 新建下拉复制的是这份模板,已安装 profiles 是另一条线。
  assert.equal(snapshot.defaults.some((profile) => profile.prompt?.prefix?.override === true), true)
})

test('snapshot:段目录渲染模板、过滤空段与工具引导段', async () => {
  const { routes, diagnostics } = harness()
  const snapshot = await routes.snapshot()
  assert.deepEqual(snapshot.sections.map((entry) => [entry.name, entry.text]), [
    ['harness:identity', 'identity'],
    ['deployment:persona-prefix', 'Model deepseek-v4.'],
    ['third-party:probe', '第三方段正文'],
  ])
  assert.deepEqual(diagnostics, [])
})

test('snapshot:上下文目录保留空文本(供面板显示当前未出现)', async () => {
  const { routes } = harness()
  const snapshot = await routes.snapshot()
  assert.deepEqual(snapshot.contexts.map((entry) => [entry.name, entry.chars, entry.text]), [
    ['subagent:identity', 'You are the root agent.'.length, 'You are the root agent.'],
    ['tool:subagent:depth', 0, ''],
    ['third-party:context', '第三方上下文正文'.length, '第三方上下文正文'],
  ])
})

test('snapshot:已知通道取最新正文,冷门 kind 进自动清单且计数不重复', async () => {
  const { routes } = harness()
  const snapshot = await routes.snapshot()
  const channels = snapshot.channelsByProfile.full
  assert.deepEqual(Object.keys(channels).sort(), ['timeContext', 'workspaceInstructions'])
  assert.equal(channels.workspaceInstructions.text, '工作区指令正文')
  assert.equal(channels.timeContext.text, 'Time sampled: 2026-11-12')
  const observed = new Map(snapshot.observedChannelsByProfile.full.map((entry) => [entry.kind, entry]))
  assert.deepEqual([...observed.keys()].sort(), ['agent-instructions', 'filtered-kind', 'skill-catalog', 'time-context'])
  assert.equal(observed.get('skill-catalog').count, 2)
  assert.equal(observed.get('skill-catalog').text, '- demo: 示例技能（更新）')
  assert.equal(observed.get('filtered-kind').text, '被过滤的正文')
  assert.equal(observed.has('user'), false)
  assert.equal(observed.has('user-approval'), false)
})

test('snapshot:第二次读取不会把同一批历史消息的计数翻倍', async () => {
  const { routes } = harness()
  await routes.snapshot()
  const snapshot = await routes.snapshot()
  const observed = new Map(snapshot.observedChannelsByProfile.full.map((entry) => [entry.kind, entry]))
  assert.equal(observed.get('skill-catalog').count, 2)
  assert.equal(observed.get('agent-instructions').count, 1)
})

test('snapshot:其他注入消息按档位分组,不混入并行会话', async () => {
  const makeAgent = (id, kind) => ({
    id,
    sessionId: id,
    session: {
      id,
      header: {},
      deriveMessages: () => [
        { role: 'user', source: { kind }, content: [{ type: 'text', text: `${kind} 正文` }] },
      ],
    },
    ctx: null,
  })
  const first = makeAgent('a', 'alpha-kind')
  const second = makeAgent('b', 'beta-kind')
  const state = defaultState()
  state.profiles = state.profiles.map((profile) => ({ ...profile }))
  state.sessions = { a: 'full', b: 'lean' }
  const routes = createRoutes({
    ctx: {
      agents: { list: () => [first, second], roots: () => [first, second], turnBoundaryOf: () => ({ lastTurn: 1 }) },
      tools: { register: () => () => {}, schemas: () => [], definitions: () => [], view: () => ({ restrictableNames: [] }) },
      systemPrompt: { assemble: async () => ({ sections: [], contexts: [], variables: {} }) },
      get: () => undefined,
    },
    store: { state, persistNow: () => {}, persistSoon: () => {} },
    kit: {
      isRootAgent: () => true,
      sessionOf: (value) => value?.session ?? null,
      sessionIdOf: (value) => value?.sessionId ?? null,
      isBlank: () => true,
      visibleSchemas: () => [],
      definitionsOf: () => [],
      agentFor: () => first,
    },
    profiles: { applied: new Map(), loadedNamesOf: () => new Set(), profileById: () => null },
    sources: { report: () => ({}), resolve: () => undefined, resolveMany: async () => {} },
    translations: {},
    injected: createInjectedMessages(),
    note: () => {},
    diagnostics: [],
  })
  const snapshot = await routes.snapshot()
  assert.deepEqual(Object.keys(snapshot.observedChannelsByProfile).sort(), ['full', 'lean'])
  assert.deepEqual(snapshot.observedChannelsByProfile.full.map((entry) => entry.kind), ['alpha-kind'])
  assert.deepEqual(snapshot.observedChannelsByProfile.lean.map((entry) => entry.kind), ['beta-kind'])
})

test('snapshot:多个根会话的段/上下文取并集,空影子不覆盖另一档位的正文', async () => {
  const makeAgent = (id) => ({ id, sessionId: id, session: { id, header: {}, deriveMessages: () => [] }, ctx: null })
  const first = makeAgent('a')
  const second = makeAgent('b')
  const emptyState = defaultState()
  const routes = createRoutes({
    ctx: {
      agents: { list: () => [first, second], roots: () => [first, second], turnBoundaryOf: () => ({ lastTurn: 1 }) },
      tools: { register: () => () => {}, schemas: () => [], definitions: () => [], view: () => ({ restrictableNames: [] }) },
      systemPrompt: {
        assemble: async ({ agent }) => agent === first
          ? {
              sections: [{ name: 'tool:pwsh', text: '' }, { name: 'deployment:persona-prefix', text: '' }],
              contexts: [{ name: 'subagent:identity', text: '' }],
              variables: {},
            }
          : {
              sections: [{ name: 'tool:pwsh', text: 'pwsh guidance' }, { name: 'third-party:only-b', text: 'B 档位独有' }],
              contexts: [{ name: 'subagent:identity', text: 'You are the root agent.' }],
              variables: {},
            },
      },
      get: () => undefined,
    },
    store: { state: emptyState, persistNow: () => {}, persistSoon: () => {} },
    kit: {
      isRootAgent: () => true,
      sessionOf: (value) => value?.session ?? null,
      sessionIdOf: (value) => value?.sessionId ?? null,
      isBlank: () => true,
      visibleSchemas: () => [],
      definitionsOf: () => [],
      agentFor: () => first,
    },
    profiles: { applied: new Map(), loadedNamesOf: () => new Set(), profileById: () => null },
    sources: { report: () => ({}), resolve: () => undefined, resolveMany: async () => {} },
    translations: {},
    injected: createInjectedMessages(),
    note: () => {},
    diagnostics: [],
  })
  const snapshot = await routes.snapshot()
  // 空影子(第一个会话的 tool:pwsh / identity)被第二个会话的正文覆盖;
  // 只在第二个会话出现的段也进清单,顺序按首次出现。
  assert.deepEqual(snapshot.sections.map((entry) => [entry.name, entry.text]), [
    ['third-party:only-b', 'B 档位独有'],
  ])
  assert.deepEqual(snapshot.contexts.map((entry) => [entry.name, entry.text]), [
    ['subagent:identity', 'You are the root agent.'],
  ])
})

test('preview:tool_search 不进档位作用面,清单与 total 都不列它', () => {
  const { routes, agent } = harness()
  // full 档位 other 组是 defer;按 effectiveState 原样分类会把 tool_search 记成延迟,
  // 与 planFor 的自动注入(完整可见)矛盾。
  const preview = routes.previewFor(agent, 'full')
  assert.equal(preview.total, 2)
  assert.deepEqual(preview.deferred, ['mcp__srv__call'])
  assert.deepEqual(preview.visible, ['read'])
  assert.equal(preview.hidden.includes('tool_search'), false)
})

/**
 * Host 侧的纯函数契约：档位解析、延迟占位、状态归一化。
 *
 * 这三块此前完全没有测试覆盖（smoke 只测 client bundle），而它们决定了「哪个工具进不发」
 * 和「磁盘上坏掉的状态读回来是什么形状」——都是错了也只在运行时才暴露的地方。
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import { SESSIONS_LIMIT } from '../src/host/constants.ts'
import { defaultState, normalizeState, recordSession } from '../src/host/state.ts'
import { effectiveState, groupOf, hiddenToolGuide, placehold, serverOf, skeleton, summaryFor } from '../src/host/tools.ts'
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
  // 平台只留运行时基础;插件开发/宿主诊断单独成组(极简也要保留平台这两个)。
  assert.equal(groupOf('working_directory'), 'platform')
  assert.equal(groupOf('load_workspace_dependencies'), 'platform')
  assert.equal(groupOf('plugin_manager'), 'devtools')
  assert.equal(groupOf('cordis_inspect_query'), 'devtools')
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

test('工具引导强绑定：组/工具隐藏时自动隐藏，复合段看成员，延迟不算隐藏', () => {
  const base = { groups: {}, servers: {}, tools: {}, sections: {} }
  const terminalOff = { ...base, groups: { terminal: 'off' } }
  assert.equal(hiddenToolGuide(terminalOff, 'tool:pwsh'), true)
  assert.equal(hiddenToolGuide(terminalOff, 'tool:jobs'), true)
  assert.equal(hiddenToolGuide(terminalOff, 'tool:read'), false)
  assert.equal(hiddenToolGuide({ ...base, groups: { goal: 'off' } }, 'tool:goal'), true)
  assert.equal(hiddenToolGuide({ ...base, groups: { schedule: 'off' } }, 'tool:schedule'), true)
  assert.equal(hiddenToolGuide({ ...base, tools: { read: 'off' } }, 'tool:read'), true)
  assert.equal(hiddenToolGuide({ ...base, tools: { read: 'defer' } }, 'tool:read'), false)
  // 复合段:目标组还开着、但三个目标工具都被单独隐藏 -> 整段隐藏。
  assert.equal(hiddenToolGuide({ ...base, tools: { create_goal: 'off', get_goal: 'off', update_goal: 'off' } }, 'tool:goal'), true)
  // 普通段名不受影响。
  assert.equal(hiddenToolGuide(terminalOff, 'harness:identity'), false)
})

test('延迟占位：保留每个参数的名称与类型，只剥说明与默认值', () => {
  const schema = {
    type: 'object',
    required: ['path'],
    properties: {
      path: { type: 'string', title: 'Path', description: '要读的文件' },
      limit: { type: 'number', description: '最多多少行' },
      enabled: { type: 'boolean', default: true },
    },
  }
  const kept = skeleton(schema)
  assert.deepEqual(Object.keys(kept.properties).sort(), ['enabled', 'limit', 'path'])
  assert.equal(kept.properties.path.title, undefined)
  assert.equal(kept.properties.path.description, undefined)
  assert.equal(kept.properties.limit.type, 'number')
  assert.equal(kept.properties.enabled.type, 'boolean')
  assert.equal(kept.properties.enabled.default, undefined)
  assert.deepEqual(kept.required, ['path'])
})

test('摘要优先级：server 手写 > 组手写 > 描述首句 > 工具名', () => {
  const p = profile({ summaries: { github: 'GitHub 操作', mcp: '组摘要' } })
  assert.equal(summaryFor(p, 'mcp__github__list', '原文。后半句。'), 'GitHub 操作')
  assert.equal(summaryFor(p, 'mcp__gitlab__list', '原文。后半句。'), '组摘要')
  assert.equal(summaryFor(profile(), 'read', '读取文件。别的描述。'), '读取文件。')
  assert.equal(summaryFor(profile(), 'read', ''), 'read')
})

test('占位定义带延迟标记，参数保留类型', () => {
  const placeholder = placehold(
    { name: 'read', parameters: { type: 'object', required: ['path'], properties: { path: { type: 'string' }, limit: { type: 'number' } } } },
    '读取文件',
  )
  assert.equal(placeholder.name, 'read')
  assert.match(placeholder.description, /^【延迟】/)
  assert.deepEqual(Object.keys(placeholder.parameters.properties).sort(), ['limit', 'path'])
  assert.equal(placeholder.parameters.properties.limit.type, 'number')
})

test('状态归一化：版本不符整份作废，重复 id 去掉，坏引用回落', () => {
  const base = defaultState()
  assert.equal(base.lastUsedId, 'none')
  assert.equal(base.profiles.length, 5)

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
  // 新字段缺省=全注入；旧 runtimeContext/workingDirectory/环境事实一次性迁成逐项 false。
  assert.deepEqual(normalized.profiles[0].contexts, {})
  const legacy = normalizeState({
    version: 2,
    profiles: [{ id: 'a', runtimeContext: false, workingDirectory: false }],
    baseline: { environmentFacts: false },
  }).profiles[0]
  assert.equal(legacy.contexts['working-directory:current'], false)
  assert.equal(legacy.contexts['sandbox:policy'], false)
  assert.equal(legacy.contexts['session-context-config:environment'], false)
  assert.equal(legacy.contexts['harness:source'], false)
  const wdOnly = normalizeState({ version: 2, profiles: [{ id: 'a', workingDirectory: false }] }).profiles[0]
  assert.deepEqual(wdOnly.contexts, { 'working-directory:current': false })
  // contexts 一旦存在就是新模型；旧字段和旧全局环境事实开关都不再参与。
  const explicit = normalizeState({
    version: 2,
    profiles: [{ id: 'a', contexts: { 'sandbox:policy': false, 'approval:policy': true } }],
    baseline: { environmentFacts: false },
  }).profiles[0]
  assert.deepEqual(explicit.contexts, { 'sandbox:policy': false })
  // channels 的键就是 source.kind:已知 id 与第三方 kind 都保留,非 off 不落盘。
  const channels = normalizeState({
    version: 4,
    profiles: [{ id: 'a', channels: { timeContext: 'off', 'third-party-kind': 'off', ignored: 'on' } }],
  }).profiles[0]
  assert.deepEqual(channels.channels, { timeContext: 'off', 'third-party-kind': 'off' })
})

test('sessions 有界保留：重复写入移到最新端，超限淘汰最旧', () => {
  const state = defaultState()
  for (let index = 0; index < SESSIONS_LIMIT; index += 1) recordSession(state, `session-${index}`, 'none')
  assert.equal(Object.keys(state.sessions).length, SESSIONS_LIMIT)
  assert.equal(state.sessions['session-0'], 'none')
  // 第一条超限写入淘汰最旧的 session-0。
  recordSession(state, 'session-new', 'none')
  assert.equal(Object.keys(state.sessions).length, SESSIONS_LIMIT)
  assert.equal(state.sessions['session-0'], undefined)
  assert.equal(state.sessions['session-1'], 'none')
  // 已有条目重复写入移到最新端：下一条淘汰的是 session-2 而不是它。
  recordSession(state, 'session-1', 'none')
  recordSession(state, 'session-newer', 'none')
  assert.equal(state.sessions['session-1'], 'none')
  assert.equal(state.sessions['session-2'], undefined)
})

test('normalizeState：超限的旧 sessions 读入时收缩到上限（淘汰最旧）', () => {
  const sessions = {}
  for (let index = 0; index < SESSIONS_LIMIT + 3; index += 1) sessions[`session-${index}`] = 'none'
  const normalized = normalizeState({ version: 4, profiles: [{ id: 'a', name: 'A' }], sessions })
  assert.equal(Object.keys(normalized.sessions).length, SESSIONS_LIMIT)
  assert.equal(normalized.sessions['session-0'], undefined)
  assert.equal(normalized.sessions['session-2'], undefined)
  assert.equal(normalized.sessions['session-3'], 'none')
})

/**
 * Host 侧的纯函数契约：档位解析、延迟占位、状态归一化。
 *
 * 这三块此前完全没有测试覆盖（smoke 只测 client bundle），而它们决定了「哪个工具进不发」
 * 和「磁盘上坏掉的状态读回来是什么形状」——都是错了也只在运行时才暴露的地方。
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import { SESSIONS_LIMIT } from '../src/host/constants.ts'
import { defaultState, lastUsedFor, normalizeState, recordLastUsed, recordSession, WORKSPACES_LIMIT, workspaceKey } from '../src/host/state.ts'
import { effectiveServerState, effectiveState, groupOf, hiddenCompanionSection, hiddenToolGuide, mcpSectionServer, placehold, serverOf, skeleton, summaryFor } from '../src/host/tools.ts'
import { TOOL_GUIDE_GROUPS, TOOL_GUIDE_MEMBERS } from '../src/tool-guides.ts'
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
  // 共享资源工具不带 mcp 前缀,但由 mcp-resources 包注册,必须跟 MCP 组同进同退。
  assert.equal(groupOf('list_mcp_resources'), 'mcp')
  assert.equal(groupOf('list_mcp_resource_templates'), 'mcp')
  assert.equal(groupOf('read_mcp_resource'), 'mcp')
  // session-query 五个工具都属搜索;`session_trace` 不带 session_event_ 前缀,曾漏到 other。
  assert.equal(groupOf('session_trace'), 'search')
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

test('工具引导别名表与成员表一一对应', () => {
  // hiddenToolGuide 对别名段优先看成员表;缺成员会退回「组 OFF 就裁段」，
  // 那正是「组关闭 + 单个成员 force」会撕裂的旧形态,所以这里把不变式钉住。
  for (const [alias, group] of Object.entries(TOOL_GUIDE_GROUPS)) {
    const members = TOOL_GUIDE_MEMBERS[alias]
    assert.ok(Array.isArray(members) && members.length > 0, `${alias} 缺少成员表`)
    // 成员必须落在别名所指的组里:漏一个名字就意味着「组开关」管不到它。
    for (const member of members) assert.equal(groupOf(member), group, `${member} 应归入 ${group} 组`)
  }
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
  // 工具级强制开启压过组的延迟与隐藏（「组全延迟 + 个别工具提回注入」的配置靠它）
  assert.equal(effectiveState(profile({ groups: { files: 'defer' }, tools: { read: 'force' } }), 'read'), 'on')
  assert.equal(effectiveState(profile({ groups: { files: 'off' }, tools: { read: 'force' } }), 'read'), 'on')
  assert.equal(effectiveState(profile({ servers: { github: 'defer' }, tools: { 'mcp__github__x': 'force' } }), 'mcp__github__x'), 'on')
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
  // 工具级 force 能把引导段拉回来:组 OFF 不再无条件裁段(与 effectiveState 保持一致)。
  assert.equal(hiddenToolGuide({ ...base, groups: { files: 'off' }, tools: { read: 'force' } }, 'tool:read'), false)
  assert.equal(hiddenToolGuide({ ...base, groups: { goal: 'off' }, tools: { create_goal: 'force' } }, 'tool:goal'), false)
  // 组隐藏且成员都没被提回时,复合段仍然隐藏。
  assert.equal(hiddenToolGuide({ ...base, groups: { goal: 'off' } }, 'tool:goal'), true)
  // 普通段名不受影响。
  assert.equal(hiddenToolGuide(terminalOff, 'harness:identity'), false)
})

test('MCP 服务器指令强绑定 server 状态：隐藏时裁段，延迟不算隐藏，组规则同工具层', () => {
  const base = { groups: {}, servers: {}, tools: {}, sections: {} }
  // 段名解析:两种形态都归到同一个 server;非 MCP 服务器段返回 null。
  assert.equal(mcpSectionServer('mcp:zcode-media'), 'zcode-media')
  assert.equal(mcpSectionServer('mcp:zcode-media:tools'), 'zcode-media')
  assert.equal(mcpSectionServer('mcp-resource-servers'), null)
  assert.equal(mcpSectionServer('harness:identity'), null)

  // server 关闭 → 该 server 的指令与工具目录段都不注入。
  assert.equal(hiddenCompanionSection({ ...base, servers: { demo: 'off' } }, 'mcp:demo'), true)
  assert.equal(hiddenCompanionSection({ ...base, servers: { demo: 'off' } }, 'mcp:demo:tools'), true)
  // 只影响自己的 server。
  assert.equal(hiddenCompanionSection({ ...base, servers: { demo: 'off' } }, 'mcp:other'), false)
  // 延迟只改工具的加载方式,指令是使用说明,照常注入(与 tool:* 的 defer 处理一致)。
  assert.equal(hiddenCompanionSection({ ...base, servers: { demo: 'defer' } }, 'mcp:demo'), false)
  // 组关闭连带所有 server;组关闭压过 server 强制开启,与 effectiveState 的层级顺序一致。
  assert.equal(hiddenCompanionSection({ ...base, groups: { mcp: 'off' } }, 'mcp:demo'), true)
  assert.equal(hiddenCompanionSection({ ...base, groups: { mcp: 'off' }, servers: { demo: 'force' } }, 'mcp:demo'), true)
  // 组强制开启压过 server 关闭。
  assert.equal(hiddenCompanionSection({ ...base, groups: { mcp: 'force' }, servers: { demo: 'off' } }, 'mcp:demo'), false)
  // server 层终态本身。
  assert.equal(effectiveServerState({ ...base, servers: { demo: 'force' } }, 'demo'), 'on')
  assert.equal(effectiveServerState({ ...base, servers: { demo: 'defer' } }, 'demo'), 'defer')
  assert.equal(effectiveServerState({ ...base, groups: { mcp: 'off' } }, 'demo'), 'off')
  assert.equal(effectiveServerState(base, 'demo'), 'on')
  // tool:* 规则不受影响,普通段永远保留,没有档位时不裁段。
  assert.equal(hiddenCompanionSection({ ...base, groups: { terminal: 'off' } }, 'tool:pwsh'), true)
  assert.equal(hiddenCompanionSection(base, 'harness:identity'), false)
  assert.equal(hiddenCompanionSection(null, 'mcp:demo'), false)
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
  assert.deepEqual(base.lastUsedByWorkspace, {})
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
  // tool_search 由插件自动管理,旧状态里的键读入即剪掉。
  const cleaned = normalizeState({
    version: 4,
    profiles: [{ id: 'a', tools: { tool_search: 'off', read: 'off' } }],
  }).profiles[0]
  assert.deepEqual(cleaned.tools, { read: 'off' })
})

test('工作区默认档位：按会话 cwd 记录/读取，不回落其它工作区的 lastUsedId', () => {
  const state = defaultState()
  assert.deepEqual(state.lastUsedByWorkspace, {})
  recordLastUsed(state, 'D:/work/zen', 'full')
  assert.equal(lastUsedFor(state, 'D:/work/zen'), 'full')
  assert.equal(state.lastUsedId, 'full')
  // 同一路径的不同写法归一到一个键(Windows 分隔符/大小写都不敏感)。
  if (process.platform === 'win32') {
    assert.equal(workspaceKey('D:/work/zen'), workspaceKey('D:\\WORK\\zen'))
    assert.equal(lastUsedFor(state, 'D:\\WORK\\zen'), 'full')
  }
  // 没有记录的工作区按「不处理」,不把别的工作区的选择带过来。
  assert.equal(lastUsedFor(state, 'D:/work/other'), 'none')
  // 拿不到 cwd 时才回落全局 lastUsedId(旧行为),key 相关函数也都不炸。
  assert.equal(lastUsedFor(state, undefined), 'full')
  assert.equal(lastUsedFor(state, ''), 'full')
  assert.equal(workspaceKey(''), null)
})

test('状态归一化：工作区默认档位只留有效引用，超出上限淘汰最旧', () => {
  const normalized = normalizeState({
    version: 4,
    profiles: [{ id: 'a', name: 'A' }],
    lastUsedByWorkspace: {
      [workspaceKey('D:/work/a')]: 'a',
      [workspaceKey('D:/work/b')]: 'ghost',
      '': 'a',
      [workspaceKey('D:/work/c')]: 'none',
    },
  })
  assert.deepEqual(normalized.lastUsedByWorkspace, {
    [workspaceKey('D:/work/a')]: 'a',
    [workspaceKey('D:/work/c')]: 'none',
  })
  // 旧状态没有该字段:空映射(新会话按「不处理」起步),不拿 lastUsedId 冒充每工作区记录。
  assert.deepEqual(normalizeState({ version: 4, profiles: [{ id: 'a' }] }).lastUsedByWorkspace, {})
  // 有界:超出上限的最旧条目读入时淘汰。
  const many = {}
  for (let index = 0; index < WORKSPACES_LIMIT + 2; index += 1) many[`D:/work/${index}`] = 'a'
  const bounded = normalizeState({ version: 4, profiles: [{ id: 'a' }], lastUsedByWorkspace: many })
  assert.equal(Object.keys(bounded.lastUsedByWorkspace).length, WORKSPACES_LIMIT)
  assert.equal(bounded.lastUsedByWorkspace['D:/work/0'], undefined)
  assert.equal(bounded.lastUsedByWorkspace['D:/work/1'], undefined)
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

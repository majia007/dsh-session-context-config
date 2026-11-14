/**
 * 插件内置预设的契约：
 * - 五个模板（full / lean / minimal / chat / pi）只在首次安装与新建下拉里用；
 * - 它们是插件通用预设，不是用户当前配置的副本；旧状态迁移只做结构转换；
 * - pi 是 Pi 风格档位：默认工具 + skill 按需加载（Pi 内建 skills，目录进 system prompt、正文按需读）。
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import { DEFAULT_PROFILES, DEFER, FORCE, MINIMAL_PROMPT, OFF, ON, PI_PROMPT } from '../src/host/constants.ts'
import { effectiveState } from '../src/host/tools.ts'

function profileById(id) {
  const profile = DEFAULT_PROFILES.find((entry) => entry.id === id)
  assert.ok(profile, `缺少内置预设 ${id}`)
  return profile
}

test('默认预设：五档 id 与顺序稳定', () => {
  assert.deepEqual(DEFAULT_PROFILES.map((profile) => profile.id), ['full', 'lean', 'minimal', 'chat', 'pi'])
})

test('默认预设：完整/精简/极简使用插件通用值，不是用户当前配置', () => {
  const full = profileById('full')
  const lean = profileById('lean')
  const minimal = profileById('minimal')
  for (const profile of [full, lean]) {
    assert.deepEqual(profile.prompt.prefix, { enabled: true, override: false, text: '' })
    assert.deepEqual(profile.prompt.suffix, { enabled: true, override: false, text: '' })
  }
  assert.equal(full.groups.delegation, undefined)
  assert.equal(lean.groups.workflow, OFF)
  assert.equal(lean.groups.schedule, OFF)
  assert.equal(lean.groups.devtools, OFF)
  assert.deepEqual(lean.contexts, {})
  assert.deepEqual(lean.sections, {})
  assert.deepEqual(minimal.prompt.prefix, { enabled: true, override: true, text: MINIMAL_PROMPT })
  assert.deepEqual(minimal.prompt.suffix, { enabled: true, override: false, text: '' })
  assert.equal(minimal.groups.interaction, OFF)
  assert.equal(minimal.groups.mcp, OFF)
  assert.equal(minimal.contexts['sandbox:policy'], false)
  assert.equal(minimal.contexts['working-directory:current'], undefined)
  for (const profile of [full, lean, minimal]) {
    assert.equal(profile.baseline.contract, true)
    assert.equal(profile.baseline.cardReceipt, true)
    assert.equal(profile.baseline.untrustedFiles, true)
    assert.equal(profile.baseline.custom, false)
  }
})

test('默认预设：Chat 保持全关', () => {
  const chat = profileById('chat')
  assert.deepEqual(chat.prompt.prefix, { enabled: false, override: false, text: '' })
  assert.deepEqual(chat.prompt.suffix, { enabled: false, override: false, text: '' })
  assert.equal(chat.groups.files, OFF)
  assert.equal(chat.groups.platform, OFF)
  assert.equal(chat.contexts['working-directory:current'], false)
  assert.equal(chat.contexts['subagent:identity'], false)
  assert.equal(chat.sections['harness:identity'], false)
  assert.equal(chat.channels.workspaceInstructions, OFF)
  assert.equal(chat.channels.timeContext, OFF)
  assert.equal(chat.baseline.contract, false)
  assert.equal(chat.baseline.custom, false)
})

test('默认预设：Pi 只注入核心工具，其余一律延迟', () => {
  const pi = profileById('pi')
  // 六个核心工具用工具级 force 压过组的延迟。
  for (const name of ['read', 'write', 'edit', 'pwsh', 'read_image', 'skill']) {
    assert.equal(effectiveState(pi, name), ON, `${name} 应注入`)
    assert.equal(pi.tools[name], FORCE, `${name} 应显式强制开启`)
  }
  // 组只承载默认值：全部组都是延迟，没有隐藏项。
  for (const group of ['files', 'search', 'terminal', 'interaction', 'skill', 'delegation', 'workflow', 'goal', 'schedule', 'mcp', 'platform', 'devtools', 'other']) {
    assert.equal(pi.groups[group], DEFER, `${group} 组应以延迟为默认`)
  }
  // Pi 启动就把技能 name/description 注入 system prompt，目录消息（skill-catalog）不关。
  assert.equal(pi.channels['skill-catalog'], undefined, '技能目录消息应注入')
  assert.equal(pi.injectDuplicateSkills, false, 'Pi 不重复注入已加载过的技能正文')
  // tool_search 不进档位表:运行时由 planFor 按「是否有其它延迟工具」特判注入(回归 tests/refresh.test.mjs)。
  assert.equal(pi.tools.tool_search, undefined, 'tool_search 由 planFor 自动注入，不进档位表')
  assert.equal(pi.sections['mcp-resource-servers'], undefined, 'MCP 资源段不应关闭')
  for (const name of [
    'apply_patch',
    'job_kill',
    'job_list',
    'job_output',
    'terminal_close',
    'terminal_list',
    'terminal_open',
    'terminal_read',
    'terminal_send',
    'terminal_signal',
    'web_fetch',
    'web_search',
    'web_extract',
    'subagent',
    'send_message',
    'workflow',
    'exit_plan_mode',
    'create_goal',
    'schedule_create',
    'plugin_manager',
    'cordis_inspect_list',
    'load_workspace_dependencies',
    'working_directory',
    'lsp',
    'session_recall',
  ]) {
    assert.equal(effectiveState(pi, name), DEFER, `${name} 应延迟`)
  }
  assert.equal(effectiveState(pi, 'mcp_connector_demo'), DEFER, 'MCP 工具应延迟')
  assert.equal(pi.prompt.prefix.enabled, true)
  assert.equal(pi.prompt.prefix.override, true)
  assert.equal(pi.prompt.prefix.text, PI_PROMPT)
  assert.equal(pi.prompt.suffix.override, true)
  assert.equal(pi.prompt.suffix.text, '')
  assert.equal(pi.baseline.contract, false)
  assert.equal(pi.baseline.cardReceipt, false)
  assert.equal(pi.baseline.untrustedFiles, false)
})

test('默认预设：Pi 提示词是 Pi 风格，但明确运行在 DeepSeek Harness，不冒充 Pi', () => {
  assert.match(PI_PROMPT, /^You are a coding assistant running inside DeepSeek Harness with a Pi-like configuration\./)
  assert.match(PI_PROMPT, /This is a Pi-style preset adapted to DSH, not Pi itself\./)
  assert.match(PI_PROMPT, /<rules>/)
  assert.match(PI_PROMPT, /Use PowerShell for file operations/)
  assert.match(PI_PROMPT, /old_string must match exactly/)
  // 不写 <tools> 清单:工具说明由 tools 数组与 tool:* 引导段自动注入,提示词不做第二份。
  assert.doesNotMatch(PI_PROMPT, /<tools>/)
  assert.doesNotMatch(PI_PROMPT, /- (read|write|edit|pwsh|read_image|skill): /)
  assert.doesNotMatch(PI_PROMPT, /instead of cat or sed/)
  assert.doesNotMatch(PI_PROMPT, /running inside pi, a coding agent harness/)
  assert.doesNotMatch(PI_PROMPT, /\bbash\b/)
})

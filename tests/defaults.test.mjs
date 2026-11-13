/**
 * 插件内置预设的契约：
 * - 五个模板（full / lean / minimal / chat / pi）只在首次安装与新建下拉里用；
 * - 前四档冻结为本机实际运行值，pi 是 Pi 风格的五工具档位；
 * - 已安装 state 不被这些常量改写（迁移行为见 sections.test.mjs）。
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import { DEFAULT_PROFILES, OFF, OUTPUT_DISCIPLINE, PI_PROMPT } from '../src/host/constants.ts'
import { effectiveState } from '../src/host/tools.ts'

function profileById(id) {
  const profile = DEFAULT_PROFILES.find((entry) => entry.id === id)
  assert.ok(profile, `缺少内置预设 ${id}`)
  return profile
}

test('默认预设：五档 id 与顺序稳定', () => {
  assert.deepEqual(DEFAULT_PROFILES.map((profile) => profile.id), ['full', 'lean', 'minimal', 'chat', 'pi'])
})

test('默认预设：完整/精简/极简使用当前实际值', () => {
  const full = profileById('full')
  const lean = profileById('lean')
  const minimal = profileById('minimal')
  for (const profile of [full, lean, minimal]) {
    assert.deepEqual(profile.prompt.prefix, { enabled: true, override: false, text: '' })
    assert.deepEqual(profile.prompt.suffix, { enabled: true, override: true, text: OUTPUT_DISCIPLINE })
  }
  assert.equal(full.groups.delegation, 'defer')
  assert.equal(lean.groups.schedule, OFF)
  assert.equal(lean.groups.devtools, OFF)
  assert.equal(lean.groups.workflow, 'defer')
  assert.equal(minimal.groups.interaction, OFF)
  assert.equal(minimal.groups.mcp, 'defer')
  assert.equal(minimal.contexts['sandbox:policy'], false)
  assert.equal(minimal.contexts['working-directory:current'], undefined)
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
})

test('默认预设：PI 只留 read/write/edit/pwsh/read_image', () => {
  const pi = profileById('pi')
  for (const name of ['read', 'write', 'edit', 'pwsh', 'read_image']) {
    assert.equal(effectiveState(pi, name), 'on', `${name} 应注入`)
  }
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
    'skill',
    'subagent',
    'send_message',
    'workflow',
    'exit_plan_mode',
    'create_goal',
    'schedule_create',
    'mcp_connector_demo',
    'plugin_manager',
    'cordis_inspect_list',
    'load_workspace_dependencies',
    'working_directory',
    'lsp',
    'tool_search',
    'session_recall',
    'web_extract',
  ]) {
    assert.equal(effectiveState(pi, name), 'off', `${name} 应隐藏`)
  }
  assert.equal(pi.prompt.prefix.enabled, true)
  assert.equal(pi.prompt.prefix.override, true)
  assert.equal(pi.prompt.prefix.text, PI_PROMPT)
  assert.equal(pi.prompt.suffix.override, true)
  assert.equal(pi.prompt.suffix.text, '')
})

test('默认预设：PI 提示词是当前 Pi 短版，工具名已改成 DSH', () => {
  assert.match(PI_PROMPT, /^You are a coding assistant running inside pi, a coding agent harness\./)
  assert.match(PI_PROMPT, /<tools>/)
  assert.match(PI_PROMPT, /<rules>/)
  assert.match(PI_PROMPT, /- pwsh: /)
  assert.match(PI_PROMPT, /- read_image: /)
  assert.match(PI_PROMPT, /old_string must match exactly/)
  assert.doesNotMatch(PI_PROMPT, /DeepSeek Harness/)
  assert.doesNotMatch(PI_PROMPT, /\bbash\b/)
})

/**
 * 面板「装载自检」的判据:哪些诊断算致命。
 *
 * 单测直读纯函数(不碰 React/CSS),钉住两件事:宿主拒绝注册的信号一定上抬;普通提示
 * (装配目录、翻译失败之类)不会被误报成致命,否则面板顶部会常年挂一条噪音。
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import { fatalDiagnostics } from '../src/client/state/diagnostics.ts'

test('宿主拒绝注册:按错误码与来源两路都判定为致命', () => {
  const rejected = fatalDiagnostics([
    { at: 't', source: 'defer:ask_user_question', message: 'unsupported JSON schema: schema.required is not supported on type "array"' },
    { at: 't', source: 'ask shadow', message: 'ask_user_question 改写已停用:拿不到官方定义' },
    { at: 't', source: 'register', message: 'boom' },
    { at: 't', source: 'ask shadow', message: '同作用域撞名 tool "x" is already registered in this scope' },
  ])
  assert.equal(rejected.length, 4)
  assert.match(rejected[0], /^defer:ask_user_question: unsupported JSON schema/)
})

test('普通诊断不上抬,空/坏形状安全跳过', () => {
  const benign = fatalDiagnostics([
    { source: 'prompt catalog:session-1', message: 'working-directory: directory does not exist' },
    { source: 'translations', message: '翻译失败' },
    { source: '', message: '' },
    null,
    42,
    'not-an-object',
  ])
  assert.deepEqual(benign, [])
  assert.deepEqual(fatalDiagnostics(undefined), [])
})

test('同一条诊断只显示一次(多次重载会重复记同一条)', () => {
  const repeated = fatalDiagnostics([
    { source: 'reapply', message: 'cannot get property "tools"' },
    { source: 'reapply', message: 'cannot get property "tools"' },
  ])
  assert.deepEqual(repeated, ['reapply: cannot get property "tools"'])
})

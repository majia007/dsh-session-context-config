/**
 * 工具来源解析的契约。
 *
 * 守的是「归属不能猜」这条线:命名约定与注册捕获各自给出什么、拿不到证据时返回
 * undefined(面板显示未识别)、卸载后拦截必须撤掉。
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import { createSourceIndex } from '../src/host/sources.ts'

function fakeContext(service) {
  return {
    get(name) {
      return name === 'tools' ? service : undefined
    },
    // 没有 loader / pluginPackages:走 fiber 与 package.json 兜底。
    tools: service,
  }
}

test('来源:注册时按调用栈捕获包名,卸载后不再拦截', async () => {
  const calls = []
  const service = {
    register(definition) {
      calls.push(definition.name)
      return () => {}
    },
  }
  const notes = []
  const index = createSourceIndex(fakeContext(service), (source, error) => notes.push(`${source}: ${error}`))

  service.register({ name: 'demo_tool' })
  const source = index.resolve('demo_tool')
  assert.equal(source?.kind, 'plugin')
  // 调用栈落在本测试文件 → 反查到本仓库包名(缩成短名展示)。
  assert.equal(source?.label, 'dsh-session-context-config')
  assert.match(source?.detail ?? '', /@jia-tools\/dsh-session-context-config/)
  assert.equal(source?.evidence, 'registry')
  assert.deepEqual(calls, ['demo_tool'])

  index.dispose()
  service.register({ name: 'after_dispose' })
  assert.equal(index.resolve('after_dispose'), undefined)
  assert.deepEqual(notes, [])
})

test('来源:MCP 命名约定优先于插件归属', () => {
  const service = { register: () => () => {} }
  const index = createSourceIndex(fakeContext(service), () => {})
  assert.equal(index.resolve('mcp__github__search_issues')?.label, 'MCP · github')
  assert.equal(index.resolve('mcp__github__search_issues')?.evidence, 'mcp')
  assert.equal(index.resolve('mcp_connector_slack')?.label, 'MCP 连接器')
  index.dispose()
})

test('来源:没有任何证据时返回 undefined,不猜', async () => {
  const service = { register: () => () => {} }
  const index = createSourceIndex(fakeContext(service), () => {})
  await index.resolveMany([{ name: 'never_registered_tool' }])
  assert.equal(index.resolve('never_registered_tool'), undefined)
  assert.equal(index.report().patched, true)
  index.dispose()
})

test('来源:官方目录认得但实现包没装载时标为 DSH 内置', () => {
  const service = { register: () => () => {} }
  const index = createSourceIndex(fakeContext(service), () => {})
  const source = index.resolve('load_workspace_dependencies')
  assert.equal(source?.label, 'DSH 内置')
  assert.match(source?.detail ?? '', /dsh-tool-workspace-dependencies/)
  index.dispose()
})

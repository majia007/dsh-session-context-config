/**
 * catalog 与宿主 agentPresets 的调用契约。
 *
 * 这里守的是两个只在真机上才会暴露的坑：
 * - acquireScope 必须作为方法调用（宿主实现内部用 this.retain，解构后 receiver 丢失，
 *   工具目录会静默变成 0 条，面板下方的工具配置区整块消失）；
 * - 租约要用 Symbol.asyncDispose 释放（当前宿主不提供 dispose()）。
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import { createCatalog } from '../src/host/catalog.ts'

test('catalog: acquireScope 保留 receiver，目录可用且租约被释放', async () => {
  const notes = []
  let disposed = 0
  const registry = {
    async retain(id) {
      return { key: { id } }
    },
    async acquireScope(id) {
      // 关键：内部依赖 this；调用方解构方法后这里会抛
      // Cannot read properties of undefined (reading 'retain')
      const generation = await this.retain(id)
      return {
        key: generation.key,
        [Symbol.asyncDispose]: async () => {
          disposed += 1
        },
      }
    },
    async list() {
      return [{ id: 'standard', name: '标准' }]
    },
  }
  const scopes = []
  const ctx = {
    get(name) {
      if (name === 'agentPresets') return registry
      if (name === 'agentPresetRegistry') return { config: { default: 'standard' } }
      return undefined
    },
    tools: {
      schemas(scope) {
        scopes.push(scope)
        return [{ name: 'read', description: 'Read a file', parameters: { type: 'object', properties: {} } }]
      },
    },
  }
  const catalog = createCatalog(ctx, (source, error) => notes.push(`${source}: ${error.message}`))
  const value = await catalog.buildCatalog()

  assert.deepEqual(notes, [])
  assert.deepEqual(scopes, [{ id: 'standard' }])
  assert.deepEqual(value.tools.map((tool) => tool.name), ['read'])
  assert.equal(value.tools[0].group, 'files')
  assert.equal(disposed, 1)
})

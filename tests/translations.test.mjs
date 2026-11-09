/** 工具说明翻译运行时:文本 key 缓存、模型解析与失败降级。 */
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { createTranslationRuntime } from '../src/host/translations.ts'

function fakeCtx(options = {}) {
  const calls = []
  const ctx = {
    get(name) {
      if (name === 'agentDefaultModel') return options.model === false ? undefined : { currentSelection: () => ({ provider: 'p', model: 'm' }) }
      if (name === 'llm') {
        return {
          async prepareCall(request) {
            calls.push(request)
            return {
              config: { provider: request.provider, model: request.model },
              async *stream() {
                yield { type: 'text-delta', text: '中文译文' }
              },
            }
          },
        }
      }
      return undefined
    },
  }
  return { ctx, calls }
}

async function withHome(fn) {
  const home = mkdtempSync(join(tmpdir(), 'scc-translations-'))
  const previous = process.env.DSH_HOME
  process.env.DSH_HOME = home
  try {
    return await fn()
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previous
  }
}

test('按原始文本翻译并缓存:命中后不再调用模型', async () => {
  await withHome(async () => {
    const { ctx, calls } = fakeCtx()
    const runtime = createTranslationRuntime(ctx, () => {})
    assert.equal(runtime.lookup('hello'), null)
    assert.equal(await runtime.translate('hello'), '中文译文')
    assert.equal(calls.length, 1)
    assert.equal(runtime.lookup('hello'), '中文译文')
    assert.equal(await runtime.translate('hello'), '中文译文')
    assert.equal(calls.length, 1)
    // 不同原文是不同的 key
    assert.equal(await runtime.translate('other'), '中文译文')
    assert.equal(calls.length, 2)
    runtime.dispose()
    // 落盘后新实例直接命中缓存
    const reloaded = createTranslationRuntime(ctx, () => {})
    assert.equal(reloaded.lookup('hello'), '中文译文')
    reloaded.dispose()
  })
})

test('没有默认模型时报错,不发起调用', async () => {
  await withHome(async () => {
    const { ctx, calls } = fakeCtx({ model: false })
    const runtime = createTranslationRuntime(ctx, () => {})
    await assert.rejects(() => runtime.translate('hello'), /未配置默认模型/)
    assert.equal(calls.length, 0)
    runtime.dispose()
  })
})

test('空文本直接拒绝', async () => {
  await withHome(async () => {
    const { ctx } = fakeCtx()
    const runtime = createTranslationRuntime(ctx, () => {})
    await assert.rejects(() => runtime.translate('   '), /文本为空/)
    runtime.dispose()
  })
})

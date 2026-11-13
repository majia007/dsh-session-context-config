/**
 * 附加规则按档位 + 子代理跟随根档位的契约：
 * - 旧顶层 baseline 只在档位缺 baseline 时复制进来,已有档位值不覆盖;
 * - agent 作用域注册四段,文本读所属根会话的档位 baseline;
 * - 子代理沿 parentSession 找根;找不到根档位时才回落顶层兜底。
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import { BASELINE_TEXT } from '../src/baseline.ts'
import { createBaselineRuntime } from '../src/host/baseline-runtime.ts'
import { createSessionKit } from '../src/host/sessions.ts'
import { normalizeState } from '../src/host/state.ts'

const off = () => ({ contract: false, cardReceipt: false, untrustedFiles: false, custom: false, customText: '' })

test('baseline:旧顶层复制进缺失档位,已有档位值保留', () => {
  const state = normalizeState({
    version: 4,
    baseline: off(),
    profiles: [
      { id: 'a' },
      { id: 'b', baseline: { contract: true, cardReceipt: true, untrustedFiles: true, custom: false, customText: 'x' } },
    ],
  })
  assert.deepEqual(state.profiles[0].baseline, off())
  assert.deepEqual(state.profiles[1].baseline, { contract: true, cardReceipt: true, untrustedFiles: true, custom: false, customText: 'x' })
  assert.deepEqual(state.baseline, off())
})

test('baseline runtime:根档位取值,子代理跟随根会话', () => {
  const sessions = new Map([
    ['root', { id: 'root', header: {} }],
    ['sub', { id: 'sub', header: { origin: 'subagent', parentSession: 'root' } }],
    ['orphan', { id: 'orphan', header: { origin: 'subagent', parentSession: 'missing' } }],
  ])
  const ctx = {
    get(name) {
      return name === 'sessions' ? { get: (id) => sessions.get(String(id)) } : undefined
    },
    agents: { list: () => [], turnBoundaryOf: () => null },
  }
  const kit = createSessionKit(ctx, () => {})
  const profile = {
    id: 'full',
    baseline: { contract: true, cardReceipt: false, untrustedFiles: true, custom: false, customText: 'hello' },
  }
  const profiles = {
    applied: new Map([['root', { profileId: 'full' }]]),
    profileById: (id) => id === 'full' ? profile : null,
  }
  const store = { state: { sessions: { root: 'full' }, baseline: off() } }
  const runtime = createBaselineRuntime(ctx, store, kit, profiles, (source, error) => {
    throw new Error(`${source}: ${String(error)}`)
  })

  function agent(id, header) {
    const sections = []
    return {
      id,
      sessionId: id,
      session: { id, header },
      sections,
      ctx: {
        systemPrompt: {
          section(section) {
            sections.push(section)
            return () => {}
          },
        },
      },
    }
  }
  const root = agent('root', {})
  const sub = agent('sub', { origin: 'subagent', parentSession: 'root' })
  const orphan = agent('orphan', { origin: 'subagent', parentSession: 'missing' })
  runtime.apply(root)
  runtime.apply(sub)
  runtime.apply(orphan)

  assert.deepEqual(runtime.baselineFor(sub), profile.baseline)
  assert.deepEqual(runtime.baselineFor(orphan), off())
  assert.equal(root.sections.length, 4)
  assert.equal(sub.sections.length, 4)
  const textOf = (agentValue, name) => agentValue.sections.find((section) => section.name === name)?.text({})
  assert.equal(textOf(root, 'session-context-config:contract'), BASELINE_TEXT.contract)
  assert.equal(textOf(root, 'session-context-config:card-receipt'), '')
  assert.equal(textOf(root, 'session-context-config:untrusted-files'), BASELINE_TEXT.untrustedFiles)
  assert.equal(textOf(sub, 'session-context-config:contract'), BASELINE_TEXT.contract)
  assert.equal(textOf(orphan, 'session-context-config:contract'), '')
})

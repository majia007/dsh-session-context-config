/** 面板草稿派生：旧 Host 快照没有 profile.baseline 时，必须用顶层 baseline 兜底，
 * 不能拿模板默认值（三段全开）兜底，否则升级后会把用户已关闭的开关显示成开启。 */
import assert from 'node:assert/strict'
import test from 'node:test'

import { DEFAULT_BASELINE, draftOf } from '../src/client/panel/draft.ts'

const off = { contract: false, cardReceipt: false, untrustedFiles: false, custom: false, customText: '' }
const on = { contract: true, cardReceipt: true, untrustedFiles: true, custom: false, customText: 'x' }

function snapshot(profiles, baseline) {
  return { ok: true, version: 4, profiles, lastUsedId: 'a', sessions: {}, baseline }
}

test('draftOf：旧快照缺档位 baseline 时用顶层值兜底，不显示成模板全开', () => {
  const draft = draftOf(snapshot([{ id: 'a', name: 'A' }], off))
  assert.deepEqual(draft.profiles[0].baseline, off)
  assert.notDeepEqual(draft.profiles[0].baseline, DEFAULT_BASELINE)
})

test('draftOf：已有的档位 baseline 保留，缺的才回落到顶层', () => {
  const draft = draftOf(snapshot([
    { id: 'a', name: 'A', baseline: on },
    { id: 'b', name: 'B' },
  ], off))
  assert.deepEqual(draft.profiles[0].baseline, on)
  assert.deepEqual(draft.profiles[1].baseline, off)
})

test('draftOf：快照连顶层 baseline 都没有时才用模板默认值', () => {
  const draft = draftOf(snapshot([{ id: 'a', name: 'A' }], undefined))
  assert.deepEqual(draft.profiles[0].baseline, DEFAULT_BASELINE)
})

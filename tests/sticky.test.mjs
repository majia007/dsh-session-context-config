/**
 * 档位卡吸顶判定:面板滚动到档位栏贴住滚动区顶部时收起卡片正文,只留档位 tab。
 *
 * 判据是纯几何量(见 `src/client/panel/sticky.ts`)。这里锁住阈值与无布局环境的回退:
 * 页面顶部、卡片还没到顶、happy-dom 那种全零矩形都必须判「未吸顶」——否则配置面板
 * 一挂载就只剩一条 tab 栏。
 */
import assert from 'node:assert/strict'
import test from 'node:test'

const { isPinned } = await import('../src/client/panel/sticky.ts')

test('页面顶部不吸顶(全零矩形也不行)', () => {
  assert.equal(isPinned(0, 0, 0), false)
  assert.equal(isPinned(0, 16, 0), false)
})

test('档位栏顶边贴住滚动区顶边即吸顶', () => {
  assert.equal(isPinned(16, 0, 0), true)
  assert.equal(isPinned(200, -184, 0), true)
})

test('栏还在滚动区的上内距里时不吸顶', () => {
  assert.equal(isPinned(4, 12, 0), false)
  assert.equal(isPinned(15, 1.5, 0), false)
})

test('1px 容差吸收分数缩放', () => {
  assert.equal(isPinned(16, 0.5, 0), true)
  assert.equal(isPinned(16, 2, 0), false)
})

test('滚动区不在视口顶端时按相对位置判', () => {
  assert.equal(isPinned(64, 120, 120), true)
  assert.equal(isPinned(64, 136, 120), false)
})

test('钉住位置在滚动区上内距之下（内容盒顶边）', () => {
  // .cp-scroll 有 16px 上内距:吸顶时栏顶边停在滚动区外框下方 16px 处,
  // 拿外框顶边比会永远判不出吸顶,所以传进来的 scrollerTop 必须是内容盒顶边。
  assert.equal(isPinned(1, 16, 16), true)
  assert.equal(isPinned(0, 16, 16), false)
  assert.equal(isPinned(200, 16, 16), true)
  assert.equal(isPinned(200, 40, 16), false)
})

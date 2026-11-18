/**
 * token 估算口径:面板所有「约 N token」都出自这一个估算器,钉住分档系数与边界。
 *
 * 为什么值得单独测:它是纯函数、没有运行时依赖,而数字错了用户第一眼就会怀疑面板;
 * 分档系数一改,段/上下文/工具三处的体量文案同时变,所以在这里锁死行为。
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { estimateTokens } from '../src/tokens.ts'

test('空文本为 0,有内容至少 1', () => {
  assert.equal(estimateTokens(''), 0)
  assert.equal(estimateTokens('a'), 1)
  assert.equal(estimateTokens('中'), 1)
})

test('拉丁文本沿用旧 JSON schema 系数(0.28 token/字符)', () => {
  assert.equal(estimateTokens('x'.repeat(100)), 28)
  assert.equal(estimateTokens('abcdefghij'), 3)
})

test('中文按 1.5 字/token 折算,同长度下明显重于拉丁', () => {
  assert.equal(estimateTokens('中文注入正文'), 4)
  assert.ok(estimateTokens('中文注入正文') > estimateTokens('abcdef'))
})

test('全角标点与中日文字符同档', () => {
  // 「中文注，」= 3 个汉字 + 1 个全角逗号 = 4 个 CJK 字符
  assert.equal(estimateTokens('中文注，'), Math.round(4 / 1.5))
  assert.equal(estimateTokens('ひらがな'), Math.round(4 / 1.5))
})

test('混合文本按两档相加', () => {
  // 2 个汉字(1.33) + 10 个拉丁(2.8) = 4.13 → 4
  assert.equal(estimateTokens(`中文${'abcdefghij'}`), 4)
})

test('增补平面汉字按码点计数,不按 UTF-16 单元', () => {
  // U+20000 是 CJK 扩展 B:10 个码点 → 10/1.5 = 6.67 → 7(按单元算会只得到 6)
  assert.equal(estimateTokens('𠀀'.repeat(10)), 7)
})

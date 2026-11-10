/**
 * 基线层测试：只测纯函数与真实 git 探测，不启动 Harness 运行时。
 *
 * 为什么要能在运行时之外测：契约文本、环境事实格式与 complete 合并规则是这段能力的
 * 全部产出；把它们钉住，才能在改装配逻辑时不悄悄改掉模型看到的字。
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir, homedir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  BASELINE_DEFAULTS,
  BASELINE_TEXT,
  baselineSections,
  normalizeBaseline,
} from '../src/baseline.ts'
import { clearGitCache, environmentFactsText, probeGit } from '../src/host/environment-facts.ts'

function tempDir(prefix) {
  return mkdtempSync(join(tmpdir(), prefix))
}

test('默认:三段全开、自定义关闭且文本为空;缺字段回落,非布尔/非字符串被忽略', () => {
  assert.deepEqual(normalizeBaseline(undefined), { ...BASELINE_DEFAULTS, customText: '' })
  assert.deepEqual(normalizeBaseline({ contract: false }), { ...BASELINE_DEFAULTS, contract: false, customText: '' })
  assert.equal(normalizeBaseline({ contract: 'off' }).contract, true)
  assert.equal(normalizeBaseline({ customText: 42 }).customText, '')
  assert.equal(normalizeBaseline({ customText: 'x'.repeat(30000) }).customText.length, 20000)
})

test('契约覆盖六条要求，且不含本机路径或用户名', () => {
  const contract = BASELINE_TEXT.contract
  assert.match(contract, /不可逆或对外可见/)
  assert.match(contract, /如实汇报/)
  assert.match(contract, /信息足够就行动/)
  assert.match(contract, /跟随周边代码/)
  assert.match(contract, /刚写完或刚改过的文件不回读/)
  assert.match(contract, /<system-reminder>/)
  assert.doesNotMatch(contract, /[A-Za-z]:\\|\/Users\/|\/home\//)
  assert.ok(!contract.includes(homedir()))
})

test('不可信文件规则含隔离目录、参数传路径、python -I 与 3.11 的 -P', () => {
  const text = BASELINE_TEXT.untrustedFiles
  assert.match(text, /新空目录/)
  assert.match(text, /作为参数传给解释器/)
  assert.match(text, /python -I/)
  assert.match(text, /早于 3\.11/)
  assert.match(text, /-P/)
  assert.match(text, /json\.py/)
  assert.match(text, /不取代它/)
})

test('卡片回执只限制成功回执，失败仍要细节', () => {
  assert.match(BASELINE_TEXT.cardReceipt, /一句话确认/)
  assert.match(BASELINE_TEXT.cardReceipt, /失败细节不受此限/)
})

test('段按开关返回文本，关闭时为空串（装配层丢弃空段）', () => {
  let baseline = { ...BASELINE_DEFAULTS }
  const sections = baselineSections(() => baseline)
  assert.equal(sections.length, 4)
  for (const section of sections) assert.equal(section.interpolate, false)
  assert.equal(sections[0].text(), BASELINE_TEXT.contract)
  baseline = { ...baseline, contract: false }
  assert.equal(sections[0].text(), '')
  assert.equal(sections[1].text(), BASELINE_TEXT.cardReceipt)
})

test('自定义文本:勾选才注入,换行原样保留,纯空白视同空段', () => {
  let baseline = normalizeBaseline({ customText: 'line one\nline two' })
  const sections = baselineSections(() => baseline)
  const custom = sections.find((section) => section.name === 'session-context-config:custom-text')
  assert.notEqual(custom, undefined)
  assert.equal(custom.text(), '')
  baseline = { ...baseline, custom: true }
  assert.equal(custom.text(), 'line one\nline two')
  baseline = { ...baseline, customText: '  \n\t ' }
  assert.equal(custom.text(), '')
  baseline = { ...baseline, customText: 'again' }
  assert.equal(custom.text(), 'again')
})

test('段顺序排在部署段之后（附加规则收尾），且互不重复', () => {
  const orders = baselineSections(() => BASELINE_DEFAULTS).map((section) => section.order)
  assert.deepEqual(orders.slice().sort((a, b) => a - b), orders)
  // 宿主最大段位是 deployment:persona-suffix 的 10200,附加规则必须排在它之后。
  for (const order of orders) assert.ok(order > 10200)
  assert.equal(new Set(orders).size, orders.length)
})

test('complete 合并已移除：附加规则只作为全局段存在', () => {
  assert.equal(Object.hasOwn(BASELINE_DEFAULTS, 'inCompletePrompt'), false)
  assert.equal(normalizeBaseline({ inCompletePrompt: false }).contract, true)
})

test('环境事实格式：仓库/非仓库/探测失败三态', () => {
  const base = { platform: 'win32', osType: 'Windows_NT', osRelease: '10.0.26200', shell: 'pwsh' }
  const repo = environmentFactsText({ ...base, git: { kind: 'repo', branch: 'main', dirty: false } })
  assert.match(repo, /platform: win32 \(Windows_NT 10\.0\.26200\)/)
  assert.match(repo, /shell: pwsh/)
  assert.match(repo, /repository on branch main, working tree clean/)
  assert.match(environmentFactsText({ ...base, git: { kind: 'repo', branch: 'main', dirty: true } }), /dirty/)
  assert.match(environmentFactsText({ ...base, git: { kind: 'none' } }), /not a git repository/)
  assert.match(environmentFactsText({ ...base, git: { kind: 'unknown', reason: 'git timed out' } }), /unknown \(git timed out\)/)
  assert.equal(environmentFactsText(null), '')
  assert.doesNotMatch(repo, /[A-Za-z]:\\/)
})

test('真实 git 探测：仓库带分支与脏标记，普通目录判为 none', () => {
  clearGitCache()
  const repo = tempDir('scc-repo-')
  const plain = tempDir('scc-plain-')
  try {
    execFileSync('git', ['init', '-b', 'main'], { cwd: repo, stdio: 'ignore' })
    writeFileSync(join(repo, 'a.txt'), 'a', 'utf8')
    const status = probeGit(repo)
    assert.equal(status.kind, 'repo')
    assert.equal(status.branch, 'main')
    // 全新仓库里 a.txt 是未跟踪文件；--untracked-files=no 不算脏，这里断言的是读取成功而非具体值
    assert.equal(typeof status.dirty, 'boolean')
    assert.equal(probeGit(plain).kind, 'none')
  } finally {
    rmSync(repo, { recursive: true, force: true })
    rmSync(plain, { recursive: true, force: true })
  }
})

test('git 缺失或超时降级为 unknown，不抛错', () => {
  clearGitCache()
  const dir = tempDir('scc-missing-')
  try {
    const missing = probeGit(dir, () => {
      const error = new Error('spawn git ENOENT')
      error.code = 'ENOENT'
      throw error
    })
    assert.deepEqual(missing, { kind: 'unknown', reason: 'git is not installed' })
    clearGitCache()
    const timeout = probeGit(dir, () => {
      const error = new Error('timeout')
      error.killed = true
      throw error
    })
    assert.deepEqual(timeout, { kind: 'unknown', reason: 'git timed out' })
    clearGitCache()
    const failed = probeGit(dir, () => {
      const error = new Error('boom')
      error.stderr = 'fatal: something else'
      error.status = 1
      throw error
    })
    assert.equal(failed.kind, 'unknown')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('探测缓存命中后不再调用 git（同一目录第二次不执行命令）', () => {
  clearGitCache()
  const dir = tempDir('scc-cache-')
  let calls = 0
  try {
    const run = () => {
      calls += 1
      return '## main\n'
    }
    probeGit(dir, run)
    probeGit(dir, run)
    assert.equal(calls, 1)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('未跟踪文件不计入脏，已跟踪文件改动计入', () => {
  clearGitCache()
  const repo = tempDir('scc-dirty-')
  try {
    execFileSync('git', ['init', '-b', 'main'], { cwd: repo, stdio: 'ignore' })
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '--allow-empty', '-m', 'init'], { cwd: repo, stdio: 'ignore' })
    writeFileSync(join(repo, 'tracked.txt'), 'a', 'utf8')
    execFileSync('git', ['add', 'tracked.txt'], { cwd: repo, stdio: 'ignore' })
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-m', 'add'], { cwd: repo, stdio: 'ignore' })
    assert.equal(probeGit(repo).dirty, false)
    clearGitCache()
    writeFileSync(join(repo, 'tracked.txt'), 'b', 'utf8')
    assert.equal(probeGit(repo).dirty, true)
    clearGitCache()
    execFileSync('git', ['checkout', '--', 'tracked.txt'], { cwd: repo, stdio: 'ignore' })
    writeFileSync(join(repo, 'untracked.txt'), 'c', 'utf8')
    assert.equal(probeGit(repo).dirty, false)
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
})

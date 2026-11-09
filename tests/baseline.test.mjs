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
  clearGitCache,
  composeCompletePrompt,
  environmentFactsText,
  normalizeBaseline,
  probeGit,
} from '../src/baseline.ts'

function tempDir(prefix) {
  return mkdtempSync(join(tmpdir(), prefix))
}

test('默认全开，缺字段回落到默认值，非布尔值被忽略', () => {
  assert.deepEqual(normalizeBaseline(undefined), BASELINE_DEFAULTS)
  assert.deepEqual(normalizeBaseline({ contract: false }), { ...BASELINE_DEFAULTS, contract: false })
  assert.equal(normalizeBaseline({ contract: 'off' }).contract, true)
})

test('契约覆盖 A1 的六条要求，且不含本机路径或用户名', () => {
  const contract = BASELINE_TEXT.contract
  assert.match(contract, /irreversible or externally visible actions/)
  assert.match(contract, /Report honestly/)
  assert.match(contract, /Act once the information is sufficient/)
  assert.match(contract, /Match the surrounding code/)
  assert.match(contract, /Do not re-read a file you just wrote or edited/)
  assert.match(contract, /<system-reminder>/)
  assert.doesNotMatch(contract, /[A-Za-z]:\\|\/Users\/|\/home\//)
  assert.ok(!contract.includes(homedir()))
})

test('不可信文件规则含隔离目录、参数传路径、python -I 与 3.11 的 -P', () => {
  const text = BASELINE_TEXT.untrustedFiles
  assert.match(text, /new empty directory/)
  assert.match(text, /Pass paths as arguments/)
  assert.match(text, /python -I/)
  assert.match(text, /older than 3\.11/)
  assert.match(text, /-P/)
  assert.match(text, /json\.py/)
  assert.match(text, /do not replace it/)
})

test('卡片回执只限制成功回执，失败仍要细节', () => {
  assert.match(BASELINE_TEXT.cardReceipt, /one sentence/)
  assert.match(BASELINE_TEXT.cardReceipt, /Error details stay allowed/)
})

test('段按开关返回文本，关闭时为空串（装配层丢弃空段）', () => {
  let baseline = { ...BASELINE_DEFAULTS }
  const sections = baselineSections(() => baseline)
  assert.equal(sections.length, 3)
  for (const section of sections) assert.equal(section.interpolate, false)
  assert.equal(sections[0].text(), BASELINE_TEXT.contract)
  baseline = { ...baseline, contract: false }
  assert.equal(sections[0].text(), '')
  assert.equal(sections[1].text(), BASELINE_TEXT.cardReceipt)
})

test('段顺序落在 persona(0) 与 PLAN_POLICY(500) 之间，且互不重复', () => {
  const orders = baselineSections(() => BASELINE_DEFAULTS).map((section) => section.order)
  assert.deepEqual(orders.slice().sort((a, b) => a - b), orders)
  for (const order of orders) assert.ok(order > 0 && order < 500)
  assert.equal(new Set(orders).size, orders.length)
})

test('complete 合并：默认追加在用户文本之后，可单独关掉基线合并', () => {
  const baseline = { ...BASELINE_DEFAULTS }
  const merged = composeCompletePrompt('自定义提示词。', baseline)
  assert.ok(merged.startsWith('自定义提示词。'))
  assert.ok(merged.includes(BASELINE_TEXT.contract))
  assert.equal(composeCompletePrompt('', baseline), [
    BASELINE_TEXT.contract,
    BASELINE_TEXT.cardReceipt,
    BASELINE_TEXT.untrustedFiles,
  ].join('\n\n'))
  assert.equal(composeCompletePrompt('只有我的', { ...baseline, inCompletePrompt: false }), '只有我的')
  assert.equal(
    composeCompletePrompt('x', { ...baseline, contract: false, cardReceipt: false, untrustedFiles: false }),
    'x',
  )
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

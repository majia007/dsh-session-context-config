/**
 * A2 的规则可执行性测试：证明「下载目录里的 json.py 能劫持 import json」，
 * 以及按规则用 `python -I` 时不会发生。
 *
 * 测的是规则本身而不是插件代码：插件只输出文本，文本是否成立必须能跑出来。
 * 没有 python 时整组跳过（exitCode 0），并在输出里写明 skipped。
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'
import test from 'node:test'

function pythonBinary() {
  for (const candidate of ['python', 'python3', 'py']) {
    const probe = spawnSync(candidate, ['-c', 'import sys; print(sys.version_info[0])'], { encoding: 'utf8' })
    if (probe.status === 0 && probe.stdout.trim() === '3') return candidate
  }
  return null
}

const python = pythonBinary()

test('按规则运行不会导入下载目录里的 json.py', { skip: python ? false : 'python 不可用' }, () => {
  const downloads = mkdtempSync(join(tmpdir(), 'scc-downloads-'))
  const scripts = mkdtempSync(join(tmpdir(), 'scc-scripts-'))
  try {
    // 一个足以劫持 import json 的同名模块
    writeFileSync(join(downloads, 'json.py'), 'raise RuntimeError("hijacked")\n', 'utf8')
    writeFileSync(
      join(scripts, 'probe.py'),
      'import json\nprint("ok", hasattr(json, "loads"))\n',
      'utf8',
    )

    // 不隔离：python 会把脚本目录和 cwd 放进 sys.path —— 这正是规则要防的
    const hijacked = spawnSync(python, ['-c', 'import json'], { cwd: downloads, encoding: 'utf8' })
    assert.notEqual(hijacked.status, 0, '裸 python 应当被 json.py 劫持')
    assert.match(String(hijacked.stderr), /hijacked/)

    // 规则：用 -I 从安全目录读，且 cwd 不在下载目录
    const isolated = spawnSync(python, ['-I', join(scripts, 'probe.py')], {
      cwd: scripts,
      encoding: 'utf8',
    })
    assert.equal(isolated.status, 0, isolated.stderr)
    assert.match(isolated.stdout, /ok True/)

    // 规则：-I 的 sys.path 不含下载目录；3.11 起 -I 隐含 -P，更早版本仍留 cwd，
    // 所以规则要求旧版本补 -P 或先切到安全目录。
    const isolatedPaths = spawnSync(python, ['-I', '-c', 'import sys; print("\\n".join(sys.path))'], {
      cwd: downloads,
      encoding: 'utf8',
    })
    assert.equal(isolatedPaths.status, 0)
    const paths = isolatedPaths.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    const [major, minor] = spawnSync(python, ['-c', 'import sys; print("%d.%d" % sys.version_info[:2])'], {
      encoding: 'utf8',
    }).stdout.trim().split('.').map(Number)
    if (major > 3 || (major === 3 && minor >= 11)) {
      assert.ok(!paths.includes(downloads), '-I 下 cwd 不得进入 sys.path')
      assert.ok(!paths.some((entry) => entry === '' || entry === '.'), '-I（3.11+）不得带 cwd 占位项')
    } else {
      assert.ok(
        paths.includes(downloads) || paths.includes('') || paths.includes('.'),
        `python ${major}.${minor} 的 -I 仍保留 cwd：规则里「旧版本再加 -P 或换安全 cwd」是必需的`,
      )
    }
  } finally {
    rmSync(downloads, { recursive: true, force: true })
    rmSync(scripts, { recursive: true, force: true })
  }
})

test('从下载目录运行入口脚本会命中劫持（反证：规则禁止这种用法）', { skip: python ? false : 'python 不可用' }, () => {
  const downloads = mkdtempSync(join(tmpdir(), 'scc-entry-'))
  try {
    mkdirSync(join(downloads, 'pkg'), { recursive: true })
    writeFileSync(join(downloads, 'json.py'), 'raise RuntimeError("hijacked")\n', 'utf8')
    writeFileSync(join(downloads, 'main.py'), 'import json\nprint("ok")\n', 'utf8')
    const run = spawnSync(python, [join(downloads, 'main.py')], { cwd: downloads, encoding: 'utf8' })
    assert.notEqual(run.status, 0, '脚本目录优先于标准库，这正是不能用下载目录当入口的原因')
    assert.match(String(run.stderr), /hijacked/)
  } finally {
    rmSync(downloads, { recursive: true, force: true })
  }
})

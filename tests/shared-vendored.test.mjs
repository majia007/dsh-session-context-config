/**
 * 生成文件门禁(生成文件,勿手改)。
 *
 * 三道门,对应「同刻同步」的三条不变量:
 *   1. 头行哈希 = 文件实际内容哈希 —— 手改 vendored 副本立刻失败(规范源在根仓 _shared/,
 *      由 _scripts/sync-shared.mjs 渲染,重跑同步会覆盖任何手改);
 *   2. 样式变量只用本包前缀与宿主 token —— 漏前缀不会崩,只会静默回退设计值(字号不缩放),
 *      这是本方案唯一的陷阱,必须由门禁兜住;
 *   3. 产物里只有带前缀的名字 —— 源码改对了但产物是旧的,同样会静默回退。
 *
 * 哈希按 LF 归一后计算:Windows 检出可能是 CRLF,按原始字节算会让门禁在换行尾的机器上误报。
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

/** 包根(tests/ 的上一级)。 */
const ROOT = fileURLToPath(new URL('..', import.meta.url))

/** 本包的生成清单与样式前缀(由根仓同步脚本写入,改前缀要重跑同步)。 */
const SPEC = {
  "packageName": "dsh-session-context-config",
  "prefix": "cp",
  "tokens": true,
  "generated": [
    {
      "path": "build/preset-kernel.mjs",
      "source": "_shared/preset/kernel.mjs"
    },
    {
      "path": "tests/host-schema.mjs",
      "source": "_shared/test/host-schema.mjs"
    },
    {
      "path": "src/host/connection-fence.ts",
      "source": "_shared/fence/connection-fence.ts"
    },
    {
      "path": "src/client/tokens.module.css",
      "source": "_shared/css/tokens.css"
    }
  ]
}

/** 允许出现在全局选择器上的宿主 token(其余全局变量必须带本包前缀)。 */
const HOST_TOKENS = ['--dsh-content-font-size']

/** 明令禁止的变量名形态:出现即失败,不看它定义在哪里。 */
const BANNED = [
  { pattern: /--dsh-plugin-/g, why: '旧的共享变量名已废弃,一律改成本包前缀' },
  { pattern: /(?<![\w-])--fs-\d/g, why: '裸 --fs-N 落在全局命名空间,必须带本包前缀' },
  { pattern: /(?<![\w-])--font-boost/g, why: '裸 --font-boost 落在全局命名空间,必须带本包前缀' },
]

function sha256(text) {
  return createHash('sha256').update(text.replace(/\r\n/g, '\n'), 'utf8').digest('hex')
}

/** 拆出首行头与正文(正文是哈希的计算范围)。 */
function splitHeader(content) {
  const normalized = content.replace(/\r\n/g, '\n')
  const end = normalized.indexOf('\n')
  assert.ok(end > 0, '生成文件缺头行')
  return { header: normalized.slice(0, end), body: normalized.slice(end + 1) }
}

/** 递归列出目录下的 *.css(POSIX 相对路径只用于报错)。 */
function cssFiles(dir, out = []) {
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) cssFiles(path, out)
    else if (name.endsWith('.css')) out.push(path)
  }
  return out
}

test('生成文件的头行哈希等于文件实际内容哈希', () => {
  for (const entry of SPEC.generated) {
    const path = join(ROOT, entry.path)
    assert.ok(existsSync(path), `缺少生成文件 ${entry.path};在根仓跑 node _scripts/sync-shared.mjs 重新渲染`)
    const { header, body } = splitHeader(readFileSync(path, 'utf8'))
    const matched = /^(\/\/|\/\*) generated from (\S+)@([0-9a-f]{64}) — do not edit(?: \*\/)?$/.exec(header)
    assert.ok(matched !== null, `${entry.path} 的头行形状不对:${header}`)
    assert.equal(matched[2], entry.source, `${entry.path} 标注的来源与规范源不一致`)
    assert.equal(matched[3], sha256(body), `${entry.path} 内容与头行哈希不一致(手改过生成文件?)`)
  }
})

if (SPEC.prefix !== null && SPEC.tokens) {
  test('样式变量只用本包前缀与宿主 token', () => {
    const files = cssFiles(join(ROOT, 'src/client'))
    assert.ok(files.length > 0, '没有任何样式文件,门禁失去意义')
    for (const file of files) {
      const css = readFileSync(file, 'utf8')
      const rel = relative(ROOT, file).split(sep).join('/')
      for (const banned of BANNED) {
        const hit = css.match(banned.pattern)
        assert.equal(hit, null, `${rel} 出现 ${hit?.[0] ?? ''} —— ${banned.why}`)
      }
      // 全局选择器上的自定义属性会泄漏给其它插件,必须带本包前缀或属于宿主 token。
      for (const block of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const selector = block[1].trim().toLowerCase()
        if (selector !== 'body' && selector !== 'html' && selector !== ':root') continue
        for (const decl of block[2].matchAll(/(--[a-zA-Z0-9_-]+)\s*:/g)) {
          assert.ok(
            decl[1].startsWith(`--${SPEC.prefix}-`) || HOST_TOKENS.includes(decl[1]),
            `${rel} 在 ${selector} 上定义了全局变量 ${decl[1]};只允许 --${SPEC.prefix}-* 或宿主 token`,
          )
        }
      }
    }
  })

  test('产物里只有带前缀的字号变量', () => {
    const bundlePath = join(ROOT, 'lib/client.js')
    assert.ok(existsSync(bundlePath), '缺少 lib/client.js;改 src 后先 pnpm build 再跑本门禁')
    const bundle = readFileSync(bundlePath, 'utf8')
    assert.match(bundle, new RegExp(`--${SPEC.prefix}-fs-1[1-4]`), '产物里没有带前缀的字号变量(样式没编进去?)')
    assert.match(bundle, new RegExp(`--${SPEC.prefix}-font-boost`), '产物里没有带前缀的 boost 变量')
    assert.equal(bundle.includes('--dsh-plugin-'), false, '产物里仍有已废弃的 --dsh-plugin-*')
    assert.equal(/(?<![\w-])--fs-\d/.test(bundle), false, '产物里仍有裸 --fs-N(会静默回退设计值)')
    assert.equal(bundle.includes('tokens.module.css'), true, '产物里找不到 tokens.module.css 的 style tag')
  })
}

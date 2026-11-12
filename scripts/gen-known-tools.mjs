/**
 * 从 DSH checkout 的 docs/tool-catalog.md 生成 src/host/known-tools.ts。
 *
 * 为什么需要这份静态表:宿主 tools 注册表不记录注册者,本插件装载前已经注册的
 * 工具无法在运行时回溯。官方工具目录是唯一权威的「工具名 → 包」名单,生成一次随
 * 包发布;运行时只取其中「当前组合里真的装载了」的包,避免同一工具名多包实现
 * (bash / bash-persistent)时的歧义。
 *
 * 用法(在包目录):`node scripts/gen-known-tools.mjs`;checkout 路径可用 DSH_SRC 覆盖。
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const PKG_ROOT = fileURLToPath(new URL('..', import.meta.url))
const DSH_ROOT = process.env.DSH_SRC ?? 'D:/workspace/IDE/deepseek-harness'
const CATALOG = resolve(DSH_ROOT, 'docs/tool-catalog.md')
const OUT = resolve(PKG_ROOT, 'src/host/known-tools.ts')

if (!existsSync(CATALOG)) {
  console.error(`gen-known-tools: 找不到 ${CATALOG};用 DSH_SRC 指向 deepseek-harness checkout 根`)
  process.exit(1)
}

let dshVersion = 'unknown'
try {
  dshVersion = JSON.parse(readFileSync(resolve(DSH_ROOT, 'package.json'), 'utf8')).version
} catch {
  /* 版本只用于生成文件头注释 */
}

/** 按未转义的 `|` 切表格行,保留单元格内的 `\|`。 */
function cells(line) {
  const out = []
  let current = ''
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if (char === '\\' && line[index + 1] === '|') {
      current += '|'
      index += 1
      continue
    }
    if (char === '|') {
      out.push(current)
      current = ''
      continue
    }
    current += char
  }
  out.push(current)
  return out.slice(1, -1).map((cell) => cell.trim())
}

const tools = new Map()
for (const line of readFileSync(CATALOG, 'utf8').split('\n')) {
  if (!line.startsWith('| `@deepseek-ai/')) continue
  const columns = cells(line)
  const pkg = columns[0]?.replace(/^`|`$/g, '')
  if (!pkg?.startsWith('@deepseek-ai/')) continue
  // 第 2 列是模型可见的工具名,第 5 列是随包发布的别名(subagent / subagent_fork 这类)。
  for (const column of [columns[1] ?? '', columns[4] ?? '']) {
    for (const match of column.matchAll(/`([^`]+)`/g)) {
      const name = match[1]
      if (!/^[a-z][a-z0-9_]*$/.test(name)) continue
      const packages = tools.get(name) ?? []
      if (!packages.includes(pkg)) packages.push(pkg)
      tools.set(name, packages)
    }
  }
}

const names = [...tools.keys()].sort()
const entries = names.map((name) => {
  const packages = tools.get(name).sort()
  return `  ${JSON.stringify(name)}: [${packages.map((pkg) => JSON.stringify(pkg)).join(', ')}],`
})

const body = `/**
 * DSH 官方工具名 → 提供它的包(生成文件,勿手改)。
 *
 * 来源:deepseek-harness ${dshVersion} 的 docs/tool-catalog.md。
 * 重新生成:在包目录执行 \`node scripts/gen-known-tools.mjs\`(checkout 路径用 DSH_SRC 覆盖)。
 *
 * 只在运行时作为「本插件装载前已注册的工具」的补证使用:解析时还要与当前组合里
 * 真正装载的 Loader 入口求交,同一工具名由多个包实现时(如 bash / bash-persistent)
 * 只保留实际装载的那一个。
 */
export const KNOWN_TOOL_PACKAGES: Readonly<Record<string, readonly string[]>> = {
${entries.join('\n')}
}
`

writeFileSync(OUT, body)
console.log(`gen-known-tools: wrote ${OUT} (${names.length} tools, DSH ${dshVersion})`)

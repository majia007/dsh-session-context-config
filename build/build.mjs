/**
 * 构建编排:基线校验(在 preset 内)→ tsc(出 lib/types 的 js + d.ts)→ tsdown(Node 半边 + client bundle)。
 *
 * tsc / tsdown 都用本地 node_modules 的入口,不走 PATH(独立仓库不假设全局工具);
 * tsdown 走 CLI(配置由 build/tsdown.config.mjs 提供),避免依赖其未承诺的编程式 API。
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const packageRoot = fileURLToPath(new URL('..', import.meta.url))
const require = createRequire(import.meta.url)

// lib/ 是纯生成物(入库但每次构建整体重建),预清理防改名模块的陈旧产物残留。
rmSync(new URL('../lib', import.meta.url), { recursive: true, force: true })

function localTool(packageName, relativeEntry) {
  const manifest = JSON.parse(readFileSync(new URL(`../node_modules/${packageName}/package.json`, import.meta.url), 'utf8'))
  const entry = fileURLToPath(new URL(`../node_modules/${packageName}/${relativeEntry}`, import.meta.url))
  if (!existsSync(entry)) {
    throw new Error(`build: ${packageName} 缺少 ${relativeEntry};先 pnpm install`)
  }
  return entry
}

function run(nodeEntry, args, label) {
  const result = spawnSync(process.execPath, [nodeEntry, ...args], {
    cwd: packageRoot,
    stdio: 'inherit',
  })
  if (result.status !== 0) {
    throw new Error(`build: ${label} 失败(退出码 ${result.status})`)
  }
}

const tsdownManifest = JSON.parse(readFileSync(new URL('../node_modules/tsdown/package.json', import.meta.url), 'utf8'))
const tsdownBin = typeof tsdownManifest.bin === 'string' ? tsdownManifest.bin : tsdownManifest.bin.tsdown

run(localTool('typescript', 'lib/tsc.js'), ['-p', 'tsconfig.json'], 'tsc(emit lib/types)')
run(localTool('tsdown', tsdownBin), ['--config', 'build/tsdown.config.mjs'], 'tsdown')
console.log('build: lib/index.js + lib/client.js + lib/types 已生成')
// 桌面自带 client-hmr:Host 每 500ms stat-poll client bundle,变化即通过 /plugins/events
// 推 rebuilt 帧,页面自动重挂该 entry(约 1s),不需要刷新或重启。Host 侧的
// lib/index.js 不在 watch 范围(忽略 node_modules),要 disable→enable 或重启。
console.log('✔ client bundle:桌面 HMR 会自动生效(约 1s);Host 改动请用插件页行开关 disable→enable 或重启。不要刷新页面(实测会崩)。')

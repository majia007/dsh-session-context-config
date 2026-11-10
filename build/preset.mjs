/**
 * 本地构建 preset:在独立仓库里复刻官方 `packages/client/tsdown.client.ts` 的产物契约。
 *
 * 官方 preset 不能直接 import——它依赖 checkout 内部文件(web/src/platform.ts、modules/src/assets.ts、
 * scripts/*),外部仓库拿不到。这里只复刻产物契约四条(镜像 2026-11-09 对 tag dsh-v0.2.2-rc.1 的实证):
 *   1. client 产物调 window.__ModuleLoader__.load({ id: <包名>, factory }),id 必须等于包名;
 *   2. externals = 平台基线(PLATFORM_MODULES,11 项)+ 包声明 dsh.client.external;
 *      基线在构建期用 DSH_SRC 指向 checkout 校验,清单不符显式报错,不静默放行;
 *   3. *.module.css 由 lightningcss 编译成类名映射,并在 factory 执行时注入带 tag 的
 *      <style>(tag=包名);Node 半边输出 lib/index.js,tsc 输出 lib/types/**;
 *   4. build.mjs 负责编排:tsc(出 lib/types)→ tsdown(出 lib/index.js + lib/client.js)。
 *
 * 与官方 preset 的完整偏差清单见本插件 AGENTS.md。
 */
import { existsSync, readFileSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { transform } from 'lightningcss'

/** 包根(build/ 的上一级);tsdown 把配置里的相对路径按配置文件目录解析,入口一律给绝对路径。 */
const PKG_ROOT = fileURLToPath(new URL('..', import.meta.url))

/** 本插件包名;client 产物的 __ModuleLoader__.load id 与 style tag 都用它。 */
const PKG_NAME = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).name

/** CSS Modules 类名前缀(不含连字符);测试桩与 smoke 门禁共用这一约定。 */
export const CSS_PREFIX = 'cp'

/** 本地钉住的平台基线;每次构建与 checkout 的 platform.ts 比对,漂移即报错。 */
export const PLATFORM_MODULES_BASELINE = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  'zod',
  '@tanstack/react-virtual',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
]

const DEFAULT_CHECKOUT = 'D:/workspace/IDE/deepseek-harness'

/**
 * 解析 checkout 根并校验平台基线:环境变量 DSH_SRC 优先,缺省用仓库惯例的 checkout 路径。
 * platform.ts 的形状漂移或清单不符都显式抛错。
 */
export function verifyBaseline() {
  const root = process.env.DSH_SRC ?? DEFAULT_CHECKOUT
  const platformPath = resolve(root, 'packages/client/web/src/platform.ts')
  if (!existsSync(platformPath)) {
    throw new Error(`build preset: 找不到 ${platformPath};用 DSH_SRC 指向 deepseek-harness checkout 根`)
  }
  const source = readFileSync(platformPath, 'utf8')
  const start = source.indexOf('export const PLATFORM_MODULES = [')
  const end = start < 0 ? -1 : source.indexOf('] as const', start)
  if (start < 0 || end < 0) {
    throw new Error(`build preset: ${platformPath} 的 PLATFORM_MODULES 形状变了,人工核对后更新本 preset 的提取器与基线`)
  }
  const found = [...source.slice(start, end).matchAll(/'([^']+)'/g)].map((match) => match[1])
  const missing = PLATFORM_MODULES_BASELINE.filter((name) => !found.includes(name))
  const extra = found.filter((name) => !PLATFORM_MODULES_BASELINE.includes(name))
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(
      `build preset: 平台基线漂移(对照 ${platformPath})。`
      + (missing.length > 0 ? ` 本地缺: ${missing.join(', ')}。` : '')
      + (extra.length > 0 ? ` checkout 新增: ${extra.join(', ')}。` : '')
      + ' 更新 PLATFORM_MODULES_BASELINE 后重跑。',
    )
  }
  return root
}

/** 包声明的 dsh.client.external(模块表请求);与基线一起构成 client bundle 的请求面。 */
function requestedExternals() {
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  const external = manifest?.dsh?.client?.external
  if (external === undefined) return []
  if (!Array.isArray(external) || external.some((item) => typeof item !== 'string')) {
    throw new Error('build preset: package.json 的 dsh.client.external 声明必须是字符串数组')
  }
  return external
}

const CSS_VIRTUAL_PREFIX = '\0dsh-css:'
const CSS_VIRTUAL_SUFFIX = '.mjs'

/**
 * 生成一个注入器模块:import 它的瞬间,若同 tag 的 <style> 不在场就注入一条
 * (tag=包名/<文件名>,attr 与官方 preset 一致),并 default 导出类名映射。
 */
function styleInjectionModule(fileId, css, classMap) {
  const tagId = `${PKG_NAME}/${basename(fileId)}`
  return [
    `const css = ${JSON.stringify(css)};`,
    `const tagId = ${JSON.stringify(tagId)};`,
    'if (typeof document !== \'undefined\' && document.querySelector(\'style[data-plugin-css=\' + JSON.stringify(tagId) + \']\') === null) {',
    '  const tag = document.createElement(\'style\');',
    `  tag.dataset.plugin = ${JSON.stringify(PKG_NAME)};`,
    '  tag.dataset.pluginCss = tagId;',
    '  tag.textContent = css;',
    '  document.head.appendChild(tag);',
    '}',
    `export default ${JSON.stringify(classMap)};`,
  ].join('\n')
}

/** CSS Modules 内联插件(官方 dsh-css-modules-inline 的契约复刻):编译 + 类名映射 + 带tag注入。 */
function cssModulesPlugin() {
  return {
    name: 'dsh-css-modules-inline',
    resolveId(source, importer) {
      if (!source.endsWith('.module.css')) return null
      const abs = importer !== undefined ? resolve(dirname(importer), source) : source
      return CSS_VIRTUAL_PREFIX + abs + CSS_VIRTUAL_SUFFIX
    },
    async load(virtualId) {
      if (!virtualId.startsWith(CSS_VIRTUAL_PREFIX)) return null
      const fileId = virtualId.slice(CSS_VIRTUAL_PREFIX.length, -CSS_VIRTUAL_SUFFIX.length)
      this.addWatchFile(fileId)
      const source = await import('node:fs/promises').then((m) => m.readFile(fileId))
      const { code, exports: cssExports } = transform({
        filename: fileId,
        code: source,
        cssModules: { pattern: `${CSS_PREFIX}-[local]` },
        minify: true,
      })
      const classMap = {}
      for (const [local, exported] of Object.entries(cssExports ?? {})) classMap[local] = exported.name
      return styleInjectionModule(fileId, code.toString(), classMap)
    },
  }
}

/** client 产物的 banner/footer:factory 包装形态与官方逐字一致,id 必须是包名(契约 1)。 */
function factoryWrapper() {
  return {
    banner: () => `window.__ModuleLoader__.load({ id: ${JSON.stringify(PKG_NAME)}, factory: (require) => {`,
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  }
}

/**
 * 两条 tsdown 配置:Node 半边(tsc 产物 lib/types/index.js → lib/index.js 单文件)
 * 与浏览器半边(src/client/index.ts → lib/client.js,factory 形态)。
 */
export function makeConfigs() {
  verifyBaseline()
  const externals = new Set([...PLATFORM_MODULES_BASELINE, ...requestedExternals()])
  const isRequested = (specifier) => externals.has(specifier)
  return [
    {
      name: `${PKG_NAME}/node`,
      entry: { index: resolve(PKG_ROOT, 'lib/types/index.js') },
      outDir: resolve(PKG_ROOT, 'lib'),
      format: 'esm',
      platform: 'node',
      target: 'es2024',
      fixedExtension: false,
      dts: false,
      clean: false,
    },
    {
      name: `${PKG_NAME}/client`,
      entry: { client: resolve(PKG_ROOT, 'src/client/index.ts') },
      outDir: resolve(PKG_ROOT, 'lib'),
      format: 'cjs',
      platform: 'browser',
      target: 'es2024',
      dts: false,
      sourcemap: true,
      clean: false,
      deps: {
        neverBundle: isRequested,
        alwaysBundle: (specifier) => !isRequested(specifier),
      },
      outputOptions: {
        entryFileNames: 'client.js',
        sourcemapExcludeSources: false,
        ...factoryWrapper(),
      },
      plugins: [cssModulesPlugin()],
    },
  ]
}

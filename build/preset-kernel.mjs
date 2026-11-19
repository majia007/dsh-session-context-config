// generated from _shared/preset/kernel.mjs@7a23f594be8811badd553618ad285897fd38b3e6034918aef143f4aee1a09150 — do not edit
/**
 * 本地构建 preset 的稳定内核(生成文件,勿手改)。
 *
 * 官方 preset 不能直接 import——它依赖 checkout 内部文件(web/src/platform.ts、
 * modules/src/assets.ts、scripts/*),外部仓库拿不到。这里复刻产物契约四条:
 *   1. client 产物调 window.__ModuleLoader__.load({ id: <包名>, factory }),id 必须等于包名;
 *   2. externals = 平台基线(PLATFORM_MODULES)+ 包声明 dsh.client.external;
 *      基线在构建期用 DSH_SRC 指向 checkout 校验,清单不符显式报错,不静默放行;
 *   3. *.module.css 由 lightningcss 编译成类名映射,并在 factory 执行时注入带 tag 的
 *      <style>(tag=包名/文件名,attr 与官方一致);Node 半边输出 lib/index.js,tsc 输出 lib/types/**;
 *   4. build.mjs 负责编排:tsc(出 lib/types)→ tsdown(出 lib/index.js + lib/client.js)。
 *
 * 各包差异只由 build/preset.mjs 的声明决定:产物集合(纯函数独立产物)、类名映射模式、
 * 单表即注 vs 注册表定序注入、Node 半边的 vendor 别名与 require shim。
 * lightningcss 走动态 import:纯 Host 包没有这份 devDependency,内核加载期不能要求它。
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

/** 包根(build/ 的上一级);tsdown 把配置里的相对路径按配置文件目录解析,入口一律给绝对路径。 */
export const PKG_ROOT = fileURLToPath(new URL('..', import.meta.url))

/** 本插件包名;client 产物的 __ModuleLoader__.load id 与 style tag 都用它。 */
export const PKG_NAME = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).name

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
 * 解析 checkout 根并校验平台基线:环境变量 DSH_SRC 优先,缺省用仓库惯例的 checkout 路径
 * (checkout 迁移时同步改这里的常量)。platform.ts 的形状漂移或清单不符都显式抛错。
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

/**
 * 宿主 vendor 源别名:把 `@deepseek-ai/cordis` 等指向 checkout 的 TypeScript 源,
 * 让打进 Host 产物的 vendored cordis 系与宿主同源(checkout 迁移时同步改 verifyBaseline 的常量)。
 */
function vendorAliases(root) {
  return {
    '@deepseek-ai/cordis': `${root}/vendor/cordis/src/index.ts`,
    '@deepseek-ai/schemastery': `${root}/vendor/schemastery/src/index.ts`,
    '@deepseek-ai/cosmokit': `${root}/vendor/cosmokit/src/index.ts`,
  }
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
const CSS_REGISTRY_SPEC = 'dsh-css-registry'
const CSS_REGISTRY_ID = '\0dsh-css-registry.mjs'

/**
 * 单表即注的注入器模块:import 它的瞬间,若同 tag 的 <style> 不在场就注入一条
 * (tag=包名/<文件名>,attr 与官方预设一致),并 default 导出类名映射。
 */
function perFileStyleModule(fileId, css, classMap) {
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

/**
 * 定序注册表模块:各 *.module.css 注入器把编译产物登记进来,全部到齐后按
 * CSS_SHEET_ORDER 一次性注入(顺序即视觉契约,见各包 preset 的清单注释)。
 */
function registryModule(order) {
  return [
    `const ORDER = ${JSON.stringify(order)};`,
    `const PKG = ${JSON.stringify(PKG_NAME)};`,
    'const pending = new Map();',
    'let flushed = false;',
    'export function register(rel, css) {',
    '  if (typeof document === \'undefined\') return;',
    '  const tagId = PKG + \'/\' + rel.split(\'/\').pop();',
    '  if (document.querySelector(\'style[data-plugin-css="\' + tagId + \'"]\') !== null) { flushed = true; return; }',
    '  pending.set(rel, css);',
    '  if (!flushed && pending.size === ORDER.length) {',
    '    flushed = true;',
    '    for (const sheet of ORDER) {',
    '      const sheetCss = pending.get(sheet);',
    '      if (sheetCss === undefined) continue;',
    '      const tag = document.createElement(\'style\');',
    '      tag.dataset.plugin = PKG;',
    '      tag.dataset.pluginCss = PKG + \'/\' + sheet.split(\'/\').pop();',
    '      tag.textContent = sheetCss;',
    '      document.head.appendChild(tag);',
    '    }',
    '  }',
    '}',
  ].join('\n')
}

/** 定序模式下的注入器模块:登记进注册表(全部到齐后按清单注入),default 导出类名映射。 */
function registryStyleModule(fileId, css, classMap) {
  const rel = relative(resolve(PKG_ROOT, 'src/client'), fileId).split(sep).join('/')
  return [
    `import { register } from '${CSS_REGISTRY_SPEC}';`,
    `register(${JSON.stringify(rel)}, ${JSON.stringify(css)});`,
    `export default ${JSON.stringify(classMap)};`,
  ].join('\n')
}

/** 扫描 src/client 下实际存在的 *.module.css(POSIX 相对路径,目录递归)。 */
function scanCssSheets() {
  const clientDir = resolve(PKG_ROOT, 'src/client')
  const out = []
  const visit = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      const path = join(dir, name)
      if (statSync(path).isDirectory()) visit(path)
      else if (name.endsWith('.module.css')) out.push(relative(clientDir, path).split(sep).join('/'))
    }
  }
  if (!existsSync(clientDir)) return out
  visit(clientDir)
  return out
}

/**
 * 定序清单必须与磁盘文件集完全一致:多出的文件没登记(顺序未定义)、清单里的文件不存在
 * (永不到齐 → 一张表都不注入)。漏登记构建直接报错,而不是静默注入乱序或无样式。
 */
function verifySheetOrder(order) {
  const found = scanCssSheets()
  const extra = found.filter((rel) => !order.includes(rel))
  const missing = order.filter((rel) => !found.includes(rel))
  if (extra.length > 0 || missing.length > 0) {
    throw new Error(
      'build preset: CSS 清单漂移。'
      + (extra.length > 0 ? ` 未登记: ${extra.join(', ')}(顺序敏感,登记进 CSS_SHEET_ORDER)。` : '')
      + (missing.length > 0 ? ` 清单里不存在: ${missing.join(', ')}。` : ''),
    )
  }
}

/** CSS Modules 内联插件(官方 dsh-css-modules-inline 的契约复刻):编译 + 类名映射 + 注入。 */
function cssModulesPlugin(options) {
  const ordered = options.sheets === 'ordered'
  return {
    name: 'dsh-css-modules-inline',
    resolveId(source, importer) {
      if (ordered && source === CSS_REGISTRY_SPEC) return CSS_REGISTRY_ID
      if (!source.endsWith('.module.css')) return null
      const abs = importer !== undefined ? resolve(dirname(importer), source) : source
      return CSS_VIRTUAL_PREFIX + abs + CSS_VIRTUAL_SUFFIX
    },
    async load(virtualId) {
      if (ordered && virtualId === CSS_REGISTRY_ID) return registryModule(options.sheetOrder)
      if (!virtualId.startsWith(CSS_VIRTUAL_PREFIX)) return null
      const fileId = virtualId.slice(CSS_VIRTUAL_PREFIX.length, -CSS_VIRTUAL_SUFFIX.length)
      this.addWatchFile(fileId)
      const source = await import('node:fs/promises').then((m) => m.readFile(fileId))
      const { transform } = await import('lightningcss')
      const { code, exports: cssExports } = transform({
        filename: fileId,
        code: source,
        cssModules: { pattern: options.pattern },
        minify: true,
      })
      // lightningcss 的 exports 键序跟随内部哈希表迭代,同一文件不同进程都可能不同;
      // 不排序会让类名映射顺序抖动、同一份 src 两次构建的 lib/client.js 字节不一致。
      // 按键名排序把产物钉成字节可重复(仓库构建契约)。
      const classMap = {}
      for (const local of Object.keys(cssExports ?? {}).sort()) classMap[local] = cssExports[local].name
      const css = code.toString()
      return ordered ? registryStyleModule(fileId, css, classMap) : perFileStyleModule(fileId, css, classMap)
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

/** Node 半边:tsc 产物 lib/types/index.js → lib/index.js 单文件 ESM。 */
function nodeConfig(spec, root) {
  const config = {
    name: `${PKG_NAME}/node`,
    entry: { index: resolve(PKG_ROOT, 'lib/types/index.js') },
    outDir: resolve(PKG_ROOT, 'lib'),
    format: 'esm',
    platform: 'node',
    target: 'es2024',
    // 固定 .js 扩展名(package.json main 指 lib/index.js;.mjs 会两处失配)。
    fixedExtension: false,
    dts: false,
    clean: false,
  }
  if (spec.vendorAliases === true) config.inputOptions = { resolve: { alias: vendorAliases(root) } }
  if (spec.requireShim === true) {
    config.outputOptions = {
      // 打进来的 CJS 依赖(vendored cordis 系)会对 node 内建 require();shim 保持该形态合法。
      banner: "const require = (await import('node:module')).createRequire(import.meta.url);",
    }
  }
  return config
}

/** 纯函数独立产物:单测直接 import 的那个入口(lib/<name>.js)。 */
function pureConfig(name, typeEntry) {
  return {
    name: `${PKG_NAME}/${name}`,
    entry: { [name]: resolve(PKG_ROOT, `lib/types/${typeEntry}.js`) },
    outDir: resolve(PKG_ROOT, 'lib'),
    format: 'esm',
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    dts: false,
    clean: false,
  }
}

/**
 * 浏览器半边:src/client 入口 → lib/client.js(factory 形态,sourcemap 直指 TS 源)。
 *
 * 请求面(基线 + dsh.client.external)保持 import,其余一律内联——require 撞不上模块表
 * 就抛 `missed the module table`,所以边界就是包自己的请求清单(官方同款语义)。
 */
function clientConfig(spec) {
  const externals = new Set(PLATFORM_MODULES_BASELINE)
  if (spec.requestedExternals !== false) for (const name of requestedExternals()) externals.add(name)
  const isRequested = (specifier) => externals.has(specifier)
  return {
    name: `${PKG_NAME}/client`,
    entry: { client: resolve(PKG_ROOT, spec.entry ?? 'src/client/index.ts') },
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
    plugins: [cssModulesPlugin({
      // 类名模式:有前缀的包用 `<prefix>-[local]`(局部类名需要命名空间);
      // 无前缀的包用恒等映射 `[local]`(类名本身就是完整命名空间名,如 dsh-me-*)。
      pattern: spec.cssPrefix ? `${spec.cssPrefix}-[local]` : '[local]',
      sheets: spec.sheets ?? 'per-file',
      sheetOrder: spec.sheetOrder ?? [],
    })],
  }
}

/**
 * 按本包声明产出 tsdown 配置数组。
 *
 * @param spec - 本包产物声明:node(别名/require shim)、pure(纯函数独立产物)、
 *   client(入口、类名前缀、注入模式、清单、是否吃 dsh.client.external)。
 *   纯 Host 包不传 client 时连平台基线都不校验——它们没有 client bundle,不该被要求
 *   有 DSH checkout。
 * @returns tsdown 配置数组(node → pure* → client)。
 */
export function defineConfigs(spec) {
  const needsCheckout = spec.client !== undefined || spec.node?.vendorAliases === true
  const root = needsCheckout ? verifyBaseline() : undefined
  const configs = [nodeConfig(spec.node ?? {}, root)]
  for (const entry of spec.pure ?? []) configs.push(pureConfig(entry.name, entry.typeEntry))
  if (spec.client !== undefined) {
    const sheets = spec.client.sheets ?? 'per-file'
    if (sheets === 'ordered') verifySheetOrder(spec.client.sheetOrder ?? [])
    configs.push(clientConfig(spec.client))
  }
  return configs
}

/**
 * 面板组件直读 src 测试用的模块钩子:宿主 ui-primitives 真身在浏览器模块表里,
 * Node 里取不到,桩成最小可运行实现;*.module.css 桩成按 cp- 前缀约定的类名映射
 * (与 build/preset.mjs 的编译形态一致,测试选择器可复用真机写法)。
 */
const PRIMITIVES = '@deepseek-ai/dsh-client-ui-primitives'

export async function resolve(specifier, context, nextResolve) {
  if (specifier === PRIMITIVES || specifier.endsWith('.module.css')) {
    return { url: `stub:${specifier}`, shortCircuit: true }
  }
  return nextResolve(specifier, context)
}

export async function load(url, context, nextLoad) {
  if (!url.startsWith('stub:')) return nextLoad(url, context)
  const source = url === `stub:${PRIMITIVES}`
    ? 'export const SegmentedControl = () => null\nexport const Tag = () => null\n'
    : 'export default new Proxy({}, { get: (_target, key) => `cp-${String(key)}` })\n'
  return { format: 'module', source, shortCircuit: true }
}

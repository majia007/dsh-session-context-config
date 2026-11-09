/**
 * CSS Modules 的类型面:构建期由 lightningcss 产出真实映射,运行时类名带 cp- 前缀
 * (build/preset.mjs 的 CSS_PREFIX);测试环境由 tests/css-module-hook.mjs 提供同名桩。
 */
declare module '*.module.css' {
  const classes: { readonly [local: string]: string }
  export default classes
}

/**
 * 本包的产物声明:稳定内核在 `./preset-kernel.mjs`(生成文件,勿手改)。
 *
 * Node 半边(档位装配 + 路由)+ client bundle;类名映射 `cp-[local]`,单表即注。
 */
import { defineConfigs } from './preset-kernel.mjs'

/** CSS Modules 类名前缀(不含连字符);与样式里的 `cp-` 类名空间一致。 */
export const CSS_PREFIX = 'cp'

/** 两条 tsdown 配置:Node 半边与浏览器半边。 */
export function makeConfigs() {
  return defineConfigs({
    client: { cssPrefix: CSS_PREFIX },
  })
}

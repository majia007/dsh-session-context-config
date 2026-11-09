/**
 * 宿主包的最小类型面(镜像 checkout 形状,未验证的成员不写)。
 *
 * 宿主包不在本仓库 node_modules 里:client bundle 构建期把模块表行 external
 * (build/preset.mjs 的 PLATFORM_MODULES_BASELINE),运行期由浏览器模块表的
 * 种子表投喂,tsc 无法解析裸名;按仓库类型策略写最小结构声明。
 * DSH 升级后按 checkout 复核这里的成员面。
 */

declare module '@deepseek-ai/dsh-client-ui-primitives' {
  import type { ReactElement, ReactNode } from 'react'

  /** 镜像 ui-primitives/src/SegmentedControl.tsx 的选项面(dsh-v0.2.2-rc.1)。 */
  export interface SegmentedControlOption<Value extends string = string> {
    value: Value
    label: string
    disabled?: boolean
    title?: string
  }

  /** 镜像 ui-primitives/src/SegmentedControl.tsx 的 props 面(dsh-v0.2.2-rc.1)。 */
  export function SegmentedControl<Value extends string>(props: {
    id: string
    value: Value
    options: readonly SegmentedControlOption<Value>[]
    onChange: (next: Value) => void
    label: string
    disabled?: boolean
    className?: string | undefined
  }): ReactElement

  /** 镜像 ui-primitives/src/Tag.tsx 的色调面(dsh-v0.2.2-rc.1)。 */
  export type TagTone = 'outline' | 'solid' | 'neutral' | 'quiet' | 'success' | 'info' | 'warning' | 'danger'

  /** 镜像 ui-primitives/src/Tag.tsx 的 props 面:只读胶囊,不收 onClick/active。 */
  export function Tag(props: {
    tone?: TagTone
    className?: string | undefined
    children?: ReactNode
  }): ReactElement
}

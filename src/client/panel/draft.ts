/** 面板草稿的派生:把快照里的 profiles 深拷贝成可编辑草稿。
 *
 * 旧 Host 的档位没有 `baseline`,只有顶层 `baseline`。这里必须用顶层值兜底,
 * 不能用模板默认值(三段全开):否则升级后首次打开会把用户已关闭的开关显示成开启。
 */
import { BASELINE_DEFAULTS } from '../../baseline.ts'
import type { BaselineState, Profile, Snapshot } from '../contract/types.ts'

export interface PanelDraft {
  profiles: Profile[]
  lastUsedId: string
}

export const DEFAULT_BASELINE: BaselineState = { ...BASELINE_DEFAULTS, customText: '' }

export function draftOf(value: Snapshot): PanelDraft {
  const fallback = value.baseline ?? DEFAULT_BASELINE
  return JSON.parse(JSON.stringify({
    profiles: value.profiles.map((profile) => ({
      ...profile,
      baseline: profile.baseline ?? fallback,
    })),
    lastUsedId: value.lastUsedId,
  }))
}

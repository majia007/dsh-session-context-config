/** 系统提示词卡与基线卡:档位的 prompt/通道开关 + 与档位无关的基线开关。 */
import { type ReactElement } from 'react';
import type { Profile } from '../contract/types.ts';
type Patch = (mutate: (target: Profile) => void) => void;
export declare function SystemPromptCard({ profile, patch }: {
    profile: Profile;
    patch: Patch;
}): ReactElement;
export interface PanelDraft {
    profiles: Profile[];
    lastUsedId: string;
    baseline: Record<string, boolean>;
}
/** 基线是插件级开关(与档位无关),所以改的是 draft.baseline 而不是某个档位。 */
export declare function BaselineCard({ draft, patchBaseline }: {
    draft: PanelDraft;
    patchBaseline(key: string, value: boolean): void;
}): ReactElement;
export {};

/** 配置卡片:按最终请求里的消息分卡;system 卡内每段单独开关。 */
import { type ReactElement } from 'react';
import type { Profile, Snapshot } from '../contract/types.ts';
import { type ChannelCardOption } from './options.ts';
type Patch = (mutate: (target: Profile) => void) => void;
export interface PanelDraft {
    profiles: Profile[];
    lastUsedId: string;
    baseline: Record<string, boolean>;
}
type SectionEntry = Snapshot['sections'][number];
/** 分区小标题 + 说明 + 分割线:用于区分本插件附加内容与工具目录。 */
export declare function SectionHeading({ title, desc }: {
    title: string;
    desc: string;
}): ReactElement;
export declare function SystemMessageCard({ profile, draft, patch, patchBaseline, sections }: {
    profile: Profile;
    draft: PanelDraft;
    patch: Patch;
    patchBaseline(key: string, value: boolean): void;
    sections: SectionEntry[];
}): ReactElement;
export declare function SnapshotCard({ profile, patch }: {
    profile: Profile;
    patch: Patch;
}): ReactElement;
export declare function ChannelCard({ profile, patch, option }: {
    profile: Profile;
    patch: Patch;
    option: ChannelCardOption;
}): ReactElement;
export {};

/** 预览浮层:各 agent preset 下这套档位的注入/延迟/隐藏统计。 */
import { type ReactElement } from 'react';
import type { Profile, Snapshot } from '../contract/types.ts';
export declare function PreviewDialog({ profile, snapshot, onClose }: {
    profile: Profile;
    snapshot: Snapshot;
    onClose(): void;
}): ReactElement;

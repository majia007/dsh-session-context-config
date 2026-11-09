/** 工具行与目录摘要输入(组卡片的行级构件)。 */
import { type ReactElement } from 'react';
import type { CatalogTool, Profile } from '../contract/types.ts';
type Patch = (mutate: (target: Profile) => void) => void;
export declare function toolRow(tool: CatalogTool, profile: Profile, setToolState: (toolName: string, state: string) => void): ReactElement;
/** 目录摘要输入:summaryKey 命中时显示,值写进 profile.summaries。 */
export declare function summaryInput(key: string, hint: string, profile: Profile, summaryKey: string | null, patch: Patch): ReactElement | null;
/** 组头部的状态徽标说明(server 生效状态被组改写时的「→开启」小列)。 */
export declare function shiftBadge(serverEffective: string, serverState: string): ReactElement;
export {};

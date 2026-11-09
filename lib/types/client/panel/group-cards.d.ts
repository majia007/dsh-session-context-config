/** 工具行(组卡片的行级构件)。 */
import { type ReactElement } from 'react';
import type { CatalogTool, Profile } from '../contract/types.ts';
/** 每个工具都贴最终生效状态;被组/server 改写时补一条 tooltip 说明本行选择。 */
export declare function stateTag(effectiveState: string, rowState: string): ReactElement;
export declare function toolRow(tool: CatalogTool, profile: Profile, setToolState: (toolName: string, state: string) => void): ReactElement;

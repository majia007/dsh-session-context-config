/**
 * 会话头部的紧凑 chip:注入计数 + 全量工具状态清单 + 切换确认块。
 * 工具状态在挂载与每次打开时各取一次,保证清单最新。
 */
import { type ReactElement } from 'react';
import { type ChipProps } from './picker.ts';
export declare function SessionChip(props: ChipProps): ReactElement | null;

/** 触发器与菜单行:新会话行用整尺寸 seat;会话头部用 compact(与宿主「模式」静态标签同字号/同色)。 */
import { type ReactElement } from 'react';
export declare function Seat({ anchorRef, open, onClick, title, label, count, compact }: {
    anchorRef: {
        current: HTMLElement | null;
    };
    open: boolean;
    onClick(): void;
    title: string;
    label: string;
    count?: number | null;
    compact?: boolean;
}): ReactElement;
export declare function MenuRow({ selected, onClick, name, desc, count }: {
    selected: boolean;
    onClick(): void;
    name: string;
    desc?: string;
    count?: number | null;
}): ReactElement;

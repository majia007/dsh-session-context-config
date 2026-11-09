/** 锚定浮层:portal 到 body,先量后放(同值 bail),下方放不下翻到触发器上方。 */
import { type ReactElement, type ReactNode } from 'react';
export declare function Popover({ anchor, onClose, label, children }: {
    anchor: {
        current: HTMLElement | null;
    };
    onClose(): void;
    label: string;
    children?: ReactNode;
}): ReactElement;

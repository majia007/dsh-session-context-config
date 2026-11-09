/** 表单控件:复选行。分段选择改用宿主 ui-primitives 的 SegmentedControl(类型面见 src/ambient.d.ts)。 */
import { type ReactElement } from 'react';
/** 复选行:label 包住 input,点文字就能切换,键盘/读屏语义来自原生控件。 */
export declare function CheckRow({ checked, onChange, label, desc }: {
    checked: boolean;
    onChange(checked: boolean): void;
    label: string;
    desc?: string;
}): ReactElement;

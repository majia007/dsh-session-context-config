/** 表单控件:分段选择与复选行。原生控件藏在 label 里,键盘/读屏语义沿用原生。 */
import { type ReactElement } from 'react';
export type ChoiceOption = [id: string, text: string, tone: string | undefined];
/**
 * 分段选择:原生 radio 藏在 label 里,点整段即选中,键盘方向键沿用原生
 * radiogroup 行为。外观照 DSH SegmentedControl:浅色轨道 + 浮起的白色选中片。
 */
export declare function Choice({ value, options, onChange, name, label, small }: {
    value: string;
    options: ChoiceOption[];
    onChange(id: string): void;
    name: string;
    label: string;
    small?: boolean;
}): ReactElement;
/** 复选行:label 包住 input,点文字就能切换,键盘/读屏语义来自原生控件。 */
export declare function CheckRow({ checked, onChange, label, desc }: {
    checked: boolean;
    onChange(checked: boolean): void;
    label: string;
    desc?: string;
}): ReactElement;

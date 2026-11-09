/** 表单控件:分段选择与复选行。原生控件藏在 label 里,键盘/读屏语义沿用原生。 */
import { createElement as h } from 'react';
import styles from './menu.module.css';
/**
 * 分段选择:原生 radio 藏在 label 里,点整段即选中,键盘方向键沿用原生
 * radiogroup 行为。外观照 DSH SegmentedControl:浅色轨道 + 浮起的白色选中片。
 */
export function Choice({ value, options, onChange, name, label, small }) {
    return h('div', { className: `${styles.choice}${small ? ` ${styles.choiceSm}` : ''}`, role: 'radiogroup', 'aria-label': label }, ...options.map(([id, text, tone]) => h('label', { key: id, className: styles.choiceOpt, 'data-on': value === id ? '1' : '0', 'data-tone': tone || undefined }, h('input', {
        className: styles.choiceInput,
        type: 'radio',
        name,
        checked: value === id,
        onChange: () => onChange(id),
    }), h('span', null, text))));
}
/** 复选行:label 包住 input,点文字就能切换,键盘/读屏语义来自原生控件。 */
export function CheckRow({ checked, onChange, label, desc }) {
    return h('label', { className: styles.check }, h('input', { type: 'checkbox', checked, onChange: (event) => onChange(event.target.checked) }), h('span', { className: styles.checkBody }, h('span', { className: styles.checkLabel }, label), desc ? h('span', { className: styles.checkDesc }, desc) : null));
}

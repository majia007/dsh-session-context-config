/** 工具说明单元格:默认显示中文,可切回原文。未知描述自动按需翻译(带 loading 与失败重试)。 */
import { createElement as h, useCallback, useEffect, useState } from 'react';
import { builtinTranslation } from "./translations.js";
import { readToolLang, translateToolText, writeToolLang } from "./tool-language.js";
import styles from './panel.module.css';
export function ToolDescription({ name, text }) {
    const [lang, setLang] = useState(() => readToolLang(name));
    const [translation, setTranslation] = useState(null);
    const [busy, setBusy] = useState(false);
    const [failed, setFailed] = useState(false);
    const builtin = builtinTranslation(text);
    const cached = translation !== null && translation.src === text ? translation.text : null;
    const zh = cached ?? builtin;
    const showing = lang === 'zh' && zh !== null ? zh : text;
    const ensure = useCallback(async () => {
        if (zh !== null)
            return;
        setBusy(true);
        setFailed(false);
        try {
            const value = await translateToolText(text);
            setTranslation({ src: text, text: value });
        }
        catch {
            setFailed(true);
        }
        finally {
            setBusy(false);
        }
    }, [text, zh]);
    // 默认语言是中文:没有内置译文时挂载即翻译;用户切到原文后不再自动触发。
    useEffect(() => {
        if (lang !== 'zh' || zh !== null)
            return;
        void ensure();
    }, [lang, text, zh, ensure]);
    function onClick() {
        if (lang === 'zh') {
            // 翻译失败/未完成时按钮用于重试,而不是切回原文。
            if (zh === null) {
                void ensure();
                return;
            }
            setLang('source');
            writeToolLang(name, 'source');
            return;
        }
        setLang('zh');
        writeToolLang(name, 'zh');
        if (zh === null)
            void ensure();
    }
    return h('span', { className: styles.zh }, h('span', { className: styles.zhText }, showing), h('button', {
        type: 'button',
        className: styles.trBtn,
        'data-busy': busy ? '1' : undefined,
        disabled: busy,
        title: lang === 'zh' ? '显示原文' : '翻译为中文',
        'aria-label': lang === 'zh' ? '显示原文' : '翻译为中文',
        onClick,
    }, busy ? '翻译中…' : '文A'), failed ? h('span', { className: styles.trErr, title: '翻译失败，可再点一次重试' }, '翻译失败') : null);
}

/** 工具说明的显示语言偏好(按工具名记住,默认中文)与翻译请求队列。 */
import { request } from "../state/store.js";
const API_TRANSLATE = '/session-context-config/api/translate';
const STORAGE_KEY = 'dsh-session-context-config:tool-lang';
function storage() {
    try {
        return typeof localStorage === 'undefined' ? null : localStorage;
    }
    catch {
        return null;
    }
}
function readAll() {
    try {
        const raw = storage()?.getItem(STORAGE_KEY);
        if (!raw)
            return {};
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object')
            return {};
        const out = {};
        for (const [name, value] of Object.entries(parsed)) {
            if (value === 'zh' || value === 'source')
                out[name] = value;
        }
        return out;
    }
    catch {
        return {};
    }
}
/** 默认显示翻译;用户点「文A」切回原文后记住该工具的选择。 */
export function readToolLang(toolName) {
    return readAll()[toolName] ?? 'zh';
}
export function writeToolLang(toolName, lang) {
    try {
        const all = readAll();
        all[toolName] = lang;
        storage()?.setItem(STORAGE_KEY, JSON.stringify(all));
    }
    catch {
        /* 存储不可用时只影响记忆,不影响本次显示 */
    }
}
const translated = new Map();
let queue = Promise.resolve();
/**
 * 翻译一段描述:进程内先查内存,再串行走 Host(避免面板里几十个未知工具同时打模型)。
 * 文本是 key:同一段文本只翻一次,文本变了自然 miss。
 */
export function translateToolText(text) {
    const hit = translated.get(text);
    if (hit !== undefined)
        return Promise.resolve(hit);
    const job = queue.then(async () => {
        const again = translated.get(text);
        if (again !== undefined)
            return again;
        const result = await request(API_TRANSLATE, { method: 'POST', body: JSON.stringify({ text }) });
        if (typeof result.zh !== 'string' || result.zh.length === 0)
            throw new Error('翻译失败');
        translated.set(text, result.zh);
        return result.zh;
    });
    queue = job.catch(() => undefined);
    return job;
}

/**
 * 工具说明的按需翻译(只给配置面板显示用,不碰模型侧的工具 schema)。
 *
 * 缓存按**原始文本**做 key:同一段描述只翻一次;插件/工具升级后描述文本变了自然
 * 落到新 key,旧译文不会被误用。缓存落在 $DSH_HOME 下的独立文件,与档位状态解耦。
 *
 * 模型走宿主已配置的默认模型:agentDefaultModel.currentSelection() → llm.prepareCall,
 * 与 dsh-web-extract 同一条链路;没有默认模型时静默失败,面板保持英文。
 */
import { join } from 'node:path';
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homeDirectory } from "./state.js";
const CACHE_VERSION = 1;
const MAX_ENTRIES = 500;
const MAX_SOURCE_CHARS = 8000;
const MAX_OUTPUT_TOKENS = 800;
const SYSTEM_PROMPT = [
    '你是翻译器。把用户给出的工具描述翻译成简体中文。',
    '保留工具名、参数名、代码标识符、URL、产品名与专有名词，不要添加解释，不要改写语义。',
    '只输出译文。',
].join('\n');
export function translationsPath() {
    return join(homeDirectory(), 'session-context-config-translations.json');
}
export function createTranslationRuntime(ctx, note) {
    const cache = new Map();
    const inflight = new Map();
    let loaded = false;
    let dirty = false;
    function load() {
        if (loaded)
            return;
        loaded = true;
        try {
            const parsed = JSON.parse(readFileSync(translationsPath(), 'utf8'));
            if (parsed?.version !== CACHE_VERSION || !Array.isArray(parsed.entries))
                return;
            for (const entry of parsed.entries) {
                if (!entry || typeof entry.src !== 'string' || typeof entry.zh !== 'string' || !entry.src || !entry.zh)
                    continue;
                cache.set(entry.src, entry.zh);
            }
        }
        catch (error) {
            const code = error?.code;
            if (code !== 'ENOENT')
                note('translations', error);
        }
    }
    function persist() {
        if (!dirty)
            return;
        dirty = false;
        try {
            const entries = [...cache.entries()].slice(-MAX_ENTRIES).map(([src, zh], index) => ({ src, zh, at: index }));
            const body = JSON.stringify({ version: CACHE_VERSION, entries });
            const path = translationsPath();
            const temp = `${path}.tmp`;
            writeFileSync(temp, body, 'utf8');
            renameSync(temp, path);
        }
        catch (error) {
            note('translations', error);
        }
    }
    function readModel() {
        try {
            const selection = ctx.get('agentDefaultModel')?.currentSelection?.();
            if (!selection || typeof selection !== 'object')
                return null;
            const record = selection;
            if (typeof record.provider !== 'string' || !record.provider)
                return null;
            if (typeof record.model !== 'string' || !record.model)
                return null;
            return { provider: record.provider, model: record.model };
        }
        catch (error) {
            note('translations:model', error);
            return null;
        }
    }
    async function callModel(text, signal) {
        const model = readModel();
        if (!model)
            throw new Error('未配置默认模型，无法自动翻译');
        const llm = (() => {
            try {
                return ctx.get('llm');
            }
            catch {
                return undefined;
            }
        })();
        if (typeof llm?.prepareCall !== 'function')
            throw new Error('llm 服务不可用');
        const prepared = await llm.prepareCall({ provider: model.provider, model: model.model, maxTokens: MAX_OUTPUT_TOKENS }, signal);
        if (!prepared || typeof prepared.stream !== 'function' || !prepared.config)
            throw new Error('llm.prepareCall 返回结构无效');
        let output = '';
        for await (const chunk of prepared.stream({
            ...prepared.config,
            messages: [{ role: 'user', content: [{ type: 'text', text }] }],
            system: SYSTEM_PROMPT,
            signal,
        })) {
            const typed = chunk;
            if (typed?.type === 'text-delta')
                output += String(typed.text ?? '');
        }
        const zh = output.trim().replace(/^```(?:json|text)?\s*/i, '').replace(/\s*```$/, '');
        if (!zh)
            throw new Error('翻译模型没有返回文本');
        return zh;
    }
    async function translate(text, signal) {
        load();
        const source = text.trim();
        if (!source)
            throw new Error('文本为空');
        if (source.length > MAX_SOURCE_CHARS)
            throw new Error('文本过长，无法翻译');
        const hit = cache.get(source);
        if (hit)
            return hit;
        const running = inflight.get(source);
        if (running)
            return running;
        const job = callModel(source, signal).then((zh) => {
            cache.set(source, zh);
            dirty = true;
            persist();
            return zh;
        }).finally(() => {
            inflight.delete(source);
        });
        inflight.set(source, job);
        return job;
    }
    return {
        lookup(text) {
            load();
            return cache.get(text.trim()) ?? null;
        },
        translate,
        dispose() {
            persist();
        },
    };
}

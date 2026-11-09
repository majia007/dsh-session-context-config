import { GROUPS, TOKEN_PER_CHAR } from "./constants.js";
import { groupOf, serverOf } from "./tools.js";
/** 目录构建:枚举 agent preset 组合的工具表,15 秒缓存。 */
export function createCatalog(ctx, note) {
    let catalogCache = null;
    function toolEntry(schema) {
        const parameters = schema.parameters ? JSON.stringify(schema.parameters) : '';
        const chars = String(schema.name ?? '').length + String(schema.description ?? '').length + parameters.length;
        return {
            name: schema.name,
            description: String(schema.description ?? '').slice(0, 240),
            group: groupOf(String(schema.name ?? '')),
            server: serverOf(String(schema.name ?? '')),
            chars,
            tokens: Math.max(1, Math.round(chars * TOKEN_PER_CHAR)),
            modes: [],
        };
    }
    async function buildCatalog() {
        const now = Date.now();
        if (catalogCache && now - catalogCache.at < 15000)
            return catalogCache.value;
        const presets = [];
        let defaultPreset = 'standard';
        const registry = ctx.get('agentPresets');
        try {
            const registryConfig = ctx.get('agentPresetRegistry');
            if (registryConfig?.config?.default)
                defaultPreset = registryConfig.config.default;
        }
        catch {
            /* 老宿主没有这个服务 */
        }
        try {
            const list = registry?.list ? await registry.list() : [];
            for (const preset of list) {
                let tools = [];
                try {
                    if (!registry?.acquireScope)
                        throw new Error('agentPresets.acquireScope 不可用');
                    // 必须作为方法调用：宿主实现内部要用 this.retain，解构成局部函数后 receiver 丢失。
                    const lease = await registry.acquireScope(preset.id);
                    try {
                        tools = ctx.tools.schemas(lease.key).map(toolEntry);
                    }
                    finally {
                        // 当前宿主用 Symbol.asyncDispose 释放租约；旧宿主可能给 dispose()，两个都兜住。
                        const asyncDispose = lease[Symbol.asyncDispose];
                        if (typeof asyncDispose === 'function')
                            await asyncDispose.call(lease);
                        else
                            await lease.dispose?.();
                    }
                }
                catch (error) {
                    note(`catalog:${preset.id}`, error);
                }
                tools.sort((a, b) => a.name.localeCompare(b.name));
                presets.push({ id: preset.id, name: preset.name || preset.id, tools });
            }
        }
        catch (error) {
            note('catalog', error);
        }
        const union = new Map();
        for (const preset of presets) {
            for (const tool of preset.tools) {
                if (!union.has(tool.name))
                    union.set(tool.name, { ...tool, modes: [] });
                union.get(tool.name).modes.push(preset.id);
            }
        }
        if (!presets.some((preset) => preset.id === defaultPreset))
            defaultPreset = presets[0]?.id ?? '';
        const value = {
            presets,
            defaultPreset,
            tools: [...union.values()].sort((a, b) => a.name.localeCompare(b.name)),
            groups: GROUPS.map(({ id, title }) => ({ id, title })),
        };
        catalogCache = { at: now, value };
        return value;
    }
    /** 状态变更后让下一次快照重建目录(工具表可能变)。 */
    function invalidate() {
        catalogCache = null;
    }
    return { buildCatalog, invalidate };
}

import { DEFER, OFF, ON } from "./constants.js";
import { effectiveState, placehold, serverOf, summaryFor, groupOf } from "./tools.js";
import { composeCompletePrompt } from "../baseline.js";
const PERSONA_SECTION = 'deployment:persona-prefix';
const PERSONA_ORDER_NAME = 'DEPLOYMENT_PERSONA_PREFIX';
export function createProfileRuntime(ctx, store, kit, note, composeBaseline) {
    const applied = new Map();
    const loadedByAgent = new WeakMap();
    let toolSearchDispose = null;
    let applying = 0;
    function profileById(id) {
        return store.state.profiles.find((profile) => profile.id === id) ?? null;
    }
    function planFor(profile, definitions, extraNames, previousOriginals) {
        const byName = new Map(definitions.map((definition) => [definition.name, definition]));
        const names = new Set([...byName.keys()]);
        if (extraNames)
            for (const name of extraNames)
                names.add(name);
        const hidden = [];
        const deferred = new Map();
        const originals = new Map();
        for (const name of names) {
            const stateOfTool = effectiveState(profile, name);
            if (stateOfTool === OFF) {
                hidden.push(name);
            }
            else if (stateOfTool === DEFER) {
                const definition = byName.get(name);
                deferred.set(name, summaryFor(profile, name, definition?.description));
                const previous = previousOriginals?.get(name);
                originals.set(name, previous ?? {
                    name,
                    description: definition?.description ?? '',
                    parameters: definition?.parameters ?? { type: 'object', properties: {} },
                });
            }
        }
        return { hidden, deferred, originals };
    }
    function applyTo(agent, profileId) {
        const sessionId = kit.sessionIdOf(agent);
        const previousOriginals = sessionId ? applied.get(sessionId)?.plan?.originals : undefined;
        release(agent);
        applying += 1;
        try {
            const profile = profileId === 'none' ? null : profileById(profileId);
            const agentCtx = agent.ctx;
            if (!agentCtx)
                throw new Error('agent 没有可用的 ctx');
            const definitions = kit.definitionsOf(agent);
            const extraNames = (() => {
                try {
                    return [...(ctx.tools.view(agent)?.restrictableNames ?? [])];
                }
                catch {
                    return [];
                }
            })();
            const byName = new Map(definitions.map((definition) => [definition.name, definition]));
            const plan = profile
                ? planFor(profile, definitions, extraNames, previousOriginals)
                : { hidden: [], deferred: new Map(), originals: new Map() };
            const disposers = [];
            if (plan.hidden.length > 0) {
                disposers.push(agentCtx.tools.restrict({ deny: plan.hidden }));
            }
            // 延迟:在 agent 作用域重新注册一份瘦身定义,遮住继承来的完整定义。
            // tools 数组本身在整个会话里保持这套占位,加载只往历史里追加完整定义。
            for (const [toolName, summary] of plan.deferred) {
                const original = byName.get(toolName) ?? previousOriginals?.get(toolName);
                if (!original)
                    continue;
                try {
                    disposers.push(agentCtx.tools.register({
                        ...original,
                        ...placehold(original, summary),
                    }));
                }
                catch (error) {
                    note(`defer:${toolName}`, error);
                }
            }
            if (profile) {
                // replace/complete 一律注册,空文本是有效配置:complete+空 = developer 提示词
                // 清空(renderPrompt 丢弃空段,complete 段落成为唯一 section);replace+空 =
                // 只清掉部署 persona 前缀。此前空文本被静默跳过,档位形同 inherit。
                if (profile.prompt.mode === 'replace' || profile.prompt.mode === 'complete') {
                    const section = {
                        name: PERSONA_SECTION,
                        order: agentCtx.systemPrompt.getSectionOrder(PERSONA_ORDER_NAME),
                        // complete 段会成为唯一的 prompt 段,全局基线段在那时全部失效;
                        // 只有在这里并进去,才能保证「任何新会话都含行为契约」。
                        text: profile.prompt.mode === 'complete'
                            ? composeBaseline(profile.prompt.text)
                            : profile.prompt.text,
                        interpolate: false,
                    };
                    if (profile.prompt.mode === 'complete')
                        section.complete = true;
                    disposers.push(agentCtx.systemPrompt.section(section));
                }
                if (profile.runtimeContext === false) {
                    disposers.push(agentCtx.systemPrompt.suppressRuntimeContext());
                }
            }
            applied.set(sessionId, {
                profileId,
                plan,
                agent,
                dispose: () => {
                    for (const dispose of disposers.reverse()) {
                        try {
                            dispose();
                        }
                        catch (error) {
                            note('dispose', error);
                        }
                    }
                },
            });
            syncToolSearch();
            return plan;
        }
        finally {
            applying -= 1;
        }
    }
    function release(agent) {
        const sessionId = kit.sessionIdOf(agent);
        const entry = sessionId ? applied.get(sessionId) : undefined;
        if (!entry)
            return;
        try {
            entry.dispose();
        }
        catch (error) {
            note('release', error);
        }
        applied.delete(sessionId);
        syncToolSearch();
    }
    function planOf(agent) {
        const sessionId = kit.sessionIdOf(agent);
        const entry = sessionId ? applied.get(sessionId) : undefined;
        if (entry)
            return entry;
        const recorded = sessionId ? store.state.sessions[sessionId] : undefined;
        if (!recorded)
            return null;
        const profile = recorded === 'none' ? null : profileById(recorded);
        if (recorded !== 'none' && !profile)
            return null;
        return {
            profileId: recorded,
            plan: profile
                ? planFor(profile, kit.definitionsOf(agent))
                : { hidden: [], deferred: new Map(), originals: new Map() },
        };
    }
    function deferredFor(agent) {
        const entry = planOf(agent);
        if (!entry)
            return new Map();
        return entry.plan.deferred;
    }
    function originalsFor(agent) {
        const entry = planOf(agent);
        return entry?.plan?.originals ?? new Map();
    }
    function loadedFor(agent) {
        let set = loadedByAgent.get(agent);
        if (!set) {
            set = new Set();
            loadedByAgent.set(agent, set);
        }
        return set;
    }
    function loadedNamesOf(agent) {
        return loadedByAgent.get(agent) ?? new Set();
    }
    function syncToolSearch() {
        let wanted = false;
        for (const entry of applied.values())
            if (entry.plan.deferred.size > 0)
                wanted = true;
        if (wanted && toolSearchDispose === null) {
            toolSearchDispose = ctx.tools.register(searchTool);
        }
        else if (!wanted && toolSearchDispose !== null) {
            toolSearchDispose();
            toolSearchDispose = null;
        }
    }
    const searchTool = {
        name: 'tool_search',
        description: '取回被延迟加载的工具定义。工具表里名称一直在，但参数只给了骨架；用这个工具按组名、server 名、工具名或几个关键词取回完整定义，取回后按完整参数调用即可。不执行任何工具。',
        parameters: {
            type: 'object',
            additionalProperties: false,
            properties: {
                query: { type: 'string', description: '组名、server 名、工具名，或几个描述能力的关键词' },
            },
            required: ['query'],
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    matched: { type: 'array', items: { type: 'string' } },
                    definitions: { type: 'string' },
                    message: { type: 'string' },
                },
                required: ['matched', 'definitions', 'message'],
            },
            render: (_args, value) => [{ type: 'text', text: value.definitions || value.message }],
        },
        isConcurrencySafe: () => true,
        async execute(args, exec) {
            const agent = exec?.agent;
            if (!agent)
                throw new Error('tool_search 需要一个会话');
            const deferred = deferredFor(agent);
            if (deferred.size === 0) {
                return { matched: [], definitions: '', message: '当前没有延迟加载的工具。' };
            }
            const query = String(args?.query ?? '').trim();
            const terms = query.toLowerCase().split(/[\s,，、]+/).filter(Boolean);
            const names = [...deferred.keys()];
            let matched = names;
            if (query && !/^(all|\*|全部)$/i.test(query)) {
                const exact = names.filter((toolName) => toolName.toLowerCase() === query.toLowerCase());
                if (exact.length > 0)
                    matched = exact;
                else {
                    const groups = new Set();
                    for (const toolName of names) {
                        const server = serverOf(toolName);
                        const group = groupOf(toolName);
                        if (server && server.toLowerCase().includes(query.toLowerCase()))
                            groups.add(server);
                        if (group.toLowerCase() === query.toLowerCase())
                            groups.add(group);
                    }
                    matched = names.filter((toolName) => {
                        const haystack = `${toolName} ${deferred.get(toolName) ?? ''}`.toLowerCase();
                        if (terms.some((term) => haystack.includes(term)))
                            return true;
                        const server = serverOf(toolName);
                        return server ? groups.has(server) || groups.has(groupOf(toolName)) : groups.has(groupOf(toolName));
                    });
                }
            }
            if (matched.length === 0) {
                return {
                    matched: [],
                    definitions: '',
                    message: `没有命中「${query}」。当前延迟的工具：${names.join(', ')}。`,
                };
            }
            const originals = originalsFor(agent);
            const loaded = loadedFor(agent);
            for (const name of matched)
                loaded.add(name);
            const definitions = matched.map((name) => {
                const original = originals.get(name);
                if (!original)
                    return { name, description: deferred.get(name) ?? '', parameters: {} };
                return { name, description: original.description, parameters: original.parameters };
            });
            return {
                matched,
                definitions: JSON.stringify(definitions, null, 2),
                message: `已取回 ${matched.length} 个工具的完整定义。`,
            };
        },
    };
    function dispose() {
        if (toolSearchDispose) {
            toolSearchDispose();
            toolSearchDispose = null;
        }
        for (const entry of applied.values()) {
            try {
                entry.dispose();
            }
            catch (error) {
                note('teardown', error);
            }
        }
        applied.clear();
    }
    return {
        profileById,
        planFor,
        applyTo,
        release,
        planOf,
        deferredFor,
        originalsFor,
        loadedNamesOf,
        searchTool,
        syncToolSearch,
        applied,
        get isApplying() {
            return applying > 0;
        },
        dispose,
    };
}

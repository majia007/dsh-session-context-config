/**
 * 上下文档位 · Host(v0.2)——插件面与装配。
 *
 * 模型:档位持有一份「组 / server / 工具」三级状态表,应用时解析成每个工具的三态:
 *   注入(on) / 延迟(defer) / 隐藏(off)
 *
 * - 隐藏:`agent.ctx.tools.restrict({ deny })`,不发 schema、也调不到。
 * - 延迟:不删除工具,只在系统提示装配时把它的 description 换成一句功能摘要、
 *   parameters 剥成骨架;完整定义由 `tool_search` 以工具结果的形式追加进历史。
 *   tools 数组在整个会话里保持不变,因此前缀缓存不会被加载动作打断。
 *
 * 只作用于根会话;已开始的会话只有在用户确认切换档位时才会重算。
 *
 * 结构:基线层(baseline)、常量/状态/解析(host/constants|state|tools)、
 * 状态存取(state-store)、会话工具(sessions)、档位应用(profiles)、环境事实
 * (environment)、目录(catalog)、HTTP 路由(routes)各占一个模块;本文件只做装配。
 */
import { baselineSections, composeCompletePrompt } from "./baseline.js";
import { CHANNELS, OFF } from "./host/constants.js";
import { createEnvironmentRuntime } from "./host/environment.js";
import { createProfileRuntime } from "./host/profiles.js";
import { ROUTES, createRoutes } from "./host/routes.js";
import { createSessionKit } from "./host/sessions.js";
import { messageOf } from "./host/state.js";
import { createStateStore } from "./host/state-store.js";
export const name = 'session-context-config';
export const inject = ['agents', 'tools', 'systemPrompt'];
export function apply(ctx) {
    /** 诊断:进程内环形缓冲 + console.warn。 */
    const diagnostics = [];
    const note = (source, error) => {
        diagnostics.unshift({ at: new Date().toISOString(), source, message: messageOf(error) });
        diagnostics.length = Math.min(diagnostics.length, 20);
        console.warn(`[session-context-config] ${source}: ${messageOf(error)}`);
    };
    const store = createStateStore(note);
    const kit = createSessionKit(ctx, note);
    const composeBaseline = (text) => composeCompletePrompt(text, store.state.baseline);
    const profiles = createProfileRuntime(ctx, store, kit, note, composeBaseline);
    const environment = createEnvironmentRuntime(ctx, store, kit, note);
    const routes = createRoutes({ ctx, store, kit, profiles, note, diagnostics });
    store.load();
    // 基线三段是全局段:与档位无关,每个 agent 的装配都会带上;开关关闭时段文本为空,
    // 装配层会丢弃空段。用函数读 state,所以面板改开关不需要重新注册。
    const baselineSectionDisposers = [];
    for (const section of baselineSections(() => store.state.baseline)) {
        try {
            baselineSectionDisposers.push(ctx.systemPrompt.section(section));
        }
        catch (error) {
            note('baseline section', error);
        }
    }
    // webServer 是宿主补挂的服务:插件启动时它可能还没就绪,必须用 inject 等它出现。
    ctx.inject(['webServer'], (sctx) => {
        try {
            const web = sctx.get('webServer');
            if (!web?.register) {
                note('webServer', new Error('webServer 没有 register'));
                return;
            }
            const disposers = [
                web.register({ kind: 'exact', path: ROUTES.STATE, handler: routes.handleState }),
                web.register({ kind: 'exact', path: ROUTES.SESSION, handler: routes.handleSession }),
                web.register({ kind: 'exact', path: ROUTES.PREVIEW, handler: routes.handlePreview }),
                web.register({ kind: 'exact', path: ROUTES.ASSEMBLE, handler: routes.handleAssemble }),
            ];
            sctx.effect(() => () => {
                for (const dispose of disposers) {
                    try {
                        dispose();
                    }
                    catch (error) {
                        note('route dispose', error);
                    }
                }
            }, 'session-context-config: routes');
        }
        catch (error) {
            note('webServer', error);
        }
    });
    ctx.on('agent/created', (...args) => {
        try {
            const payload = args[0];
            const agent = payload?.agent;
            environment.applyEnvironment(agent);
            if (!kit.isRootAgent(agent))
                return;
            const sessionId = kit.sessionIdOf(agent);
            if (!sessionId)
                return;
            const recorded = store.state.sessions[sessionId];
            if (recorded) {
                profiles.applyTo(agent, recorded);
                return;
            }
            if (!kit.isBlank(agent))
                return;
            profiles.applyTo(agent, store.state.lastUsedId);
            store.state.sessions[sessionId] = store.state.lastUsedId;
            store.persistSoon();
        }
        catch (error) {
            note('agent/created', error);
        }
    });
    ctx.on('agent/disposed', (...args) => {
        const payload = args[0];
        const agent = payload?.agent;
        environment.releaseEnvironment(agent);
        profiles.release(agent);
    });
    let changeTimer = null;
    ctx.on('tools/change', () => {
        if (profiles.isApplying)
            return;
        if (changeTimer)
            clearTimeout(changeTimer);
        changeTimer = setTimeout(() => {
            changeTimer = null;
            for (const entry of [...profiles.applied.values()]) {
                const agent = entry.agent;
                if (!agent)
                    continue;
                const profile = entry.profileId === 'none' ? null : profiles.profileById(entry.profileId);
                if (!profile)
                    continue;
                const extraNames = (() => {
                    try {
                        return [...(ctx.tools.view(agent)?.restrictableNames ?? [])];
                    }
                    catch {
                        return [];
                    }
                })();
                const plan = profiles.planFor(profile, kit.definitionsOf(agent), extraNames, entry.plan.originals);
                const sameHidden = plan.hidden.length === entry.plan.hidden.length &&
                    plan.hidden.every((name) => entry.plan.hidden.includes(name));
                const sameDeferred = plan.deferred.size === entry.plan.deferred.size;
                if (sameHidden && sameDeferred) {
                    entry.plan = plan;
                    continue;
                }
                try {
                    profiles.applyTo(agent, entry.profileId);
                }
                catch (error) {
                    note('tools/change', error);
                }
            }
        }, 300);
    });
    /* 通道拦截 */
    function channelsProfileOf(agent) {
        const sessionId = kit.sessionIdOf(agent);
        if (!sessionId)
            return null;
        const entry = profiles.applied.get(sessionId);
        const profileId = entry?.profileId ?? store.state.sessions[sessionId];
        if (!profileId || profileId === 'none')
            return null;
        return profiles.profileById(profileId);
    }
    // prepend 让过滤器落在最外层:time-context 同样用 prepend 的 pre-step 追加
    // 时间消息,只有包在它外面才能把它刚追加的消息一并滤掉。装载顺序上本插件
    // 在用户补丁层、晚于预设里的 time-context,prepend 后处于链头。
    ctx.on('agent/pre-step', (async (...args) => {
        const payload = args[0];
        const next = args[1];
        const decision = await next();
        if (decision.kind === 'reject' || payload.signal?.aborted || !payload.agent)
            return decision;
        const profile = channelsProfileOf(payload.agent);
        const blocked = new Set();
        for (const channel of CHANNELS) {
            if (profile?.channels?.[channel.id] === OFF)
                blocked.add(channel.source);
        }
        if (blocked.size === 0)
            return decision;
        const messages = decision.messages.filter((message) => !blocked.has(message?.source?.kind));
        return messages.length === decision.messages.length ? decision : { ...decision, messages };
    }), { prepend: true });
    // 插件重载后,已有会话的 restriction 会随旧 ctx 一起撤销,这里补一次。
    for (const agent of ctx.agents.list()) {
        try {
            environment.applyEnvironment(agent);
            if (!kit.isRootAgent(agent))
                continue;
            const sessionId = kit.sessionIdOf(agent);
            const recorded = sessionId ? store.state.sessions[sessionId] : undefined;
            if (recorded)
                profiles.applyTo(agent, recorded);
        }
        catch (error) {
            note('reapply', error);
        }
    }
    ctx.effect(() => () => {
        for (const dispose of baselineSectionDisposers) {
            try {
                dispose();
            }
            catch (error) {
                note('baseline section dispose', error);
            }
        }
        environment.dispose();
        store.flush();
        profiles.dispose();
        if (changeTimer)
            clearTimeout(changeTimer);
    }, 'session-context-config: teardown');
}

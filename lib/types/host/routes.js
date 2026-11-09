import { DEFER, OFF, ON, VERSION } from "./constants.js";
import { createCatalog } from "./catalog.js";
import { effectiveState, groupOf, serverOf } from "./tools.js";
import { messageOf, normalizeState, statePath } from "./state.js";
const PACKAGE_NAME = 'dsh-session-context-config';
const ROUTE_STATE = '/session-context-config/api/state';
const ROUTE_SESSION = '/session-context-config/api/session';
const ROUTE_PREVIEW = '/session-context-config/api/preview';
const ROUTE_ASSEMBLE = '/session-context-config/api/assemble';
function readBody(request) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        request.on('data', (chunk) => {
            size += chunk.length;
            if (size > 1_000_000) {
                reject(new Error('body too large'));
                request.destroy();
                return;
            }
            chunks.push(chunk);
        });
        request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        request.on('error', reject);
    });
}
function sendJson(response, status, value) {
    const body = JSON.stringify(value);
    response.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'content-length': Buffer.byteLength(body),
    });
    response.end(body);
}
/**
 * 回退校验(宿主没有 connection 服务时):只认回环 Host。IPv6 的 Host 是
 * “[[::1]]:port” 形态,剥端口要先找 ']',直接 split(':') 会切出 '['。
 */
function loopbackOnly(request) {
    const raw = String(request.headers.host ?? '').toLowerCase();
    const host = raw.startsWith('[') ? raw.slice(0, raw.indexOf(']') + 1) : raw.split(':')[0];
    return !raw || ['127.0.0.1', 'localhost', '[::1]', '::1'].includes(host);
}
export function createRoutes(deps) {
    const { ctx, store, kit, profiles, note, diagnostics } = deps;
    const catalog = createCatalog(ctx, note);
    /**
     * 信任栅栏:宿主 webServer 对直接 register 的路由不做任何认证,官方做法是
     * 借 connection 服务的 Host/Origin/浏览器会话检查(open-in-app 同款)。拿得到
     * 就完全以它为准(它也放行受信的非回环 Host,如 dsh web --host 局域网场景),
     * 拿不到才退回 loopbackOnly。
     */
    function guard(request, response) {
        // connection 不在 inject 名单里,不能按属性取:Cordis 对未声明服务的属性访问会直接抛
        // `cannot get property "connection" without inject`;ctx.get 在缺失时返回 undefined。
        let fence;
        try {
            fence = ctx.get('connection');
        }
        catch (error) {
            note('connection', error);
            fence = undefined;
        }
        if (typeof fence?.requestRejection === 'function') {
            const rejection = fence.requestRejection(request);
            if (rejection !== undefined) {
                sendJson(response, rejection, { ok: false, error: 'rejected' });
                return false;
            }
            return true;
        }
        if (!loopbackOnly(request)) {
            sendJson(response, 403, { ok: false, error: 'loopback only' });
            return false;
        }
        return true;
    }
    async function snapshot() {
        const catalogValue = await catalog.buildCatalog();
        const state = store.state;
        const live = [];
        for (const agent of ctx.agents.list()) {
            if (!kit.isRootAgent(agent))
                continue;
            const sessionId = kit.sessionIdOf(agent);
            const entry = sessionId ? profiles.applied.get(sessionId) : undefined;
            const session = kit.sessionOf(agent);
            let preset = null;
            try {
                preset = session ? ctx.get('agentPresets')?.presetForSession?.(session) ?? null : null;
            }
            catch {
                preset = null;
            }
            live.push({
                sessionId,
                preset,
                blank: kit.isBlank(agent),
                profileId: entry?.profileId ?? (sessionId ? state.sessions[sessionId] : undefined) ?? null,
                deferred: entry?.plan?.deferred?.size ?? 0,
                hidden: entry?.plan?.hidden?.length ?? 0,
                loaded: profiles.loadedNamesOf(agent).size,
            });
        }
        return {
            ok: true,
            version: VERSION,
            profiles: state.profiles,
            lastUsedId: state.lastUsedId,
            sessions: state.sessions,
            baseline: state.baseline,
            presets: catalogValue.presets,
            defaultPreset: catalogValue.defaultPreset,
            tools: catalogValue.tools,
            groups: catalogValue.groups,
            live,
            diagnostics: diagnostics.slice(0, 8),
            statePath: statePath(),
            clientBundle: (() => {
                try {
                    return ctx.get('clientModules')?.clientPath?.(PACKAGE_NAME) ?? null;
                }
                catch {
                    return null;
                }
            })(),
        };
    }
    function previewFor(agent, profileId) {
        const profile = profileId === 'none' ? null : profiles.profileById(profileId);
        const schemas = kit.visibleSchemas(agent);
        if (!profile) {
            return {
                ok: true,
                profileId: 'none',
                total: schemas.length,
                hidden: [],
                deferred: [],
                visible: schemas.map((schema) => schema.name),
            };
        }
        const hidden = [];
        const deferred = [];
        const visible = [];
        for (const schema of schemas) {
            const stateOfTool = effectiveState(profile, schema.name);
            if (stateOfTool === OFF)
                hidden.push(schema.name);
            else if (stateOfTool === DEFER)
                deferred.push(schema.name);
            else
                visible.push(schema.name);
        }
        return { ok: true, profileId, total: schemas.length, hidden, deferred, visible };
    }
    const handleState = async (request, response) => {
        try {
            if (!guard(request, response))
                return;
            if (request.method === 'GET')
                return sendJson(response, 200, await snapshot());
            if (request.method !== 'POST')
                return sendJson(response, 405, { ok: false, error: 'method not allowed' });
            // POST 只收 application/json(照官方 open-in-app):掐掉 text/plain 简单
            // 请求形式的跨站提交,与 guard 的信任栅栏构成双保险。
            const essence = String(request.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
            if (essence !== 'application/json') {
                return sendJson(response, 415, { ok: false, error: 'content-type must be application/json' });
            }
            const parsed = JSON.parse(await readBody(request));
            store.state = normalizeState({ ...store.state, ...parsed, version: VERSION });
            store.persistNow();
            for (const agent of ctx.agents.list()) {
                if (!kit.isRootAgent(agent) || !kit.isBlank(agent))
                    continue;
                const sessionId = kit.sessionIdOf(agent);
                if (!sessionId)
                    continue;
                const recorded = store.state.sessions[sessionId] ?? store.state.lastUsedId;
                profiles.applyTo(agent, recorded);
                store.state.sessions[sessionId] = recorded;
            }
            catalog.invalidate();
            sendJson(response, 200, { ok: true, snapshot: await snapshot() });
        }
        catch (error) {
            sendJson(response, 400, { ok: false, error: messageOf(error) });
        }
    };
    const handleSession = async (request, response) => {
        try {
            if (!guard(request, response))
                return;
            if (request.method === 'GET') {
                const url = new URL(request.url ?? '/', 'http://localhost');
                const sessionId = url.searchParams.get('id') ?? '';
                const agent = kit.agentFor(sessionId);
                if (!agent)
                    return sendJson(response, 404, { ok: false, error: 'session not live' });
                const recorded = store.state.sessions[sessionId] ?? store.state.lastUsedId;
                const entry = profiles.applied.get(sessionId);
                const deferred = entry?.plan?.deferred ?? new Map();
                const hidden = new Set(entry?.plan?.hidden ?? []);
                const loaded = profiles.loadedNamesOf(agent);
                const tools = kit.visibleSchemas(agent).map((schema) => ({
                    name: schema.name,
                    group: groupOf(schema.name),
                    server: serverOf(schema.name),
                    state: hidden.has(schema.name) ? OFF : deferred.has(schema.name) ? DEFER : ON,
                    loaded: loaded.has(schema.name),
                }));
                return sendJson(response, 200, {
                    ok: true,
                    sessionId,
                    profileId: recorded,
                    blank: kit.isBlank(agent),
                    tools,
                });
            }
            if (request.method !== 'POST')
                return sendJson(response, 405, { ok: false, error: 'method not allowed' });
            // POST 只收 application/json(照官方 open-in-app):掐掉 text/plain 简单
            // 请求形式的跨站提交,与 guard 的信任栅栏构成双保险。
            const essence = String(request.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
            if (essence !== 'application/json') {
                return sendJson(response, 415, { ok: false, error: 'content-type must be application/json' });
            }
            const parsed = JSON.parse(await readBody(request));
            const sessionId = String(parsed.sessionId ?? '');
            const profileId = parsed.profileId === 'none' ? 'none' : String(parsed.profileId ?? '');
            if (!sessionId)
                return sendJson(response, 400, { ok: false, error: 'sessionId required' });
            if (profileId !== 'none' && !profiles.profileById(profileId)) {
                return sendJson(response, 400, { ok: false, error: 'unknown profile' });
            }
            store.state.sessions[sessionId] = profileId;
            store.state.lastUsedId = profileId;
            store.persistSoon();
            const agent = kit.agentFor(sessionId);
            if (agent)
                profiles.applyTo(agent, profileId);
            sendJson(response, 200, { ok: true, snapshot: await snapshot() });
        }
        catch (error) {
            sendJson(response, 400, { ok: false, error: messageOf(error) });
        }
    };
    const handlePreview = async (request, response) => {
        try {
            if (!guard(request, response))
                return;
            const url = new URL(request.url ?? '/', 'http://localhost');
            const sessionId = url.searchParams.get('id') ?? '';
            const profileId = url.searchParams.get('profile') ?? '';
            const agent = sessionId ? kit.agentFor(sessionId) : ctx.agents.list().find(kit.isRootAgent) ?? null;
            if (!agent)
                return sendJson(response, 404, { ok: false, error: 'no live agent' });
            sendJson(response, 200, previewFor(agent, profileId));
        }
        catch (error) {
            sendJson(response, 400, { ok: false, error: messageOf(error) });
        }
    };
    /** 干跑一次装配,确认占位真的进入了模型看到的 schema。 */
    const handleAssemble = async (request, response) => {
        try {
            if (!guard(request, response))
                return;
            const url = new URL(request.url ?? '/', 'http://localhost');
            const sessionId = url.searchParams.get('id') ?? '';
            const agent = sessionId ? kit.agentFor(sessionId) : ctx.agents.list().find(kit.isRootAgent) ?? null;
            if (!agent)
                return sendJson(response, 404, { ok: false, error: 'no live agent' });
            const assembly = await ctx.systemPrompt.assemble({ agent, scope: agent });
            const tools = (assembly.tools ?? []);
            // 段/上下文的名单与体量:面板与验收都靠它确认基线段真的进了装配,而不是只写在状态里。
            const sections = (assembly.sections ?? []).map((section) => ({
                name: section.name,
                chars: String(section.text ?? '').length,
            }));
            const contexts = (assembly.contexts ?? []).map((contextEntry) => ({
                name: contextEntry.name,
                chars: String(contextEntry.text ?? '').length,
            }));
            const deferred = profiles.planOf(agent)?.plan?.deferred ?? new Map();
            const sample = tools
                .filter((tool) => deferred.has(tool.name))
                .slice(0, 2)
                .map((tool) => ({
                name: tool.name,
                description: tool.description,
                parameters: tool.parameters,
                chars: JSON.stringify(tool).length,
            }));
            const entry = profiles.planOf(agent);
            const deferredMap = entry?.plan?.deferred ?? new Map();
            const originalChars = [...(entry?.plan?.originals?.values() ?? [])]
                .reduce((sum, original) => sum + JSON.stringify(original).length, 0);
            const placeholderChars = tools
                .filter((tool) => deferredMap.has(tool.name))
                .reduce((sum, tool) => sum + JSON.stringify(tool).length, 0);
            sendJson(response, 200, {
                ok: true,
                count: tools.length,
                deferred: deferred.size,
                totals: { original: originalChars, placeholder: placeholderChars },
                sections,
                contexts,
                sample,
            });
        }
        catch (error) {
            sendJson(response, 400, { ok: false, error: messageOf(error) });
        }
    };
    return { snapshot, previewFor, handleState, handleSession, handlePreview, handleAssemble };
}
export const ROUTES = { STATE: ROUTE_STATE, SESSION: ROUTE_SESSION, PREVIEW: ROUTE_PREVIEW, ASSEMBLE: ROUTE_ASSEMBLE };

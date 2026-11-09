import { ENVIRONMENT_CONTEXT, ENVIRONMENT_CONTEXT_ORDER } from "./constants.js";
import { environmentFactsText, probeEnvironment } from "./environment-facts.js";
export function createEnvironmentRuntime(ctx, kit, note) {
    const envApplied = new Map();
    function applyEnvironment(agent) {
        const sessionId = kit.sessionIdOf(agent);
        if (!sessionId || envApplied.has(sessionId))
            return;
        if (!agent?.ctx?.systemPrompt?.context)
            return;
        try {
            const session = kit.sessionOf(agent);
            const cwd = typeof session?.header?.cwd === 'string' ? session.header.cwd : undefined;
            const names = new Set(kit.visibleSchemas(agent).map((schema) => schema.name));
            const shellTool = names.has('pwsh') ? 'pwsh' : names.has('bash') ? 'bash' : null;
            const facts = probeEnvironment({ cwd, shellTool });
            const text = environmentFactsText(facts);
            const dispose = agent.ctx.systemPrompt.context({
                name: ENVIRONMENT_CONTEXT,
                order: ENVIRONMENT_CONTEXT_ORDER,
                interpolate: false,
                text: () => text,
            });
            envApplied.set(sessionId, { dispose: dispose, facts });
        }
        catch (error) {
            note('environment', error);
        }
    }
    function releaseEnvironment(agent) {
        const sessionId = kit.sessionIdOf(agent);
        const entry = sessionId ? envApplied.get(sessionId) : null;
        if (!entry)
            return;
        envApplied.delete(sessionId);
        try {
            entry.dispose();
        }
        catch (error) {
            note('environment dispose', error);
        }
    }
    function dispose() {
        for (const entry of envApplied.values()) {
            try {
                entry.dispose();
            }
            catch (error) {
                note('environment dispose', error);
            }
        }
        envApplied.clear();
    }
    return { applyEnvironment, releaseEnvironment, dispose };
}

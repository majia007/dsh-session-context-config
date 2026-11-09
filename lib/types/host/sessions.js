export function createSessionKit(ctx, note) {
    function sessionOf(agent) {
        const direct = agent?.session;
        if (direct && typeof direct === 'object' && typeof direct.id === 'string')
            return direct;
        const sessionId = agent?.sessionId ?? direct?.id;
        if (!sessionId)
            return null;
        try {
            return ctx.get('sessions')?.get?.(sessionId) ?? null;
        }
        catch (error) {
            note('sessions', error);
            return null;
        }
    }
    function sessionIdOf(agent) {
        const id = agent?.sessionId ?? agent?.session?.id ?? agent?.session?.sessionId;
        return id != null ? String(id) : null;
    }
    function isBlank(agent) {
        const session = sessionOf(agent);
        if (!session)
            return false;
        try {
            const boundary = ctx.agents.turnBoundaryOf?.(session);
            if (boundary) {
                if (boundary.openTurnStartSeq != null)
                    return false;
                if (typeof boundary.lastTurn === 'number')
                    return boundary.lastTurn <= 0;
                return boundary.lastStepStartSeq == null;
            }
        }
        catch (error) {
            note('turnBoundaryOf', error);
        }
        return false;
    }
    function isRootAgent(agent) {
        try {
            const roots = ctx.agents.roots();
            if (!Array.isArray(roots))
                return true;
            const sessionId = sessionIdOf(agent);
            return roots.some((root) => root === agent || sessionIdOf(root) === sessionId);
        }
        catch (error) {
            note('roots', error);
            return true;
        }
    }
    function visibleSchemas(agent) {
        try {
            return ctx.tools.schemas(agent);
        }
        catch (error) {
            note('schemas', error);
            return [];
        }
    }
    function definitionsOf(agent) {
        try {
            return ctx.tools.definitions(agent);
        }
        catch (error) {
            note('definitions', error);
            return [];
        }
    }
    function agentFor(sessionId) {
        if (!sessionId)
            return null;
        for (const agent of ctx.agents.list()) {
            if (sessionIdOf(agent) === sessionId)
                return agent;
        }
        return null;
    }
    return { sessionOf, sessionIdOf, isBlank, isRootAgent, visibleSchemas, definitionsOf, agentFor };
}

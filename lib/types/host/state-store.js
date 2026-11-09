import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { defaultState, legacyStatePath, normalizeState, statePath } from "./state.js";
export function createStateStore(note) {
    let state = defaultState();
    let writeTimer = null;
    /**
     * 首次启动把旧文件名搬过来:先落新文件、再挪走旧文件。
     * 顺序保证中途失败最坏只是留下旧文件,已有档位不会丢。
     */
    function migrateLegacyState() {
        const legacy = legacyStatePath();
        try {
            const migrated = normalizeState(JSON.parse(readFileSync(legacy, 'utf8')));
            const path = statePath();
            mkdirSync(dirname(path), { recursive: true });
            writeFileSync(path, JSON.stringify(migrated, null, 2), 'utf8');
            try {
                renameSync(legacy, `${legacy}.migrated`);
            }
            catch (error) {
                note('migrate rename', error);
            }
            return migrated;
        }
        catch (error) {
            if (error?.code !== 'ENOENT')
                note('migrate', error);
            return defaultState();
        }
    }
    const store = {
        get state() {
            return state;
        },
        set state(next) {
            state = next;
        },
        load() {
            try {
                state = normalizeState(JSON.parse(readFileSync(statePath(), 'utf8')));
                return;
            }
            catch (error) {
                if (error?.code !== 'ENOENT') {
                    note('load', error);
                    state = defaultState();
                    return;
                }
            }
            state = migrateLegacyState();
        },
        persistNow() {
            try {
                const path = statePath();
                mkdirSync(dirname(path), { recursive: true });
                const temp = `${path}.tmp`;
                writeFileSync(temp, JSON.stringify(state, null, 2), 'utf8');
                renameSync(temp, path);
            }
            catch (error) {
                note('persist', error);
            }
        },
        persistSoon() {
            if (writeTimer)
                clearTimeout(writeTimer);
            writeTimer = setTimeout(() => {
                writeTimer = null;
                store.persistNow();
            }, 400);
        },
        flush() {
            if (writeTimer) {
                clearTimeout(writeTimer);
                writeTimer = null;
                store.persistNow();
            }
        },
    };
    return store;
}

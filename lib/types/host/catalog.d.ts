import type { HostContext } from '../types.ts';
export interface CatalogTool {
    name: string;
    description: string;
    group: string;
    server: string | null;
    chars: number;
    tokens: number;
    modes: string[];
}
export interface Catalog {
    presets: Array<{
        id: string;
        name: string;
        tools: CatalogTool[];
    }>;
    defaultPreset: string;
    tools: CatalogTool[];
    groups: Array<{
        id: string;
        title: string;
    }>;
}
/** 目录构建:枚举 agent preset 组合的工具表,15 秒缓存。 */
export declare function createCatalog(ctx: HostContext, note: (source: string, error: unknown) => void): {
    buildCatalog: () => Promise<Catalog>;
    invalidate: () => void;
};

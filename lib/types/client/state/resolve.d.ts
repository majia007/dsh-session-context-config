/**
 * 档位解析(与 Host 同一套规则)——跨端同规则双份的 client 侧。
 * 改这里必须同步 src/host/tools.ts 的 effectiveState,规则原文见 AGENTS.md。
 */
import type { CatalogTool, Profile, Snapshot } from '../contract/types.ts';
export declare const ON = "on";
export declare const DEFER = "defer";
export declare const OFF = "off";
export declare const FORCE = "force";
export declare const NONE = "none";
export declare const STATE_LABEL: Record<string, string>;
export declare function effective(profile: Partial<Profile>, tool: {
    name: string;
    group: string;
    server?: string | null;
}): string;
export declare function statsFor(profile: Partial<Profile>, tools: CatalogTool[], presetToolNames: Set<string> | null): {
    on: number;
    defer: number;
    off: number;
    onTokens: number;
    deferTokens: number;
};
export declare function formatTokens(value: number): string;
export declare function presetNames(snapshot: Snapshot | null, presetId: string | null | undefined): Set<string> | null;

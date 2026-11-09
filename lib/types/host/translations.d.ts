import type { HostContext } from '../types.ts';
export interface TranslationRuntime {
    lookup(text: string): string | null;
    /** 翻译一段文本;命中缓存直接返回。 */
    translate(text: string, signal?: AbortSignal): Promise<string>;
    dispose(): void;
}
export declare function translationsPath(): string;
export declare function createTranslationRuntime(ctx: HostContext, note: (source: string, error: unknown) => void): TranslationRuntime;

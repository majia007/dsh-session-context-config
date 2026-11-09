/** 浏览器 ctx 的最小面(apply 世界)。 */
interface ClientContext {
    get?(service: string): unknown;
    inject(names: string[], callback: (scoped: ClientContext) => unknown): unknown;
    effect?(fn: () => () => void, label?: string): unknown;
    slots: {
        inject(name: string, factory: () => unknown): void;
        register(options: Record<string, unknown>, component: unknown): unknown;
    };
    sessions?: {
        current?: (() => unknown) | unknown;
    };
}
export declare const inject: string[];
export declare function apply(ctx: ClientContext): void;
export {};

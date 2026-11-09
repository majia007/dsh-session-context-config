export type GitStatus = {
    kind: 'repo';
    branch: string;
    dirty: boolean;
} | {
    kind: 'none';
} | {
    kind: 'unknown';
    reason?: string;
};
export interface EnvironmentFacts {
    platform: string;
    osType: string;
    osRelease: string;
    shell: string;
    git: GitStatus;
}
type RunGit = (args: string[], cwd: string) => string;
/**
 * 一次 git status 同时拿到「是不是仓库、分支、脏不脏」。
 * 600ms 上限 + 60s 缓存:探测失败降级成 unknown,绝不阻塞会话创建。
 */
export declare function probeGit(cwd: string | undefined, runGit?: RunGit): GitStatus;
/** 测试用来清缓存,避免同一临时目录跨用例命中旧结果。 */
export declare function clearGitCache(): void;
/** 探测一次就固定:同一会话里不再 rerun,否则每次 git 变化都要重写请求前缀。 */
export declare function probeEnvironment({ cwd, shellTool, runGit }?: {
    cwd?: string;
    shellTool?: string | null;
    runGit?: RunGit;
}): EnvironmentFacts;
export declare function environmentFactsText(facts: EnvironmentFacts | null | undefined): string;
export {};

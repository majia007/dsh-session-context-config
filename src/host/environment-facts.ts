/**
 * 环境事实的探测与渲染(platform / shell / git)。
 *
 * 从 baseline.ts 拆出来:它不再是「附加规则」的一部分,而是 host/environment.ts
 * 注册的运行时上下文,由档位的 contexts 逐项开关控制。
 * 探测一次就固定,会话内不重测——文本一变宿主就会追加新快照,等于重写请求前缀。
 */
import { execFileSync } from 'node:child_process'
import { release as osRelease, type as osType } from 'node:os'

const GIT_TIMEOUT_MS = 600
const GIT_CACHE_TTL_MS = 60_000
const gitCache = new Map<string, { at: number; value: GitStatus }>()

export type GitStatus =
  | { kind: 'repo'; branch: string; dirty: boolean }
  | { kind: 'none' }
  | { kind: 'unknown'; reason?: string }

export interface EnvironmentFacts {
  platform: string
  osType: string
  osRelease: string
  shell: string
  git: GitStatus
}

type RunGit = (args: string[], cwd: string) => string

/**
 * 一次 git status 同时拿到「是不是仓库、分支、脏不脏」。
 * 600ms 上限 + 60s 缓存:探测失败降级成 unknown,绝不阻塞会话创建。
 */
export function probeGit(cwd: string | undefined, runGit: RunGit = defaultRunGit): GitStatus {
  if (!cwd) return { kind: 'unknown', reason: 'no working directory' }
  const cached = gitCache.get(cwd)
  if (cached && Date.now() - cached.at < GIT_CACHE_TTL_MS) return cached.value
  const value = readGitStatus(cwd, runGit)
  gitCache.set(cwd, { at: Date.now(), value })
  return value
}

/** 测试用来清缓存,避免同一临时目录跨用例命中旧结果。 */
export function clearGitCache() {
  gitCache.clear()
}

function defaultRunGit(args: string[], cwd: string): string {
  return execFileSync('git', args, {
    cwd,
    timeout: GIT_TIMEOUT_MS,
    encoding: 'utf8',
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

function readGitStatus(cwd: string, runGit: RunGit): GitStatus {
  let output: string
  try {
    output = runGit(['-c', 'core.quotepath=false', 'status', '--porcelain=v1', '--branch', '--untracked-files=no'], cwd)
  } catch (error) {
    const err = error as { code?: string; killed?: boolean; signal?: unknown; stderr?: string; status?: number }
    if (err?.code === 'ENOENT') return { kind: 'unknown', reason: 'git is not installed' }
    if (err?.killed || err?.code === 'ETIMEDOUT' || err?.signal) {
      return { kind: 'unknown', reason: 'git timed out' }
    }
    const stderr = String(err?.stderr ?? '')
    if (err?.status === 128 || /not a git repository/i.test(stderr)) return { kind: 'none' }
    return { kind: 'unknown', reason: 'git status failed' }
  }
  const lines = String(output ?? '').split(/\r?\n/).filter(Boolean)
  const head = lines.find((line) => line.startsWith('## ')) ?? ''
  const branch = branchOf(head)
  const dirty = lines.some((line) => !line.startsWith('## '))
  return { kind: 'repo', branch, dirty }
}

function branchOf(head: string): string {
  const rest = head.slice(3).trim()
  if (!rest) return 'unknown'
  if (rest.startsWith('HEAD (no branch)')) return 'detached'
  const noCommits = /^No commits yet on (.+)$/.exec(rest)
  if (noCommits) return noCommits[1]
  // "main...origin/main [ahead 1]" / "main" / "main...origin/main"
  return rest.split('...')[0].split(' ')[0] || 'unknown'
}

/** 探测一次就固定:同一会话里不再 rerun,否则每次 git 变化都要重写请求前缀。 */
export function probeEnvironment({ cwd, shellTool, runGit }: { cwd?: string; shellTool?: string | null; runGit?: RunGit } = {}): EnvironmentFacts {
  const shell = shellTool === 'pwsh' || shellTool === 'bash' ? shellTool : 'unknown'
  return {
    platform: process.platform,
    osType: osType(),
    osRelease: osRelease(),
    shell,
    git: probeGit(cwd, runGit),
  }
}

export function environmentFactsText(facts: EnvironmentFacts | null | undefined): string {
  if (!facts) return ''
  const lines = [
    '- platform: ' + facts.platform + ' (' + facts.osType + ' ' + facts.osRelease + ')',
    '- shell: ' + facts.shell,
    '- git: ' + describeGit(facts.git),
  ]
  return 'Environment facts for this session (probed once; they do not change):\n' + lines.join('\n')
}

function describeGit(git: GitStatus | null | undefined): string {
  if (!git) return 'unknown'
  if (git.kind === 'repo') {
    const branch = git.branch || 'unknown'
    return 'repository on branch ' + branch + ', working tree ' + (git.dirty ? 'dirty' : 'clean')
  }
  if (git.kind === 'none') return 'not a git repository'
  return 'unknown (' + (git.reason || 'probe failed') + ')'
}

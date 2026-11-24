/**
 * 已读工作区指令去重：模型用 `read` 完整读过某个 AGENTS.md 之后，宿主的
 * `agent-instructions` 仍会在下一次文件触碰时把同一份正文再注入一遍
 * （`Additional instructions from: ...`）。这里记录「本会话完整读取过的文件 +
 * 内容摘要」，在 pre-step 过滤器里剔除摘要相同的 Additional section。
 *
 * 为什么带内容摘要而不是只看路径：read 之后文件可能被 edit，宿主随后注入的是
 * 修改后的新内容，此时旧 read 已过时，不能删。摘要用规范化后的正文计算，注入
 * 正文被预算截断或转义时不会相等，宁可重复也不丢更新。
 *
 * 边界：只处理根会话自己发起的 read（子代理的 read 结果不在父会话历史里）；只删
 * Additional（新发现的同内容重复），文件改动后的 Updated 与删除通知保留；记录不
 * 落盘，跨进程恢复后需要重新读过才生效。
 */
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import type { AgentLike } from '../types.ts'

const SYSTEM_REMINDER_OPEN = '<system-reminder>'
const SYSTEM_REMINDER_CLOSE = '</system-reminder>'

/**
 * 动态注入消息里每个 section 的标题行。`Instructions from:` 是基线、`Additional`
 * 是文件触碰后的新发现、`Updated` 是内容变化、`Instructions removed` 是删除通知；
 * 只有 `Additional` 是「同一份内容再注入一次」的场景。
 */
const SECTION_HEAD = /^(Additional instructions from|Updated instructions from|Instructions from|Instructions removed): (.+)$/
const SECTION_HEAD_PREFIXES = [
  'Additional instructions from: ',
  'Updated instructions from: ',
  'Instructions from: ',
  'Instructions removed: ',
] as const
const READ_TOOL_NAME = 'read'
/** 单个会话的路径上限：read 可能高频，长会话不能无限涨。 */
const READ_PATHS_LIMIT = 500

interface SessionKitLike {
  sessionOf(agent: AgentLike | undefined | null): { header?: Record<string, unknown> | null } | null
  sessionIdOf(agent: AgentLike | undefined | null): string | null
  isRootAgent(agent: AgentLike | undefined | null): boolean
}

/** 已读工作区指令的会话级记录：路径键 → 内容摘要。 */
export interface InstructionReadTracker {
  /** 从一次 `tools/result` 里收集完整读取；非 read / 失败 / 不完整一律忽略。 */
  observe(exec: unknown, result: unknown): void
  /** 该会话在某个路径键上完整读过的内容摘要。 */
  digestFor(sessionId: string, key: string): string | undefined
  /** 会话结束或 agent 释放时清掉记录。 */
  release(sessionId: string): void
}

/** 归一化绝对路径作为比较键；Windows 大小写不敏感。 */
export function pathKey(path: string): string {
  const resolved = resolve(path)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

/**
 * 从 cwd 向上找项目根（`.git` 标记），与宿主 agent-instructions 的默认
 * `projectRootMarkers` 一致；找不到时回落到 cwd（宿主同样以 cwd 为根）。
 */
export function findProjectRoot(cwd: string): string {
  const root = resolve(cwd)
  let current = root
  for (;;) {
    if (existsSync(join(current, '.git'))) return current
    const parent = dirname(current)
    if (parent === current) return root
    current = parent
  }
}

function normalizeContent(text: string): string {
  return text.replace(/\r\n/g, '\n').trim()
}

function digestOf(text: string): string {
  return createHash('sha1').update(normalizeContent(text)).digest('hex')
}

/**
 * 从 read 的结构化输出判定「完整读取」并还原正文。
 * 完整 = offset 从 1 开始、返回行数等于文件总行数、且没有行内截断。
 */
function completeReadContent(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const record = value as { offset?: unknown; lines?: unknown; totalLines?: unknown }
  if (record.offset !== 1) return undefined
  if (!Array.isArray(record.lines)) return undefined
  if (typeof record.totalLines !== 'number' || !Number.isInteger(record.totalLines) || record.totalLines < 0) return undefined
  if (record.lines.length !== record.totalLines) return undefined
  const lines: string[] = []
  for (const line of record.lines) {
    const item = line as { text?: unknown } | null
    if (typeof item?.text !== 'string') return undefined
    if (/\(line truncated to \d+ chars\)$/.test(item.text)) return undefined
    lines.push(item.text)
  }
  return lines.join('\n')
}

export function createReadInstructionTracker(kit: SessionKitLike, note: (source: string, error: unknown) => void): InstructionReadTracker {
  const sessions = new Map<string, Map<string, string>>()
  return {
    observe(exec, result) {
      try {
        const execution = exec as { name?: unknown; agent?: AgentLike } | null
        if (execution?.name !== READ_TOOL_NAME) return
        const agent = execution.agent
        if (!agent || !kit.isRootAgent(agent)) return
        const outcome = result as { isError?: unknown; value?: unknown } | null
        if (!outcome || outcome.isError === true) return
        const value = outcome.value as { path?: unknown } | null
        const path = typeof value?.path === 'string' ? value.path : undefined
        if (!path || !isAbsolute(path)) return
        const content = completeReadContent(outcome.value)
        if (content === undefined) return
        const sessionId = kit.sessionIdOf(agent)
        if (!sessionId) return
        let tracked = sessions.get(sessionId)
        if (!tracked) {
          tracked = new Map()
          sessions.set(sessionId, tracked)
        }
        const key = pathKey(path)
        // 重新读过同一路径时刷新摘要，并把它移到最新端（超限淘汰最旧）。
        tracked.delete(key)
        tracked.set(key, digestOf(content))
        while (tracked.size > READ_PATHS_LIMIT) {
          const oldest = tracked.keys().next().value
          if (oldest === undefined) break
          tracked.delete(oldest)
        }
      } catch (error) {
        note('read instruction tracker', error)
      }
    },
    digestFor(sessionId, key) {
      return sessions.get(sessionId)?.get(key)
    },
    release(sessionId) {
      sessions.delete(sessionId)
    },
  }
}

interface Segment {
  preamble: boolean
  kind?: string
  path?: string
  lines: string[]
}

/** 按 section 标题切分 `<system-reminder>` 的正文；标题前后都为空行才认作边界。 */
function splitSections(body: string): Segment[] {
  const lines = body.split('\n')
  const segments: Segment[] = []
  let current: Segment = { preamble: true, lines: [] }
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? ''
    const match = SECTION_HEAD.exec(line)
    const previousBlank = index === 0 || (lines[index - 1] ?? '').trim() === ''
    const nextBlank = index + 1 < lines.length && (lines[index + 1] ?? '').trim() === ''
    if (match && match[1] && match[2]?.trim() && previousBlank && nextBlank) {
      segments.push(current)
      current = { preamble: false, kind: match[1], path: match[2].trim(), lines: [line] }
      continue
    }
    current.lines.push(line)
  }
  segments.push(current)
  return segments
}

/** Additional section 的正文：标题、适用说明行之后的部分。 */
function sectionContent(segment: Segment): string {
  const lines = segment.lines.slice(1)
  let index = 0
  while (index < lines.length && (lines[index] ?? '').trim() === '') index += 1
  // 标题后紧跟的适用说明（"These instructions apply to work under ..."）只占一行。
  if (index < lines.length) index += 1
  while (index < lines.length && (lines[index] ?? '').trim() === '') index += 1
  return lines.slice(index).join('\n')
}

function startsWithSectionHead(text: string): boolean {
  return SECTION_HEAD_PREFIXES.some((prefix) => text.startsWith(prefix))
}

/**
 * 剔除一条 `agent-instructions` 消息里与已读内容相同的 Additional section。
 *
 * @param text - 完整的 `<system-reminder>` 消息正文。
 * @param resolveDigest - 把 section 的 displayPath 解析成本会话已读摘要；不认识返回 undefined。
 * @returns 原文本（没有可删的）、重建后的文本，或 null（整条消息只剩空壳）。
 */
export function pruneReadInstructions(
  text: string,
  resolveDigest: (displayPath: string) => string | undefined,
): string | null {
  const open = `${SYSTEM_REMINDER_OPEN}\n`
  const close = `\n${SYSTEM_REMINDER_CLOSE}`
  if (!text.startsWith(open) || !text.endsWith(close)) return text
  const body = text.slice(open.length, text.length - close.length)
  const segments = splitSections(body)
  const kept: Segment[] = []
  let removed = 0
  for (const segment of segments) {
    if (!segment.preamble && segment.kind === 'Additional instructions from' && segment.path) {
      const expected = resolveDigest(segment.path)
      if (expected !== undefined && digestOf(sectionContent(segment)) === expected) {
        removed += 1
        continue
      }
    }
    kept.push(segment)
  }
  if (removed === 0) return text
  const blocks = kept
    .map((segment) => segment.lines.join('\n').replace(/\n+$/, ''))
    .filter((block) => block.trim().length > 0)
  if (!blocks.some((block) => startsWithSectionHead(block))) return null
  return `${SYSTEM_REMINDER_OPEN}\n${blocks.join('\n\n')}\n${SYSTEM_REMINDER_CLOSE}`
}

/** 把注入消息里相对项目根的 displayPath 解析成本会话已读摘要。 */
function resolveDisplayDigest(
  displayPath: string,
  sessionId: string,
  cwd: string,
  tracker: InstructionReadTracker,
): string | undefined {
  // 用户全局指令的 displayPath 是 ~ / $DSH_HOME 预算前缀，不属于项目路径。
  if (displayPath.startsWith('~') || displayPath.startsWith('$')) return undefined
  const projectRoot = findProjectRoot(cwd)
  const bases = projectRoot === resolve(cwd) ? [projectRoot] : [projectRoot, cwd]
  for (const base of bases) {
    const digest = tracker.digestFor(sessionId, pathKey(resolve(base, displayPath)))
    if (digest !== undefined) return digest
  }
  return undefined
}

/**
 * 过滤一组 pre-step 消息：只处理 `agent-instructions` 来源，且只删与已读内容
 * 相同的 Additional section。
 */
export function pruneInstructionMessages<T extends { source?: { kind?: unknown } | null; content?: unknown }>(
  messages: T[],
  agent: AgentLike,
  tracker: InstructionReadTracker,
  kit: SessionKitLike,
): T[] {
  const sessionId = kit.sessionIdOf(agent)
  if (!sessionId) return messages
  const header = kit.sessionOf(agent)?.header
  const cwd = typeof header?.cwd === 'string' && isAbsolute(header.cwd) ? header.cwd : null
  if (!cwd) return messages
  let changed = false
  const next = messages.flatMap((message) => {
    if (message?.source?.kind !== 'agent-instructions') return [message]
    const content = message.content
    if (!Array.isArray(content)) return [message]
    let messageChanged = false
    const keptBlocks = content.flatMap((block) => {
      const item = block as { type?: unknown; text?: unknown } | null
      if (item?.type !== 'text' || typeof item.text !== 'string') return [block]
      const pruned = pruneReadInstructions(item.text, (displayPath) => resolveDisplayDigest(displayPath, sessionId, cwd, tracker))
      if (pruned === item.text) return [block]
      messageChanged = true
      return pruned === null ? [] : [{ ...item, text: pruned }]
    })
    if (!messageChanged) return [message]
    changed = true
    return keptBlocks.length === 0 ? [] : [{ ...message, content: keptBlocks }]
  })
  return changed ? next : messages
}

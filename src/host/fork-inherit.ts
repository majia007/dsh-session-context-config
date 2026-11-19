/**
 * fork 会话的档位继承。
 *
 * 宿主 fork 出来的是**全新会话**:id 是新 UUID,会话头只有 `isSeeded: true`,连
 * `parentSession` 都不写(session-controller 的 fork 只传 `{ cwd, isSeeded, agentPreset }`),
 * 所以「来源是哪个会话」只能按日志内容认:比对**继承前缀**——前 `inheritedEventCount`
 * 个事件的 `seq|type|time`。每个事件的时间戳独立打点,整段逐条相等只可能来自拷贝
 * (实测:一个 143 事件的 fork 前缀在本地全部会话日志里唯一命中它的源会话)。
 *
 * 查找分两级:
 * 1. 活会话:内存里按 `eventAt` 比对,零 I/O——fork 的源通常还开着,这是主路径;
 * 2. 已结束的来源:按 `sessionQuery.listSessions()` 的最新优先顺序回读有限条会话日志
 *    (数量与时长都有上限);拿不到目录时退回「本插件记录过的最新会话」。
 *
 * 找不到来源、或来源自己也没有档位记录时返回 null,由调用方记成「不处理」——不拿
 * lastUsedId 去猜(那会把「新会话的默认档位」冒充成「继承来的档位」)。
 */
import type { AgentLike, HostContext } from '../types.ts'
import type { SessionKit } from './sessions.ts'

/** core Session 的只读日志面(仓库外可用的是 eventAt / snapshotEvents 这两个公开方法)。 */
interface SessionReader {
  header?: Record<string, unknown> | null
  inheritedEventCount?: unknown
  eventAt?: (seq: number) => unknown
  snapshotEvents?: () => unknown[]
}

/** sessionQuery 服务里用到的只读方法(session-query 包的公开面);老宿主可能没有。 */
interface SessionQueryPort {
  listSessions?: (signal?: AbortSignal) => Promise<Array<{ header?: { id?: unknown; createdAt?: unknown } | null }>>
  readSession?: (id: string) => Promise<{ session?: Record<string, unknown> | null; events?: unknown[] } | null>
  /** 回退路径:返回值是 SessionObservation(header / inheritedEventCount / events + Disposable)。 */
  observeSession?: (id: string, options?: { signal?: AbortSignal }) => Promise<unknown>
}

/**
 * 冷来源回查上限:最多读几条会话日志、最多花多少毫秒。只在「活会话全不命中」时走,
 * 目的是一次性找回刚结束的源会话,不承担全库扫描。
 */
const COLD_SESSION_LIMIT = 6
const COLD_BUDGET_MS = 600

/**
 * 继承前缀的最小长度。指纹是 `seq|type|time` 三元组:前缀只剩一两个事件时,
 * 同一毫秒里创建的两个无关会话可能撞上同一组指纹(seq 都从 0 起、事件类型与打点时间相同),
 * 从而继承错档位。真实 fork 的切点是「已完成轮次的最后一个事件」,前缀必然远长于此。
 */
const MIN_INHERITED_EVENTS = 3

/** Disposable 的运行时符号:tsconfig 的 es2024 lib 不含 esnext.disposable,从 Symbol 上取。 */
const DISPOSE = (Symbol as unknown as { readonly dispose?: symbol }).dispose

function disposeLease(value: unknown): void {
  if (DISPOSE === undefined || value === null || typeof value !== 'object') return
  const dispose = (value as Record<symbol, unknown>)[DISPOSE]
  if (typeof dispose === 'function') (dispose as () => void).call(value)
}

/** 一个事件的匹配指纹:seq、type 与打点时间。三者相同即同一次写入的同一事件。 */
function fingerprint(event: unknown): string {
  if (!event || typeof event !== 'object') return ''
  const record = event as { seq?: unknown; type?: unknown; time?: unknown }
  if (record.seq === undefined || record.type === undefined || record.time === undefined) return ''
  return `${String(record.seq)}|${String(record.type)}|${String(record.time)}`
}

/** 按 seq 读事件的取值器:优先 eventAt(不物化数组),回落 snapshotEvents(缓存一份)。 */
function eventReader(session: SessionReader): ((index: number) => unknown) | null {
  if (typeof session.eventAt === 'function') {
    const read = session.eventAt
    return (index) => {
      try {
        return read.call(session, index)
      } catch {
        return undefined
      }
    }
  }
  if (typeof session.snapshotEvents === 'function') {
    let cache: unknown[] | null = null
    return (index) => {
      if (cache === null) {
        try {
          const value = session.snapshotEvents?.()
          cache = Array.isArray(value) ? value : []
        } catch {
          cache = []
        }
      }
      return (cache as unknown[])[index]
    }
  }
  return null
}

function createdAtOf(session: SessionReader): number {
  const value = session.header?.createdAt
  return typeof value === 'number' ? value : 0
}

export interface ForkInheritanceDeps {
  ctx: HostContext
  kit: SessionKit
  /** 该会话当前生效的档位(applied 优先,回落会话表);没有记录返回 null。 */
  recordedProfile(sessionId: string): string | null
  /** 本插件记录过的会话 id(按写入顺序,旧→新),拿不到会话目录时作候选来源。 */
  recordedIds(): string[]
  note(source: string, error: unknown): void
}

export interface ForkInheritance {
  /** 这个 agent 是 fork 时能继承的档位;不是 fork、找不到来源、或来源无记录时返回 null。 */
  inheritedProfile(agent: AgentLike): Promise<string | null>
}

export function createForkInheritance(deps: ForkInheritanceDeps): ForkInheritance {
  const { ctx, kit } = deps

  /** 子会话的继承前缀指纹;不是 seeded 会话或拿不到日志时返回 null。 */
  function inheritedPrefix(agent: AgentLike): { keys: string[]; cutTime: number | null } | null {
    const session = kit.sessionOf(agent) as SessionReader | null
    if (!session || session.header?.isSeeded !== true) return null
    const cut = typeof session.inheritedEventCount === 'number' ? session.inheritedEventCount : 0
    if (!Number.isSafeInteger(cut) || cut < MIN_INHERITED_EVENTS) return null
    const read = eventReader(session)
    if (!read) {
      // eventAt / snapshotEvents 都标了 deprecated:宿主哪天把它们移掉,继承会静默失效。
      // 留一条诊断(面板「诊断」区可见),而不是悄悄退回「不处理」。
      deps.note('fork:log-reader', new Error('session.eventAt / snapshotEvents 都不可用,fork 档位继承已跳过'))
      return null
    }
    const keys: string[] = []
    for (let index = 0; index < cut; index += 1) {
      const value = fingerprint(read(index))
      // 缺字段的事件没法当指纹用:宁可放弃匹配,也不要用不可靠的判据认亲。
      if (!value) return null
      keys.push(value)
    }
    const last = read(cut - 1) as { time?: unknown } | null | undefined
    return { keys, cutTime: typeof last?.time === 'number' ? last.time : null }
  }

  function matchesPrefix(session: SessionReader, keys: readonly string[]): boolean {
    const read = eventReader(session)
    if (!read) return false
    // 先比切点那一个事件:绝大多数候选在第一条就失败,不必走完整段比较。
    if (fingerprint(read(keys.length - 1)) !== keys[keys.length - 1]) return false
    for (let index = 0; index < keys.length; index += 1) {
      if (fingerprint(read(index)) !== keys[index]) return false
    }
    return true
  }

  /** 候选来源:本插件记录过、当下没有活着、且创建时间不晚于切点的会话,新的在前。 */
  async function coldCandidates(query: SessionQueryPort, cutTime: number | null, selfId: string | null): Promise<string[]> {
    const live = new Set<string>()
    for (const agent of ctx.agents.list()) {
      const id = kit.sessionIdOf(agent)
      if (id) live.add(id)
    }
    const known = new Set(deps.recordedIds())
    const candidates: Array<{ id: string; createdAt: number }> = []
    if (typeof query.listSessions === 'function') {
      try {
        // 列目录也要有上限:它挂住会让 fork 会话的创建一直等(listener 被宿主 await)。
        // 超时/取消会抛错,下面的 catch 记诊断并退回「按插件记录顺序」的候选。
        const timeoutOf = (AbortSignal as unknown as { timeout?: (ms: number) => AbortSignal }).timeout
        const signal = typeof timeoutOf === 'function' ? timeoutOf(COLD_BUDGET_MS) : undefined
        for (const record of await query.listSessions(signal)) {
          const id = record?.header?.id
          if (typeof id !== 'string' || !known.has(id) || id === selfId || live.has(id)) continue
          const createdAt = record?.header?.createdAt
          // 来源必须早于切点事件存在;这条只是粗筛,真正的判据是前缀比对。
          if (cutTime !== null && typeof createdAt === 'number' && createdAt > cutTime) continue
          candidates.push({ id, createdAt: typeof createdAt === 'number' ? createdAt : 0 })
        }
      } catch (error) {
        deps.note('fork:listSessions', error)
      }
    }
    if (candidates.length === 0) {
      // 拿不到会话目录:按本插件的记录顺序(旧→新)取最近的几条。
      for (const id of deps.recordedIds().slice(-COLD_SESSION_LIMIT * 2).reverse()) {
        if (id === selfId || live.has(id) || !known.has(id)) continue
        candidates.push({ id, createdAt: 0 })
      }
    }
    candidates.sort((left, right) => right.createdAt - left.createdAt)
    return candidates.slice(0, COLD_SESSION_LIMIT).map((entry) => entry.id)
  }

  /**
   * 读一条会话的日志(只读,不激活会话)。readSession 优先;回退 observeSession 租约,
   * 它的返回形状按 session-query 的 `SessionObservation` 核过(header / events + `[Symbol.dispose]`)。
   */
  async function readLog(query: SessionQueryPort, id: string): Promise<SessionReader | null> {
    if (typeof query.readSession === 'function') {
      const snapshot = await query.readSession(id)
      const events = snapshot?.events
      if (!Array.isArray(events) || events.length === 0) return null
      return {
        header: snapshot?.session ?? null,
        eventAt: (index) => events[index],
      }
    }
    if (typeof query.observeSession === 'function') {
      const observation = await query.observeSession(id) as { header?: Record<string, unknown> | null; events?: unknown[] } | null
      try {
        const events = observation?.events
        if (!Array.isArray(events) || events.length === 0) return null
        return {
          header: observation?.header ?? null,
          eventAt: (index) => events[index],
        }
      } finally {
        disposeLease(observation)
      }
    }
    return null
  }

  async function inheritedProfile(agent: AgentLike): Promise<string | null> {
    const prefix = inheritedPrefix(agent)
    if (!prefix) return null
    const selfId = kit.sessionIdOf(agent)

    // 1) 活会话:内存比对,零 I/O。
    const liveMatches: Array<{ createdAt: number; profileId: string }> = []
    for (const other of ctx.agents.list()) {
      const id = kit.sessionIdOf(other)
      if (!id || id === selfId) continue
      const profileId = deps.recordedProfile(id)
      if (!profileId) continue
      const session = kit.sessionOf(other) as SessionReader | null
      if (!session || !matchesPrefix(session, prefix.keys)) continue
      liveMatches.push({ createdAt: createdAtOf(session), profileId })
    }
    if (liveMatches.length > 0) {
      // 同一切点被 fork 多次时前缀完全相同:取最后创建的那个,它就是这次 fork 的父会话。
      liveMatches.sort((left, right) => right.createdAt - left.createdAt)
      return liveMatches[0].profileId
    }

    // 2) 已结束的来源:按最新优先回读有限条会话日志。
    const query = ctx.get('sessionQuery') as SessionQueryPort | undefined
    if (!query) return null
    const started = Date.now()
    for (const id of await coldCandidates(query, prefix.cutTime, selfId)) {
      if (Date.now() - started > COLD_BUDGET_MS) break
      const profileId = deps.recordedProfile(id)
      if (!profileId) continue
      let log: SessionReader | null
      try {
        log = await readLog(query, id)
      } catch (error) {
        deps.note(`fork:${id}`, error)
        continue
      }
      if (!log || !matchesPrefix(log, prefix.keys)) continue
      return profileId
    }
    return null
  }

  return { inheritedProfile }
}

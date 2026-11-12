/**
 * 注入消息清单:按 `source.kind` 记录 agent/pre-step 里实际进入请求的 user 消息。
 *
 * 为什么运行时观察而不是维护 kind 白名单:注入者可能是任意第三方插件,DSH 升级还会
 * 新增 kind,白名单必然漂移。面板对已知两条通道(工作区指令/时间采样)提供开关,
 * 其余 kind 用这份清单只读展示,至少能让人看见「还有谁在往请求里塞东西」。
 *
 * 只记录 user 角色;人类输入、审批/问答回执与重试消息不是宿主注入的上下文,跳过。
 */

/** 注入消息的聚合结果;text 是最新一条的正文(超长截断,避免动辄 100KB 的 tooltip)。 */
export interface InjectedChannel {
  kind: string
  count: number
  chars: number
  text: string
  truncated: boolean
}

export interface InjectedMessages {
  /** 观察一个 pre-step 决策里的消息;重复 kind 更新正文并累加次数。 */
  observe(messages: unknown, profileId?: string): void
  /** 本进程观察到的某档位 kind;与历史聚合结果按 kind 合并后供面板展示。 */
  list(profileId?: string): InjectedChannel[]
}

const TEXT_LIMIT = 4000

/** 这些 kind 不是宿主注入的上下文:人类输入/UI 回执/重试。 */
const SKIPPED_KINDS = new Set(['user', 'user-approval', 'user-question-reply', 'retry'])

/** 从一条消息里取 user 角色、非人类输入、可展示的文本正文。 */
function inspect(message: unknown): { kind: string; text: string } | null {
  const record = message as {
    role?: unknown
    source?: { kind?: unknown } | null
    content?: unknown
  } | null
  if (!record || (record.role !== undefined && record.role !== 'user')) return null
  const kind = record.source?.kind
  if (typeof kind !== 'string' || !kind || SKIPPED_KINDS.has(kind)) return null
  if (!Array.isArray(record.content)) return null
  const parts: string[] = []
  for (const block of record.content) {
    const item = block as { type?: unknown; text?: unknown }
    if (item?.type === 'text' && typeof item.text === 'string' && item.text.length > 0) parts.push(item.text)
  }
  const text = parts.join('\n')
  return text.length > 0 ? { kind, text } : null
}

export function createInjectedMessages(): InjectedMessages {
  // 按档位分桶:面板的「其他注入消息」只属于当前档位,不能把并行会话的观察
  // 混进来。没有档位的会话归到 none;它们本来也不在面板的可选档位里。
  const seen = new Map<string, Map<string, InjectedChannel>>()
  const bucketOf = (profileId: string): Map<string, InjectedChannel> => {
    let bucket = seen.get(profileId)
    if (!bucket) {
      bucket = new Map()
      seen.set(profileId, bucket)
    }
    return bucket
  }
  return {
    observe(messages, profileId = 'none') {
      if (!Array.isArray(messages)) return
      const bucket = bucketOf(profileId)
      for (const message of messages) {
        const entry = inspect(message)
        if (!entry) continue
        const previous = bucket.get(entry.kind)
        const chars = entry.text.length
        bucket.set(entry.kind, {
          kind: entry.kind,
          count: (previous?.count ?? 0) + 1,
          chars,
          text: chars > TEXT_LIMIT ? entry.text.slice(0, TEXT_LIMIT) : entry.text,
          truncated: chars > TEXT_LIMIT,
        })
      }
    },
    list(profileId = 'none') {
      return [...(seen.get(profileId)?.values() ?? [])].sort((left, right) => left.kind.localeCompare(right.kind))
    },
  }
}

/** 从已派生消息里聚合历史注入消息;会话重启后也能列出上一次进程注入过的 kind。 */
export function collectInjected(messages: unknown): InjectedChannel[] {
  if (!Array.isArray(messages)) return []
  const map = new Map<string, InjectedChannel>()
  for (const message of messages) {
    const entry = inspect(message)
    if (!entry) continue
    const previous = map.get(entry.kind)
    const chars = entry.text.length
    map.set(entry.kind, {
      kind: entry.kind,
      count: (previous?.count ?? 0) + 1,
      chars,
      text: chars > TEXT_LIMIT ? entry.text.slice(0, TEXT_LIMIT) : entry.text,
      truncated: chars > TEXT_LIMIT,
    })
  }
  return [...map.values()]
}

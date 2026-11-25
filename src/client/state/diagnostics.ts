/**
 * 诊断升级:把「注册 / 装配失败」这类信号从 `/api/state` 的 diagnostics 里挑出来,交给面板
 * 无条件显示。
 *
 * 为什么需要:宿主对工具定义有强校验(`tools.register` 按 JSON Schema 子集拒掉非法的
 * output schema),但拒绝发生在插件自己的 try/catch 里,只剩一条诊断。面板原先只在「工具
 * 目录为空」时才显示第一条诊断,于是单条注册失败完全静默——实测有个功能因此坏了很久,
 * 还是靠人工翻诊断才发现的。
 */

/** 消息里出现这些错误码/特征即视为致命:宿主拒绝注册或同作用域撞名。 */
const FATAL_MESSAGE = /unsupported JSON schema|UNSUPPORTED_SCHEMA|is already registered in this scope/i

/** 来源命中这些前缀即视为致命:`defer:*` 是延迟占位注册,`register` 是工具注册。 */
const FATAL_SOURCE_PREFIXES = ['defer', 'register']

/** 来源精确等于这些即视为致命:改写注册与重装载补。 */
const FATAL_SOURCES = ['ask shadow', 'reapply']

/**
 * 从诊断数组里挑出致命项(去重后的「来源: 消息」文本)。
 * @param diagnostics - 快照里的 `diagnostics`;形状不合法时静默跳过。
 */
export function fatalDiagnostics(diagnostics: unknown[] | undefined): string[] {
  const out: string[] = []
  for (const item of diagnostics ?? []) {
    if (!item || typeof item !== 'object') continue
    const { source, message } = item as { source?: unknown; message?: unknown }
    if (typeof message !== 'string' || message.length === 0) continue
    const label = typeof source === 'string' ? source : ''
    const fatal = FATAL_MESSAGE.test(message)
      || FATAL_SOURCES.includes(label)
      || FATAL_SOURCE_PREFIXES.some((prefix) => label.startsWith(prefix))
    if (!fatal) continue
    const text = label ? `${label}: ${message}` : message
    if (!out.includes(text)) out.push(text)
  }
  return out
}

import { GROUPS, TOKEN_PER_CHAR } from './constants.ts'
import { groupOf, serverOf } from './tools.ts'
import type { SourceIndex, ToolSource } from './sources.ts'
import type { HostContext } from '../types.ts'

export interface CatalogTool {
  name: string
  description: string
  group: string
  server: string | null
  chars: number
  tokens: number
  modes: string[]
  /** 工具来源(谁注册的);解析不出时缺省,面板显示「未识别」。 */
  source?: ToolSource
}

export interface Catalog {
  presets: Array<{ id: string; name: string; tools: CatalogTool[] }>
  defaultPreset: string
  tools: CatalogTool[]
  groups: Array<{ id: string; title: string }>
}

/** 目录构建:枚举 agent preset 组合的工具表,15 秒缓存。 */
export function createCatalog(ctx: HostContext, note: (source: string, error: unknown) => void, sources: SourceIndex) {
  let catalogCache: { at: number; value: Catalog } | null = null

  function toolEntry(schema: { name?: unknown; description?: unknown; parameters?: unknown }): CatalogTool {
    const parameters = schema.parameters ? JSON.stringify(schema.parameters) : ''
    const chars = String(schema.name ?? '').length + String(schema.description ?? '').length + parameters.length
    return {
      name: schema.name as string,
      description: String(schema.description ?? '').slice(0, 240),
      group: groupOf(String(schema.name ?? '')),
      server: serverOf(String(schema.name ?? '')),
      chars,
      tokens: Math.max(1, Math.round(chars * TOKEN_PER_CHAR)),
      modes: [],
    }
  }

  async function buildCatalog(): Promise<Catalog> {
    const now = Date.now()
    if (catalogCache && now - catalogCache.at < 15000) return catalogCache.value
    const presets: Catalog['presets'] = []
    let defaultPreset = 'standard'
    const registry = ctx.get('agentPresets') as {
      list?: () => Promise<Array<{ id: string; name?: string }>>
      acquireScope?: (id: string) => Promise<{
        key: unknown
        dispose?: () => Promise<void>
        [Symbol.asyncDispose]?: () => Promise<void>
      }>
    } | undefined
    try {
      const registryConfig = ctx.get('agentPresetRegistry') as { config?: { default?: string } } | undefined
      if (registryConfig?.config?.default) defaultPreset = registryConfig.config.default
    } catch {
      /* 老宿主没有这个服务 */
    }
    try {
      const list = registry?.list ? await registry.list() : []
      for (const preset of list) {
        let tools: CatalogTool[] = []
        try {
          if (!registry?.acquireScope) throw new Error('agentPresets.acquireScope 不可用')
          // 必须作为方法调用：宿主实现内部要用 this.retain，解构成局部函数后 receiver 丢失。
          const lease = await registry.acquireScope(preset.id)
          try {
            tools = (ctx.tools.schemas(lease.key) as Array<{ name?: unknown; description?: unknown; parameters?: unknown }>).map(toolEntry)
          } finally {
            // 当前宿主用 Symbol.asyncDispose 释放租约；旧宿主可能给 dispose()，两个都兜住。
            const asyncDispose = lease[Symbol.asyncDispose]
            if (typeof asyncDispose === 'function') await asyncDispose.call(lease)
            else await lease.dispose?.()
          }
        } catch (error) {
          note(`catalog:${preset.id}`, error)
        }
        tools.sort((a, b) => a.name.localeCompare(b.name))
        presets.push({ id: preset.id, name: preset.name || preset.id, tools })
      }
    } catch (error) {
      note('catalog', error)
    }
    const union = new Map<string, CatalogTool>()
    for (const preset of presets) {
      for (const tool of preset.tools) {
        if (!union.has(tool.name)) union.set(tool.name, { ...tool, modes: [] })
        union.get(tool.name)!.modes.push(preset.id)
      }
    }
    // 来源按工具名统一解析一次:preset 之间同名工具是同一份注册,归属也相同。
    // 描述一并带上:同名多实现(pwsh)与动态命名的工具要靠它消歧。
    const targets = [...union.values()].map((tool) => ({ name: tool.name, description: tool.description }))
    try {
      await sources.resolveMany(targets)
    } catch (error) {
      note('sources', error)
    }
    for (const tool of union.values()) tool.source = sources.resolve(tool.name)
    for (const preset of presets) {
      for (const tool of preset.tools) tool.source = sources.resolve(tool.name)
    }
    if (!presets.some((preset) => preset.id === defaultPreset)) defaultPreset = presets[0]?.id ?? ''
    const value: Catalog = {
      presets,
      defaultPreset,
      tools: [...union.values()].sort((a, b) => a.name.localeCompare(b.name)),
      groups: GROUPS.map(({ id, title }) => ({ id, title })),
    }
    catalogCache = { at: now, value }
    return value
  }

  /** 状态变更后让下一次快照重建目录(工具表可能变)。 */
  function invalidate(): void {
    catalogCache = null
  }

  return { buildCatalog, invalidate }
}

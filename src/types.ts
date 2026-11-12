/**
 * 宿主服务面的最小结构声明。
 *
 * DSH 没有发布类型包:这里只写本插件实际用到的形状(镜像 checkout 源码与真机行为),
 * 未验证的字段不要写;防御性读取的成员一律按 unknown 收,由业务代码在运行时判形。
 */

/** Agent 的最小面:身份、会话与子代理自己的 ctx。 */
export interface AgentLike {
  id?: unknown
  sessionId?: unknown
  session?: {
    id?: unknown
    sessionId?: unknown
    header?: Record<string, unknown> | null
  } | null
  ctx?: AgentContext | null
}

/** agent 作用域 ctx 的最小面(档位应用要用 tools 与 systemPrompt)。 */
export interface AgentContext {
  /** agent 自己的 cordis Context;通道过滤器在 agent/created 里按 agent 注册,必须排在该 agent 预设插件之后。 */
  on?(name: string, listener: (...args: never[]) => unknown, options?: { prepend?: boolean }): unknown
  tools: {
    restrict(filter: { deny: string[] }): unknown
    register(definition: unknown): unknown
  }
  systemPrompt: {
    section(section: Record<string, unknown>): unknown
    context(context: Record<string, unknown>): unknown
    getSectionOrder(name: string): unknown
    /** 老宿主可能没有;注册 required 上下文遮蔽时要按运行时判形。 */
    getContextOrder?(name: string): unknown
  }
}

/** 工具执行回执的最小面。 */
export interface ToolExecContext {
  agent?: AgentLike | null
  signal?: AbortSignal | undefined
}

/** 工具定义的最小面(与宿主 tools.register 收到的形状对齐)。 */
export interface ToolDefinition<T> {
  name: string
  description: string
  parameters: Record<string, unknown>
  output: {
    schema: Record<string, unknown>
    render(args: unknown, value: T): Array<{ type: 'text'; text: string }>
  }
  isConcurrencySafe(): boolean
  execute(args: Record<string, unknown> | undefined, exec: ToolExecContext | undefined): Promise<T>
}

/** HTTP 请求面的最小结构(handler 用到的部分;readBody 走事件式读取)。 */
export interface HttpRequest {
  method?: string
  url?: string
  headers: Record<string, unknown>
  on(event: 'data', listener: (chunk: Buffer) => void): unknown
  on(event: 'end', listener: () => void): unknown
  on(event: 'error', listener: (error: Error) => void): unknown
  destroy(): unknown
}

/** HTTP 响应面的最小结构。 */
export interface HttpResponse {
  writeHead(status: number, headers?: Record<string, unknown>): unknown
  end(body?: string): unknown
}

export type RouteHandler = (request: HttpRequest, response: HttpResponse) => Promise<void> | void

/** cordis Host ctx 的最小面(宿主与测试桩都按此形状提供方法)。 */
export interface HostContext {
  /** profile 根 ctx 的模块 baseUrl(解析包目录与本地化标题用);老宿主可能没有。 */
  baseUrl?: string
  get(service: string): unknown
  /** cordis Context.on;global:true 是收到 scopeTarget 派发(如 system-prompt/assemble)的必要条件。 */
  on(event: string, listener: (...args: never[]) => unknown, options?: { prepend?: boolean; global?: boolean }): unknown
  inject(names: string[], callback: (scoped: HostContext) => void): void
  effect(fn: () => () => void, label?: string): void
  tools: {
    register(definition: unknown): () => void
    schemas(agent: unknown): unknown[]
    definitions(agent: unknown): unknown[]
    view(agent: unknown): { restrictableNames?: string[] } | undefined
  }
  agents: {
    list(): AgentLike[]
    roots(): unknown[]
    turnBoundaryOf(session: unknown): { openTurnStartSeq?: unknown; lastTurn?: unknown; lastStepStartSeq?: unknown } | null
  }
  systemPrompt: {
    section(section: Record<string, unknown>): () => void
    assemble(input: { agent: unknown; scope: unknown; sccFullSections?: boolean }): Promise<{
      tools?: unknown[]
      sections?: unknown[]
      contexts?: unknown[]
      /** 模板变量;面板展示段/上下文正文时按它渲染(与请求路径同一份值)。 */
      variables?: Record<string, string | undefined>
    }>
    /** 干跑装配后复核请求准入阶段会不会把 required 上下文补回来。 */
    refreshContext?(assembly: unknown, context?: unknown): { tools?: unknown[]; sections?: unknown[]; contexts?: unknown[] }
  }
}

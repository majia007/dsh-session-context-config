/**
 * `ask_user_question` 的档位级改写:在 agent 作用域注册一份同名工具,遮蔽宿主/preset 里的原注册。
 *
 * 为什么这么改:宿主的 ask 工具由 agent preset 装配(config.plugins 里的一行),preset 的
 * plugins 是数组、loader 的 patch 方言只能整体替换数组,按插件 id 打补丁会把整份 preset
 * 冻进 profile patch(挡住上游更新,新模式也不跟随)。tools 注册表本身支持「作用域注册遮蔽
 * 全局同名」,所以档位在自己的 agent 作用域注册一份即可:per-session 生效、不落盘、
 * 新模式/新 preset 天然覆盖。
 *
 * 安全阀(用户要求):**先取官方定义再验证参数结构**。参数结构(参数名/类型/required)
 * 与基线一致才遮蔽;不一致时整个配置项停用,由面板给出提示——上游改了 schema 说明调用
 * 契约变了,继续按旧参数解释 args 会静默出错。
 *
 * 只替换 `execute` / `output` / `description`,name 与 parameters 始终来自官方定义。
 */
import { ASK_TOOL_NAME } from './constants.ts'
import { DEFERRED_DESCRIPTION_PREFIX, skeleton } from './tools.ts'
import type { AgentLike, HostContext, ToolDefinition } from '../types.ts'
import type { SessionKit } from './sessions.ts'

/** timed 分支返回 pending 时给模型的话:明确「不是跳过」,并说明之后仍会收到回答。 */
const PENDING_NOTICE = 'No answer batch arrived before the timeout. This is pending, not a skipped answer. '
  + 'Continue useful independent work. The user can still answer; their reply will arrive later as a user message '
  + 'identifying this callId and the original questions. Do not treat this as permission.'

/**
 * 官方 legacy `ask_user_question` 的参数结构基线(经 `skeleton()` 规范化后比较:只比参数名、
 * 类型与 required,不比说明文本——上游改文案不该让配置项停用,改契约必须停用)。
 *
 * **形状是编译后的 JSON Schema,不是 `defineTool` 的书写形态**:作者写的是
 * `{ questions: { type: 'array', required: true } }`,`defineTool` 会编译成
 * `{ type: 'object', properties, required: ['questions'] }`——必填是父节点的数组,
 * 不是子节点的布尔。基线照书写形态写会在第一次真实校验时判成「结构已变化」
 * (实测:面板整项被停用);核对依据是会话记录 `request/header` 里实际发给模型的 schema。
 */
const PARAMETER_BASELINE = {
  type: 'object',
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: true,
        properties: {
          id: { type: 'string' },
          question: { type: 'string' },
          header: { type: 'string' },
          options: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: true,
              properties: {
                label: { type: 'string' },
                description: { type: 'string' },
              },
              required: ['label'],
            },
          },
          multi_select: { type: 'boolean' },
        },
        required: ['id', 'question'],
      },
    },
  },
  required: ['questions'],
}

/** 键排序后的稳定序列化:结构相同即字符串相同。 */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    return `{${entries.map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

/** `required` 是集合语义,数组顺序不参与判定(排序只在本地副本上做,不动骨架产物)。 */
function sortRequired(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(sortRequired)
  if (typeof node !== 'object' || node === null) return node
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    out[key] = key === 'required' && Array.isArray(value)
      ? [...value].map(String).sort()
      : sortRequired(value)
  }
  return out
}

/** 参数结构指纹:剥掉说明文本、排序必填集合后按键排序序列化(与 `host/tools.ts` 的 skeleton 同口径)。 */
export function parameterStructure(parameters: unknown): string {
  return canonical(sortRequired(skeleton(parameters ?? { type: 'object', properties: {} })))
}

/** 基线指纹(面板与测试共用)。 */
export const ASK_PARAMETER_EXPECTED = parameterStructure(PARAMETER_BASELINE)

/** 改写项的状态;`compatible=false` 时面板禁用控件并显示 `reason`/`message`。 */
export interface AskToolStatus {
  readonly compatible: boolean
  /** 机器可读原因:`ok` / `missing` / `deferred` / `schema` / `unavailable`。 */
  readonly reason: 'ok' | 'missing' | 'deferred' | 'schema' | 'unavailable'
  /** 面向用户的一句话说明。 */
  readonly message: string
  readonly expected: string
  readonly actual: string | null
}

/** 宿主 ask 工具的定义最小面(只用到这些字段)。 */
interface AskDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>
  output: { schema: Record<string, unknown>; render(args: unknown, value: unknown): Array<{ type: 'text'; text: string }> }
  isConcurrencySafe?: () => boolean
  execute(args: Record<string, unknown> | undefined, exec: ToolExecContextLike): Promise<unknown>
}

/** 工具执行上下文的最小面(宿主 ToolRunContext 的子集)。 */
interface ToolExecContextLike {
  agent?: AgentLike | null
  signal?: AbortSignal | undefined
  callId?: unknown
}

/** 改写运行时:状态查询 + 按 agent 注册/撤销。 */
export interface AskShadowRuntime {
  /** 当前能否改写(取一份官方定义校验参数结构);面板据此禁用控件。 */
  status(): AskToolStatus
  /**
   * 为该 agent 注册遮蔽工具(B 档位值)。
   * @param agent - 目标根会话;拿不到 agent 作用域或参数不兼容时抛错(调用方记诊断)。
   * @param timeoutSec - `-1` 关闭超时;`N>0` N 秒后返回 pending。
   * @returns 撤销这次注册的 disposer。
   */
  register(agent: AgentLike, timeoutSec: number): () => void
}

type AskRequest = {
  questions: Array<Record<string, unknown>>
  agent?: AgentLike
  signal?: AbortSignal | undefined
  wait?: { callId: unknown }
}

/** 一条参数化请求:`ask_user_question` 的模型参数 → userQuestions 的服务请求。 */
function questionRequest(args: Record<string, unknown> | undefined, exec: ToolExecContextLike): AskRequest {
  const raw = Array.isArray(args?.['questions']) ? args['questions'] as Array<Record<string, unknown>> : []
  const questions = raw.map((question) => ({
    id: String(question?.['id'] ?? ''),
    question: String(question?.['question'] ?? ''),
    ...question?.['header'] !== undefined ? { header: String(question['header']) } : {},
    ...Array.isArray(question?.['options']) ? { options: question['options'] } : {},
    ...question?.['multi_select'] !== undefined ? { multiSelect: question['multi_select'] } : {},
  }))
  const request: AskRequest = { questions }
  if (exec.agent) request.agent = exec.agent
  if (exec.signal !== undefined) request.signal = exec.signal
  return request
}

/** 答案批次 → 模型可见输出(与官方 legacy 输出同形)。 */
function answerResult(result: unknown): { answers: Array<Record<string, unknown>> } {
  const answers = Array.isArray((result as { answers?: unknown })?.answers)
    ? (result as { answers: Array<Record<string, unknown>> }).answers
    : []
  return {
    answers: answers.map((answer) => ({
      id: String(answer?.['id'] ?? ''),
      selected: Array.isArray(answer?.['selected']) ? answer['selected'] : [],
      ...answer?.['custom'] !== undefined ? { custom: answer['custom'] } : {},
    })),
  }
}

/** 输出 schema:两种形态(答案批次 / pending),与官方 timed 定义一致。 */
const OUTPUT_SCHEMA = {
  oneOf: [
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        answers: {
          type: 'array',
          required: true,
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              id: { type: 'string', required: true },
              selected: { type: 'array', required: true, items: { type: 'string' } },
              custom: { type: 'string' },
            },
          },
        },
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        pending: { type: 'boolean', enum: [true], required: true },
        callId: { type: 'string', required: true },
        message: { type: 'string', required: true },
      },
    },
  ],
}

export function createAskShadowRuntime(ctx: HostContext, kit: SessionKit, note: (source: string, error: unknown) => void): AskShadowRuntime {
  /** 最近的探测结果:没有 live 会话时沿用上一次(面板不至于因为切走会话就抖动)。 */
  let cached: AskToolStatus | undefined

  function defineStatus(reason: AskToolStatus['reason'], message: string, actual: string | null): AskToolStatus {
    return {
      compatible: reason === 'ok',
      reason,
      message,
      expected: ASK_PARAMETER_EXPECTED,
      actual,
    }
  }

  /** 从某个作用域(没有就看全局)取官方定义;跳过本插件自己注册的延迟占位。 */
  function lookup(agent?: AgentLike): unknown {
    const tools = ctx.tools as {
      get?: (name: string, scope?: unknown) => unknown
      definitions?: (agent?: unknown) => unknown[]
    }
    let candidate: unknown
    if (typeof tools.get === 'function') {
      try {
        candidate = agent === undefined ? tools.get(ASK_TOOL_NAME) : tools.get(ASK_TOOL_NAME, agent)
      } catch {
        candidate = undefined
      }
    }
    if (candidate === undefined && typeof tools.definitions === 'function') {
      try {
        candidate = tools.definitions(agent).find((definition) => {
          const name = (definition as { name?: unknown } | null)?.name
          return name === ASK_TOOL_NAME
        })
      } catch {
        candidate = undefined
      }
    }
    return candidate
  }

  /** 官方定义是否可信:type 前缀的延迟占位不是真定义,不能拿来当基线。 */
  function isPlaceholder(definition: unknown): boolean {
    const description = (definition as { description?: unknown } | null)?.description
    return typeof description === 'string' && description.startsWith(DEFERRED_DESCRIPTION_PREFIX)
  }

  function probe(agent?: AgentLike): { definition?: AskDefinition; status: AskToolStatus } {
    const found = lookup(agent)
    if (found === undefined || found === null) {
      return { status: defineStatus('unavailable', '当前没有可读取的官方 ask_user_question 定义(需要至少一个 live 会话)', null) }
    }
    if (isPlaceholder(found)) {
      return { status: defineStatus('deferred', '该工具在当前档位被延迟加载(占位定义),无法校验官方参数;把「交互」组恢复注入后再试', null) }
    }
    const definition = found as AskDefinition
    if (typeof definition.execute !== 'function' || typeof definition.output?.render !== 'function') {
      return { status: defineStatus('missing', '拿到的 ask_user_question 定义缺少 execute/render,无法安全改写', null) }
    }
    const actual = parameterStructure(definition.parameters)
    if (actual !== ASK_PARAMETER_EXPECTED) {
      return { status: defineStatus('schema', '宿主 ask_user_question 的参数结构已变化,本项已自动停用(继续按旧参数改写会静默出错)', actual) }
    }
    return { definition, status: defineStatus('ok', '参数结构与基线一致', actual) }
  }

  function status(): AskToolStatus {
    // 优先用 live 根会话的作用域(能看见 preset 层),其次任意会话,最后沿用缓存。
    const agents = (() => {
      try {
        return ctx.agents.list()
      } catch {
        return []
      }
    })()
    const agent = agents.find((candidate) => kit.isRootAgent(candidate)) ?? agents[0]
    if (agent === undefined) return cached ?? defineStatus('unavailable', '当前没有 live 会话,无法校验官方 ask_user_question 定义', null)
    const result = probe(agent).status
    if (result.reason !== 'unavailable') cached = result
    return result
  }

  function register(agent: AgentLike, timeoutSec: number): () => void {
    const { definition, status: result } = probe(agent)
    if (definition === undefined) throw new Error(`ask_user_question 改写已停用:${result.message}`)
    const agentCtx = agent.ctx
    if (!agentCtx?.tools?.register) throw new Error('agent 没有可用的 tools 作用域')
    const userQuestions = (() => {
      try {
        return ctx.get('userQuestions') as
          | {
            ask(request: unknown): Promise<unknown>
            askTimed?(request: unknown, callId: unknown, timeoutMs: number): Promise<unknown>
          }
          | undefined
      } catch {
        return undefined
      }
    })()
    if (userQuestions === undefined) throw new Error('宿主没有 userQuestions 服务,无法注册 ask_user_question 改写')

    const shadow: AskDefinition = {
      ...definition,
      description: timeoutSec > 0
        ? `${definition.description} A pending result means the foreground wait expired; the questions remain answerable.`
        : definition.description,
      output: {
        schema: OUTPUT_SCHEMA,
        render: (args, value) => [{ type: 'text', text: JSON.stringify(value) }],
      },
      isConcurrencySafe: definition.isConcurrencySafe ?? (() => false),
      async execute(args, exec) {
        const request = questionRequest(args, exec)
        if (timeoutSec === -1) {
          const resultValue = await userQuestions.ask({ ...request, wait: { callId: exec.callId } })
          return answerResult(resultValue)
        }
        if (typeof userQuestions.askTimed !== 'function') {
          throw new Error('宿主 userQuestions 缺少 askTimed,无法按秒数等待')
        }
        const timed = await userQuestions.askTimed({ ...request }, exec.callId, timeoutSec * 1000)
        if ((timed as { pending?: unknown } | null)?.pending === true) {
          return { pending: true, callId: String(exec.callId ?? ''), message: PENDING_NOTICE }
        }
        return answerResult(timed)
      },
    }
    try {
      return agentCtx.tools.register(shadow as unknown as ToolDefinition<unknown>) as () => void
    } catch (error) {
      note('ask shadow register', error)
      throw error
    }
  }

  return { status, register }
}

/**
 * ask_user_question 的档位改写:官方参数结构校验 + 遮蔽工具的注册与执行分支。
 *
 * 这里钉住三件事:
 * 1. 基线指纹与宿主 legacy 工具的真实参数结构一致(上游改契约会立刻体现为不兼容);
 * 2. 结构不匹配时 register 抛错(档位不注册遮蔽,面板据此停用控件);
 * 3. 两种等待分支的请求形状:关闭超时走 ask + wait.callId,N 秒走 askTimed。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { ASK_PARAMETER_EXPECTED, createAskShadowRuntime, parameterStructure } from '../src/host/ask-shadow.ts'

/**
 * 宿主 `@deepseek-ai/dsh-tool-ask-user` legacy 定义编译后的参数结构:
 * `defineTool` 把书写形态的 `required: true` 编译成父节点的 `required: [...]` 数组,
 * 这里抄的是会话记录 `request/header` 里实际发给模型的 schema(只保留结构相关字段)。
 */
const OFFICIAL_PARAMETERS = {
  type: 'object',
  properties: {
    questions: {
      type: 'array',
      description: 'Questions to ask the user before continuing.',
      items: {
        type: 'object',
        additionalProperties: true,
        properties: {
          id: { type: 'string', description: 'Stable id for this question; echoed in the answer.' },
          question: { type: 'string', description: 'The specific question to ask the user.' },
          header: { type: 'string', description: 'Optional short heading.' },
          options: {
            type: 'array',
            description: 'Optional choices to show the user.',
            items: {
              type: 'object',
              additionalProperties: true,
              properties: {
                label: { type: 'string', description: 'Short user-facing option label.' },
                description: { type: 'string', description: 'One sentence explaining the tradeoff.' },
              },
              required: ['label'],
            },
          },
          multi_select: { type: 'boolean', description: 'Whether the user may select more than one option.' },
        },
        required: ['id', 'question'],
      },
    },
  },
  required: ['questions'],
}

const officialDefinition = (parameters = OFFICIAL_PARAMETERS) => ({
  name: 'ask_user_question',
  description: 'Ask the user a concise question.',
  parameters,
  output: { schema: { type: 'object', properties: {} }, render: () => [{ type: 'text', text: '{}' }] },
  execute: async () => ({ answers: [] }),
})

const kit = { isRootAgent: () => true, sessionIdOf: () => 'session-1' }

/** 记录注册的假 context:根 tools.get 给官方定义,agent 作用域 tools.register 收遮蔽。 */
function makeContext({ definition = officialDefinition(), questions = {} } = {}) {
  const shadow = { registered: [], disposed: 0 }
  const agent = {
    id: 'agent-1',
    ctx: {
      tools: {
        register: (next) => {
          shadow.registered.push(next)
          return () => { shadow.disposed += 1 }
        },
      },
    },
  }
  const calls = { ask: [], askTimed: [] }
  const ctx = {
    get(name) {
      if (name !== 'userQuestions') return undefined
      return {
        ask: async (request) => {
          calls.ask.push(request)
          return questions.ask ?? { answers: [{ id: 'scope', selected: ['A'] }] }
        },
        askTimed: async (request, callId, timeoutMs) => {
          calls.askTimed.push({ request, callId, timeoutMs })
          return questions.askTimed ?? { pending: true, callId }
        },
      }
    },
    tools: {
      get: () => definition,
      definitions: () => [definition],
    },
    agents: { list: () => [agent] },
    on: () => () => {},
    inject: () => {},
    effect: () => {},
  }
  return { ctx, agent, shadow, calls }
}

test('基线指纹就是宿主 legacy 工具的参数结构(只比结构,不比说明文本)', () => {
  assert.equal(parameterStructure(OFFICIAL_PARAMETERS), ASK_PARAMETER_EXPECTED)
  // 说明文本变化不影响判定。
  const reworded = structuredClone(OFFICIAL_PARAMETERS)
  reworded.properties.questions.items.properties.id.description = '改了措辞'
  assert.equal(parameterStructure(reworded), ASK_PARAMETER_EXPECTED)
  // 必填集合的顺序不影响判定。
  const reordered = structuredClone(OFFICIAL_PARAMETERS)
  reordered.properties.questions.items.required = ['question', 'id']
  assert.equal(parameterStructure(reordered), ASK_PARAMETER_EXPECTED)
  // 书写形态(`required: true` 布尔)是 `defineTool` 的输入,不是注册表里的定义,必须判为不兼容。
  const authoring = { questions: { type: 'array', required: true, items: { type: 'object', properties: {} } } }
  assert.notEqual(parameterStructure(authoring), ASK_PARAMETER_EXPECTED)
})

test('参数结构变化(改名 / 改类型 / 加必填)一律判为不兼容', () => {
  const renamed = structuredClone(OFFICIAL_PARAMETERS)
  renamed.properties.questions.items.properties.multiSelect = renamed.properties.questions.items.properties.multi_select
  delete renamed.properties.questions.items.properties.multi_select
  assert.notEqual(parameterStructure(renamed), ASK_PARAMETER_EXPECTED)

  const retyped = structuredClone(OFFICIAL_PARAMETERS)
  retyped.properties.questions.items.properties.header.type = 'number'
  assert.notEqual(parameterStructure(retyped), ASK_PARAMETER_EXPECTED)

  const addedRequired = structuredClone(OFFICIAL_PARAMETERS)
  addedRequired.properties.timeout = { type: 'integer' }
  addedRequired.required.push('timeout')
  assert.notEqual(parameterStructure(addedRequired), ASK_PARAMETER_EXPECTED)
})

test('status:结构一致 → compatible;抓不到定义或拿到延迟占位 → 不可用', () => {
  const ok = makeContext()
  const runtime = createAskShadowRuntime(ok.ctx, kit, () => {})
  assert.equal(runtime.status().compatible, true)
  assert.equal(runtime.status().reason, 'ok')

  const changed = makeContext({ definition: officialDefinition({ type: 'object', properties: { items: { type: 'array' } } }) })
  const changedStatus = createAskShadowRuntime(changed.ctx, kit, () => {}).status()
  assert.equal(changedStatus.compatible, false)
  assert.equal(changedStatus.reason, 'schema')

  const missing = makeContext({ definition: undefined })
  missing.ctx.tools.get = () => undefined
  missing.ctx.tools.definitions = () => []
  const missingStatus = createAskShadowRuntime(missing.ctx, kit, () => {}).status()
  assert.equal(missingStatus.compatible, false)
  assert.equal(missingStatus.reason, 'unavailable')

  const deferred = makeContext({ definition: { ...officialDefinition(), description: '【延迟】提问（完整参数用 tool_search）' } })
  const deferredStatus = createAskShadowRuntime(deferred.ctx, kit, () => {}).status()
  assert.equal(deferredStatus.compatible, false)
  assert.equal(deferredStatus.reason, 'deferred')
})

test('register:结构不匹配时拒绝注册(档位不写遮蔽)', () => {
  const changed = makeContext({ definition: officialDefinition({ type: 'object', properties: {} }) })
  const runtime = createAskShadowRuntime(changed.ctx, kit, () => {})
  assert.throws(() => runtime.register(changed.agent, -1), /已停用/)
  assert.equal(changed.shadow.registered.length, 0)
})

test('关闭超时(-1):走 ask + wait.callId,返回答案批次', async () => {
  const fake = makeContext()
  const runtime = createAskShadowRuntime(fake.ctx, kit, () => {})
  const dispose = runtime.register(fake.agent, -1)
  assert.equal(fake.shadow.registered.length, 1)
  const shadow = fake.shadow.registered[0]

  assert.equal(shadow.name, 'ask_user_question')
  // parameters 始终来自官方定义:遮蔽只换 execute/output/description。
  assert.deepEqual(shadow.parameters.properties.questions, OFFICIAL_PARAMETERS.properties.questions)
  const value = await shadow.execute(
    { questions: [{ id: 'scope', question: '要哪个?', header: '范围', options: [{ label: 'A' }], multi_select: true }] },
    { agent: fake.agent, callId: 'call-1', signal: undefined },
  )
  assert.deepEqual(value, { answers: [{ id: 'scope', selected: ['A'] }] })
  assert.equal(fake.calls.ask.length, 1)
  assert.deepEqual(fake.calls.ask[0].wait, { callId: 'call-1' })
  assert.equal(fake.calls.ask[0].agent, fake.agent)
  assert.deepEqual(fake.calls.ask[0].questions[0].multiSelect, true)

  dispose()
  assert.equal(fake.shadow.disposed, 1)
})

test('按秒等待(N):走 askTimed,pending 结果原样回给模型', async () => {
  const fake = makeContext()
  const runtime = createAskShadowRuntime(fake.ctx, kit, () => {})
  runtime.register(fake.agent, 60)
  const shadow = fake.shadow.registered[0]
  const value = await shadow.execute(
    { questions: [{ id: 'scope', question: '要哪个?' }] },
    { agent: fake.agent, callId: 'call-2' },
  )
  assert.equal(fake.calls.askTimed.length, 1)
  assert.equal(fake.calls.askTimed[0].timeoutMs, 60_000)
  assert.equal(fake.calls.askTimed[0].callId, 'call-2')
  assert.equal(value.pending, true)
  assert.equal(value.callId, 'call-2')
  assert.match(value.message, /pending, not a skipped answer/)
})

test('按秒等待(N):窗口内回答 → 返回答案批次', async () => {
  const fake = makeContext({ questions: { askTimed: { answers: [{ id: 'scope', selected: ['B'], custom: '补充' }] } } })
  const runtime = createAskShadowRuntime(fake.ctx, kit, () => {})
  runtime.register(fake.agent, 30)
  const value = await fake.shadow.registered[0].execute(
    { questions: [{ id: 'scope', question: '要哪个?' }] },
    { agent: fake.agent, callId: 'call-3' },
  )
  assert.deepEqual(value, { answers: [{ id: 'scope', selected: ['B'], custom: '补充' }] })
})

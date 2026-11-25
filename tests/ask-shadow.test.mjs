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
import { OFFICIAL_PARAMETERS, officialDefinition } from './fixtures/ask-tool.mjs'
import { assertHostOutputSchema } from './host-schema.mjs'

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

test('compose:延迟形态 = 【延迟】摘要 + 骨架参数,执行仍是改写', async () => {
  const fake = makeContext()
  const runtime = createAskShadowRuntime(fake.ctx, kit, () => {})
  const merged = runtime.compose(officialDefinition(), -1, { summary: '向用户提问' })
  assert.equal(merged.description, '【延迟】向用户提问（完整参数用 tool_search）')
  // 参数只留骨架:名称与类型在,说明文本没了,必填集合保留。
  const questions = merged.parameters.properties.questions
  assert.equal(questions.type, 'array')
  assert.equal(questions.description, undefined)
  assert.equal(questions.items.properties.id.description, undefined)
  assert.equal(questions.items.properties.multi_select.type, 'boolean')
  assert.deepEqual(merged.parameters.required, ['questions'])
  // 输出是改写的两种形态,执行走 ask + wait.callId(与工具已注入的档位同一份实现)。
  assert.equal(merged.output.schema.oneOf.length, 2)
  const value = await merged.execute(
    { questions: [{ id: 'scope', question: '要哪个?' }] },
    { agent: fake.agent, callId: 'call-9' },
  )
  assert.deepEqual(value, { answers: [{ id: 'scope', selected: ['A'] }] })
  assert.deepEqual(fake.calls.ask[0].wait, { callId: 'call-9' })
  // compose 只组装,不注册。
  assert.equal(fake.shadow.registered.length, 0)
})

test('compose:延迟形态按秒等待,到点返回 pending', async () => {
  const fake = makeContext()
  const runtime = createAskShadowRuntime(fake.ctx, kit, () => {})
  const merged = runtime.compose(officialDefinition(), 20, { summary: '提问' })
  const value = await merged.execute(
    { questions: [{ id: 'scope', question: '要哪个?' }] },
    { agent: fake.agent, callId: 'call-10' },
  )
  assert.equal(fake.calls.askTimed[0].timeoutMs, 20_000)
  assert.equal(value.pending, true)
})

test('compose:结构不符或没有 userQuestions 时抛错(调用方降级成纯占位)', () => {
  const changed = makeContext({ definition: officialDefinition({ type: 'object', properties: {} }) })
  const runtime = createAskShadowRuntime(changed.ctx, kit, () => {})
  assert.throws(
    () => runtime.compose(officialDefinition({ type: 'object', properties: {} }), -1, { summary: 'x' }),
    /已停用/,
  )

  const noService = makeContext()
  noService.ctx.get = () => undefined
  const bare = createAskShadowRuntime(noService.ctx, kit, () => {})
  assert.throws(() => bare.compose(officialDefinition(), -1), /userQuestions/)
})

test('compose:输出 schema 必须是注册表方言(required 只能是父节点数组)', () => {
  const fake = makeContext()
  const runtime = createAskShadowRuntime(fake.ctx, kit, () => {})
  const schema = runtime.compose(officialDefinition(), -1, { summary: 'x' }).output.schema
  assert.equal(schema.oneOf.length, 2)

  // 属性节点上的 required 布尔会被宿主 tools.register 直接拒掉,整个定义连同占位一起消失;
  // 共享镜像(`tests/host-schema.mjs`)照抄宿主的方言,这里直接用它兜底。
  assertHostOutputSchema(schema, 'compose output')

  // 两个分支的必填集合都写在对象上。
  assert.deepEqual(schema.oneOf[0].required, ['answers'])
  assert.deepEqual(schema.oneOf[1].required.slice().sort(), ['callId', 'message', 'pending'])
  assert.deepEqual(schema.oneOf[0].properties.answers.items.required, ['id', 'selected'])
})

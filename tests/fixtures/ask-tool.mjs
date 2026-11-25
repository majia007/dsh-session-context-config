/**
 * 宿主 `@deepseek-ai/dsh-tool-ask-user` legacy 定义的测试夹具(参数校验与档位应用两个测试共用)。
 *
 * `defineTool` 把书写形态的 `required: true` 编译成父节点的 `required: [...]` 数组,
 * 这里抄的是会话记录 `request/header` 里实际发给模型的 schema(只保留结构相关字段)。
 */
export const OFFICIAL_PARAMETERS = {
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

/** 官方定义最小面:改写校验要求 execute 与 output.render 齐备。 */
export function officialDefinition(parameters = OFFICIAL_PARAMETERS) {
  return {
    name: 'ask_user_question',
    description: 'Ask the user a concise question.',
    parameters,
    output: { schema: { type: 'object', properties: {} }, render: () => [{ type: 'text', text: '{}' }] },
    execute: async () => ({ answers: [] }),
  }
}

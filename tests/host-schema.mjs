// generated from _shared/test/host-schema.mjs@18ad158c5b71e8036c92f7f00e7a60e32c9de54e8d25c220a87ee477906ce216 — do not edit
/**
 * 宿主 `tools.register` 的 output schema 方言镜像（测试侧共享门禁，生成文件）。
 *
 * 为什么需要它：假 ctx 的 `tools.register` 什么都收，单测只证明「在期望时机调用了期望
 * 服务」，证明不了「宿主会不会接受这份定义」。宿主的校验只在运行期发生，被插件 catch 掉
 * 后只剩一条诊断——实测有个功能因此静默坏了很久：`OUTPUT_SCHEMA` 写成 `defineTool` 的
 * 书写形态（属性节点上的 `required: true`），宿主按编译后的 JSON Schema 方言直接拒绝整份
 * 定义，连延迟占位一起消失。
 *
 * 镜像范围（与 DSH 0.2.2-rc.5 的 `packages/core/tools/src/json-schema.ts` 对齐）：
 * - 只认 `type` / `oneOf` / `properties` / `required` / `additionalProperties` / `items` /
 *   `enum` / `const` + 注解 `description` / `title` / `default` / `examples`；
 * - `required` 必须是**父对象上的字符串数组**，且每个名字都要在 `properties` 里；
 * - `type` 只能单值；`oneOf` 至少两分支、旁边不许有兄弟约束键；`type` 与 `oneOf` 互斥；
 * - `properties`/`required`/`additionalProperties` 只在 object 上，`items` 只在 array 上，
 *   `enum`/`const` 只在标量上且类型相符。
 *
 * 有意不复刻的部分：注解值是否为无损 JSON（`default`/`examples`）、环引用检测、超深嵌套的
 * 栈安全遍历。镜像只用于在测试里挡住「注册会被宿主拒绝」这类错误，不替代宿主校验；DSH 升级
 * 后按 checkout 复核上面那份规则表。
 */

const TYPES = ['object', 'array', 'string', 'number', 'integer', 'boolean', 'null']
const CONSTRAINT_KEYS = new Set(['type', 'oneOf', 'properties', 'required', 'additionalProperties', 'items', 'enum', 'const'])
const ANNOTATION_KEYS = new Set(['description', 'title', 'default', 'examples'])
/** 离了 `type`/`oneOf` 就没有意义的约束键；也是 `oneOf` 旁边不许出现的兄弟键。 */
const SIBLING_KEYS = ['properties', 'required', 'additionalProperties', 'items', 'enum', 'const']
/** 各约束键允许出现在哪些 `type` 上。 */
const ALLOWED_ON = {
  properties: ['object'],
  required: ['object'],
  additionalProperties: ['object'],
  items: ['array'],
  enum: ['string', 'number', 'integer', 'boolean', 'null'],
  const: ['string', 'number', 'integer', 'boolean', 'null'],
}
const KEYWORD_LIST = 'type/oneOf/properties/required/additionalProperties/items/enum/const + annotations'

function isPlainRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isScalarOf(type, value) {
  switch (type) {
    case 'string': return typeof value === 'string'
    case 'number': return typeof value === 'number' && Number.isFinite(value) && !Object.is(value, -0)
    case 'integer': return typeof value === 'number' && Number.isInteger(value) && !Object.is(value, -0)
    case 'boolean': return typeof value === 'boolean'
    case 'null': return value === null
    default: return false
  }
}

function checkNode(node, path, violations) {
  if (!isPlainRecord(node)) {
    violations.push(`${path} must be a schema object`)
    return
  }
  for (const key of Object.keys(node)) {
    if (CONSTRAINT_KEYS.has(key)) continue
    if (ANNOTATION_KEYS.has(key)) {
      if ((key === 'description' || key === 'title') && typeof node[key] !== 'string') {
        violations.push(`${path}.${key} must be a string`)
      }
      continue
    }
    violations.push(`${path}.${key} is not a supported keyword (subset: ${KEYWORD_LIST})`)
  }

  const hasType = Object.hasOwn(node, 'type')
  const hasOneOf = Object.hasOwn(node, 'oneOf')
  if (hasType && hasOneOf) {
    violations.push(`${path} cannot declare both type and oneOf`)
    return
  }
  if (!hasType && !hasOneOf) {
    for (const key of SIBLING_KEYS) {
      if (Object.hasOwn(node, key)) violations.push(`${path}.${key} requires type or oneOf`)
    }
    return
  }

  if (hasOneOf) {
    for (const key of SIBLING_KEYS) {
      if (Object.hasOwn(node, key)) violations.push(`${path}.${key} is not supported beside oneOf`)
    }
    const branches = node.oneOf
    if (!Array.isArray(branches) || branches.length < 2) {
      violations.push(`${path}.oneOf must be an array of at least two schemas`)
      return
    }
    branches.forEach((branch, index) => checkNode(branch, `${path}.oneOf[${index}]`, violations))
    return
  }

  const type = node.type
  if (typeof type !== 'string' || !TYPES.includes(type)) {
    violations.push(Array.isArray(type)
      ? `${path}.type must be a single type string (type arrays are not supported)`
      : `${path}.type must be one of ${TYPES.join('/')}`)
    return
  }
  for (const [key, types] of Object.entries(ALLOWED_ON)) {
    if (Object.hasOwn(node, key) && !types.includes(type)) {
      violations.push(`${path}.${key} is not supported on type "${type}"`)
    }
  }

  if (type === 'object') {
    const properties = Object.hasOwn(node, 'properties') ? node.properties : undefined
    if (Object.hasOwn(node, 'properties')) {
      if (!isPlainRecord(properties)) violations.push(`${path}.properties must be an object of schemas`)
      else for (const [name, child] of Object.entries(properties)) checkNode(child, `${path}.properties.${name}`, violations)
    }
    if (Object.hasOwn(node, 'required')) {
      const required = node.required
      if (!Array.isArray(required) || required.some((entry) => typeof entry !== 'string')) {
        violations.push(`${path}.required must be an array of strings`)
      } else {
        const declared = isPlainRecord(properties) ? properties : {}
        for (const key of required) {
          if (!Object.hasOwn(declared, key)) violations.push(`${path}.required names "${key}" which is not in properties`)
        }
      }
    }
    if (Object.hasOwn(node, 'additionalProperties') && typeof node.additionalProperties !== 'boolean') {
      violations.push(`${path}.additionalProperties must be a boolean`)
    }
    return
  }

  if (type === 'array') {
    if (Object.hasOwn(node, 'items')) checkNode(node.items, `${path}.items`, violations)
    return
  }

  const hasEnum = Object.hasOwn(node, 'enum')
  const allowed = node.enum
  const enumValid = Array.isArray(allowed) && allowed.length > 0 && allowed.every((entry) => isScalarOf(type, entry))
  if (hasEnum && !enumValid) violations.push(`${path}.enum must be a non-empty array of ${type} values`)
  if (Object.hasOwn(node, 'const')) {
    if (!isScalarOf(type, node.const)) violations.push(`${path}.const must be a ${type} value`)
    else if (enumValid && !allowed.includes(node.const)) violations.push(`${path}.const must be one of ${path}.enum when both are declared`)
  }
}

/**
 * 收集一处 schema 的全部方言违规（空数组 = 宿主会接受）。
 * @param schema - 候选 schema；`undefined` 视为没有 schema（返回空）。
 * @param path - 报错路径前缀，默认 `schema`（与宿主诊断同形）。
 */
export function hostSchemaViolations(schema, path = 'schema') {
  if (schema === undefined) return []
  const violations = []
  checkNode(schema, path, violations)
  return violations
}

/**
 * 断言一份**输出** schema 会被宿主 `tools.register` 接受。
 *
 * 只该用在 `definition.output.schema` 上：宿主的注册校验只覆盖 output，参数 schema 不在
 * 这一步校验（MCP 工具参数里的 `pattern` / `$schema` 能正常注册），套到参数上会误伤。
 * @param schema - `definition.output.schema`
 * @param label - 报错时标注是哪个工具/定义
 */
export function assertHostOutputSchema(schema, label = 'output.schema') {
  if (schema === undefined) return
  const violations = hostSchemaViolations(schema)
  if (violations.length === 0) return
  throw new Error(`unsupported JSON schema (${label}): ${violations.join('; ')}`)
}

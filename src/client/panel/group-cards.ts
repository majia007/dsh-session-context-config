/** 工具行(组卡片的行级构件)。 */
import { createElement as h, type ReactElement } from 'react'
import { SegmentedControl, Tag, type TagTone } from '@deepseek-ai/dsh-client-ui-primitives'
import { effective, formatTokens, ON } from '../state/resolve.ts'
import type { CatalogTool, Profile } from '../contract/types.ts'
import { TOOL_STATES } from './options.ts'
import { ToolDescription } from './ToolDescription.ts'
import styles from './panel.module.css'

/** 生效状态标签与分段选择同一套词：注入显示「开启」、隐藏显示「关闭」。 */
const ROW_LABEL: Record<string, string> = { on: '开启', defer: '延迟', off: '关闭', force: '开启' }

/** 本行选择的措辞直接取分段选择表:on 是「默认」(跟随组),不能写成「开启」。 */
const choiceLabel = (value: string): string => TOOL_STATES.find((option) => option.value === value)?.label ?? value

/** 状态色调跟宿主 Tag 的语义走:启用=success、延迟=warning、隐藏=中性灰。 */
const TAG_TONE: Record<string, TagTone> = { on: 'success', defer: 'warning', off: 'neutral', force: 'success' }

/** 每个工具都贴最终生效状态;被组/server 改写时补一条 tooltip 说明本行选择。 */
export function stateTag(effectiveState: string, rowState: string): ReactElement {
  const label = ROW_LABEL[effectiveState] ?? effectiveState
  const overridden = effectiveState !== rowState
  return h(
    'span',
    {
      className: styles.stateTag,
      title: overridden
        ? `由组 / server 决定：生效 ${label}（本行选择：${choiceLabel(rowState)}）`
        : undefined,
    },
    h(Tag, { tone: TAG_TONE[effectiveState] ?? 'outline', className: styles.stateTagInner }, label),
  )
}

/** 该工具的估算 token 占用,用默认(描边灰)标签,与状态标签并排。 */
function tokenTag(tokens: number): ReactElement {
  return h(
    'span',
    { className: styles.tokenTag, title: '工具定义（名字 + 描述 + 参数）的估算占用' },
    h(Tag, null, `≈${formatTokens(tokens)}`),
  )
}

/** 工具来源:插件标题优先,拿不到就用包短名;完整依据(包名/入口/判定)在 tooltip 里。 */
function sourceLine(tool: CatalogTool): ReactElement {
  const source = tool.source
  return h(
    'span',
    {
      className: `${styles.source}${source?.evidence === 'scan' ? ` ${styles.sourceInferred}` : ''}`,
      title: source?.detail ?? '宿主不提供工具归属信息，且本插件装载前注册的工具无法回溯。',
    },
    `来源 · ${source?.label ?? '未识别'}`,
  )
}

export function toolRow(tool: CatalogTool, profile: Profile, setToolState: (toolName: string, state: string) => void): ReactElement {
  const state = effective(profile, tool)
  const raw = profile.tools?.[tool.name] ?? ON
  return h(
    'div',
    { className: styles.tool, key: tool.name },
    h(
      'span',
      { className: styles.nameCell },
      h(
        'span',
        { className: styles.nameLine },
        h('span', { className: styles.nm, title: tool.name }, tool.name),
        stateTag(state, raw),
        tokenTag(tool.tokens),
      ),
      sourceLine(tool),
    ),
    h(ToolDescription, { name: tool.name, text: tool.description ?? '' }),
    h(
      'span',
      { className: styles.control },
      h(SegmentedControl, {
        id: `scc-tool-${tool.name}`,
        value: raw,
        options: TOOL_STATES,
        onChange: (next) => setToolState(tool.name, next),
        label: `${tool.name} 状态`,
      }),
    ),
  )
}

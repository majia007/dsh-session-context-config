/** 工具行与目录摘要输入(组卡片的行级构件)。 */
import { createElement as h, type ReactElement } from 'react'
import { Choice } from '../menu/controls.ts'
import { effective, formatTokens, ON, STATE_LABEL } from '../state/resolve.ts'
import type { CatalogTool, Profile } from '../contract/types.ts'
import { TOOL_STATES } from './options.ts'
import styles from './panel.module.css'

type Patch = (mutate: (target: Profile) => void) => void

export function toolRow(tool: CatalogTool, profile: Profile, setToolState: (toolName: string, state: string) => void): ReactElement {
  const state = effective(profile, tool)
  const raw = profile.tools?.[tool.name] ?? ON
  // 生效状态被组/server 改写时,只在固定宽度的小列里标出「→延迟」这类结果;
  // 未改写时留空,避免每行重复一个与选中段相同的徽标。
  return h(
    'div',
    { className: styles.tool, key: tool.name },
    h('span', { className: styles.nm, title: tool.name }, tool.name),
    h('span', { className: styles.zh }, tool.server ? '' : tool.description ?? ''),
    h('span', { className: styles.cost }, `≈${formatTokens(tool.tokens)}`),
    h(
      'span',
      {
        className: styles.shift,
        'data-s': state,
        title: state !== raw ? `生效：${STATE_LABEL[state]}（工具级记录：${STATE_LABEL[raw]}）` : undefined,
      },
      state !== raw ? `→${state === ON ? '开启' : STATE_LABEL[state]}` : '',
    ),
    h(Choice, {
      small: true,
      value: raw,
      options: TOOL_STATES,
      onChange: (next) => setToolState(tool.name, next),
      name: `scc-tool-${tool.name}`,
      label: `${tool.name} 状态`,
    }),
  )
}

/** 目录摘要输入:summaryKey 命中时显示,值写进 profile.summaries。 */
export function summaryInput(key: string, hint: string, profile: Profile, summaryKey: string | null, patch: Patch): ReactElement | null {
  return summaryKey === key
    ? h(
        'div',
        { className: styles.field, style: { margin: '4px 0 8px' } },
        h('input', {
          className: styles.input,
          value: profile.summaries?.[key] ?? '',
          placeholder: hint,
          onChange: (event: { target: { value: string } }) => {
            const value = event.target.value
            patch((target) => {
              if (value.trim()) target.summaries[key] = value
              else delete target.summaries[key]
            })
          },
        }),
      )
    : null
}

/** 组头部的状态徽标说明(server 生效状态被组改写时的「→开启」小列)。 */
export function shiftBadge(serverEffective: string, serverState: string): ReactElement {
  return h(
    'span',
    {
      className: styles.shift,
      'data-s': serverEffective,
      title: serverEffective !== serverState ? `生效：${STATE_LABEL[serverEffective]}` : undefined,
    },
    serverEffective !== serverState ? `→${serverEffective === ON ? '开启' : STATE_LABEL[serverEffective]}` : '',
  )
}

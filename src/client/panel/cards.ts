/** 配置卡片:按最终请求里的消息分卡;system 卡内每段单独开关。 */
import { createElement as h, Fragment, type ReactElement, type ReactNode } from 'react'
import { BASELINE_DEFAULTS, BASELINE_TEXT } from '../../baseline.ts'
import { OFF } from '../state/resolve.ts'
import type { BaselineState, Profile, Snapshot } from '../contract/types.ts'
import { CONTEXT_SWITCHES, SECTION_OPTIONS, inferSectionOption, type ChannelCardOption, type SectionOption } from './options.ts'
import styles from './panel.module.css'

type Patch = (mutate: (target: Profile) => void) => void

export interface PanelDraft {
  profiles: Profile[]
  lastUsedId: string
  baseline: BaselineState
}

type SectionEntry = Snapshot['sections'][number]

/** 快照缺 baseline 字段时的兜底(正常链路 Host 总是返回完整值,这里只为类型完整)。 */
export const DEFAULT_BASELINE: BaselineState = { ...BASELINE_DEFAULTS, customText: '' }

/** 附加规则由全局 baseline 开关控制,在列表末尾单独渲染,不进 `profile.sections`。 */
const BASELINE_NAMES = new Set([
  'session-context-config:contract',
  'session-context-config:card-receipt',
  'session-context-config:untrusted-files',
  'session-context-config:custom-text',
])

function MessageCard({ role, title, note, children }: {
  role: 'developer' | 'user'
  title: string
  note: string
  children?: ReactNode
}): ReactElement {
  return h(
    'section',
    { className: `${styles.card} ${styles.msgCard}` },
    h(
      'div',
      { className: styles.msgHead },
      h(
        'div',
        { className: styles.msgTitleRow },
        h('h2', { className: styles.msgCardTitle }, title),
        h('span', { className: `${styles.msgBadge} ${role === 'developer' ? styles.msgBadgeSystem : ''}` }, `role: ${role}`),
      ),
      h('p', { className: styles.msgNote }, note),
    ),
    h('div', { className: styles.msgBody }, children),
  )
}

/** 分区小标题 + 说明 + 分割线:用于区分本插件附加内容与工具目录。 */
export function SectionHeading({ title, desc }: { title: string; desc: string }): ReactElement {
  return h(
    'div',
    { className: styles.sectionHead },
    h('div', { className: styles.sectionTitle }, title),
    h('p', { className: styles.sectionDesc }, desc),
  )
}

function Tags({ names, tags }: { names?: string[]; tags?: string[] }): ReactElement {
  return h(
    'span',
    { className: styles.tags },
    ...(names ?? []).map((name) => h('span', { className: styles.codeChip, key: name }, name)),
    ...(tags ?? []).map((tag) => h('span', { className: styles.tag, key: tag }, tag)),
  )
}

function SegmentRow({ checked, onChange, title, desc, meta, disabled, tooltip }: {
  checked: boolean
  onChange(checked: boolean): void
  title: ReactNode
  desc: ReactNode
  meta?: ReactNode
  disabled?: boolean
  /** 悬停整行显示的文本;HTML title 里的 \n 会被浏览器渲染成换行。 */
  tooltip?: string
}): ReactElement {
  return h(
    'label',
    { className: `${styles.segment}${disabled ? ` ${styles.segmentOff}` : ''}`, title: tooltip },
    h('input', {
      type: 'checkbox',
      checked,
      disabled: disabled === true,
      onChange: (event: { target: { checked: boolean } }) => onChange(event.target.checked),
    }),
    h(
      'span',
      { className: styles.segmentBody },
      h(
        'span',
        { className: styles.segmentTitle },
        title,
        meta === undefined ? null : h('span', { className: styles.segmentMeta }, meta),
      ),
      h('span', { className: styles.segmentDesc }, desc),
    ),
  )
}

function baselineRows(draft: PanelDraft, patchBaseline: (key: string, value: boolean | string) => void): ReactElement[] {
  const rows: Array<{ key: 'contract' | 'cardReceipt' | 'untrustedFiles'; label: string; name: string; desc: string; text: string }> = [
    { key: 'contract', label: '行为契约', name: 'session-context-config:contract', desc: '不可逆动作先确认、如实汇报、信息足够就行动、跟随周边风格等 6 条。', text: BASELINE_TEXT.contract },
    { key: 'cardReceipt', label: '卡片回执', name: 'session-context-config:card-receipt', desc: 'UI 已渲染卡片时只回一句确认，不复述字段；失败仍给细节。', text: BASELINE_TEXT.cardReceipt },
    { key: 'untrustedFiles', label: '不可信下载', name: 'session-context-config:untrusted-files', desc: '隔离目录、路径传参、python -I 三条读取规则。', text: BASELINE_TEXT.untrustedFiles },
  ]
  const baseline = draft?.baseline
  const customOn = baseline?.custom === true
  const customText = baseline?.customText ?? ''
  const customMeta = !customOn
    ? '未勾选 · 可先编辑'
    : customText.trim() ? `注入 · ${customText.length} 字` : '已勾选 · 空文本不发送'
  return [
    ...rows.map((row) => h(SegmentRow, {
      key: row.key,
      checked: baseline?.[row.key] !== false,
      onChange: (checked) => patchBaseline(row.key, checked),
      // tooltip 是原样注入 system 的全文;文本里的 \n 在悬停提示里显示为换行。
      tooltip: row.text,
      title: h('span', { className: styles.segmentLabel }, row.label, h(Tags, { names: [row.name], tags: ['全局'] })),
      desc: row.desc,
    })),
    h(SegmentRow, {
      key: 'custom',
      checked: customOn,
      onChange: (checked) => patchBaseline('custom', checked),
      tooltip: customText.trim() ? customText : undefined,
      title: h('span', { className: styles.segmentLabel }, '自定义文本', h(Tags, { names: ['session-context-config:custom-text'], tags: ['全局'] })),
      desc: '自由输入的提示词；勾选后对所有会话与子代理生效，留空不发送。',
      meta: customMeta,
    }),
    h('textarea', {
      key: 'customText',
      className: styles.textarea,
      'aria-label': '自定义附加文本',
      value: customText,
      maxLength: 20000,
      // 未勾选也允许编辑:先写好文本,再勾选开关生效。
      placeholder: '输入要附加的文本（支持多行）；勾选上方开关后注入。',
      onChange: (event: { target: { value: string } }) => {
        patchBaseline('customText', event.target.value)
      },
    }),
  ]
}

/**
 * 段列表按**实际装配顺序**排列:目录里出现的段直接用它在 assembly.sections 的
 * 下标(宿主已按 order 排好);当前没出现的已知段按静态 order 插到对应位置。
 * 人设两个固定槽位始终出现(prefix order 0 / suffix 10200),即使当前文本为空。
 */
function orderedSections(sections: SectionEntry[], disabled: Set<string>): SectionOption[] {
  const index = new Map(sections.map((section, position) => [section.name, position]))
  // 工具引导段(tool:*)跟随工具可用性:工具隐藏时宿主不再产出文本,不在这里配置。
  const isToolGuide = (name: string): boolean => name.startsWith('tool:')
  const options = new Map<string, SectionOption>()
  // 静态目录只用来补已知段的文案/顺序:当前既不出现、也没被关掉的段不展示,
  // 免得条件段(计划/团队/MCP)和未安装工具把列表塞满"当前未出现"。
  for (const option of SECTION_OPTIONS) {
    if (BASELINE_NAMES.has(option.name) || isToolGuide(option.name)) continue
    const always = option.persona !== undefined
    if (!always && !index.has(option.name) && !disabled.has(option.name)) continue
    options.set(option.name, option)
  }
  for (const section of sections) {
    if (BASELINE_NAMES.has(section.name) || isToolGuide(section.name) || options.has(section.name)) continue
    options.set(section.name, inferSectionOption(section.name))
  }
  for (const name of disabled) {
    if (BASELINE_NAMES.has(name) || isToolGuide(name) || options.has(name)) continue
    options.set(name, inferSectionOption(name))
  }
  const present = [...options.values()]
    .filter((option) => index.has(option.name))
    .sort((left, right) => index.get(left.name)! - index.get(right.name)!)
  const absent = [...options.values()]
    .filter((option) => !index.has(option.name))
    .sort((left, right) => (left.order ?? Number.POSITIVE_INFINITY) - (right.order ?? Number.POSITIVE_INFINITY) || left.name.localeCompare(right.name))
  // 已知 order 的缺席段插到第一个 order 大于它的在场段之前;动态段(无 order)不参与插入点判定。
  const ordered: SectionOption[] = []
  for (const option of present) {
    if (option.order !== undefined) {
      while (absent.length > 0 && (absent[0].order ?? Number.POSITIVE_INFINITY) < option.order) ordered.push(absent.shift()!)
    }
    ordered.push(option)
  }
  ordered.push(...absent)
  return ordered
}

/** 人设槽位:一个开关(是否发送) + 一个覆盖开关 + 文本域,两个槽位各自独立。 */
function PersonaBlock({ option, profile, patch, chars }: {
  option: SectionOption
  profile: Profile
  patch: Patch
  chars?: number
}): ReactElement {
  const key = option.persona!
  const config = profile.prompt[key]
  const on = config.enabled !== false
  const meta = !on
    ? '已关闭'
    : config.override
      ? config.text.length > 0 ? `覆盖 · ${config.text.length} 字` : '覆盖为空 · 不发送'
      : chars !== undefined && chars > 0 ? `沿用部署 · ≈${chars} 字` : '沿用部署'
  return h(
    Fragment,
    null,
    h(SegmentRow, {
      checked: on,
      onChange: (checked) => patch((target) => {
        target.prompt[key].enabled = checked
      }),
      title: h('span', { className: styles.segmentLabel }, option.label, h(Tags, { names: [option.name] })),
      desc: option.desc,
      meta,
    }),
    h(SegmentRow, {
      checked: config.override,
      disabled: !on,
      onChange: (checked) => patch((target) => {
        target.prompt[key].override = checked
      }),
      title: h('span', { className: styles.segmentLabel }, '覆盖部署文本'),
      desc: '为空则不发送该槽位；不为空则替换部署文本。',
    }),
    h('textarea', {
      className: styles.textarea,
      value: config.text,
      maxLength: 20000,
      disabled: !on || !config.override,
      placeholder: !on
        ? '该槽位已关闭，不发送。'
        : config.override
          ? '输入替换文本；留空即不发送该槽位。'
          : '勾选「覆盖部署文本」后可输入替换文本。',
      onChange: (event: { target: { value: string } }) => {
        const value = event.target.value
        patch((target) => {
          target.prompt[key].text = value
        })
      },
    }),
  )
}

export function SystemMessageCard({ profile, draft, patch, patchBaseline, sections }: {
  profile: Profile
  draft: PanelDraft
  patch: Patch
  patchBaseline(key: string, value: boolean | string): void
  sections: SectionEntry[]
}): ReactElement {
  const disabled = new Set(
    Object.entries(profile.sections ?? {})
      .filter(([name, enabled]) => enabled === false && !BASELINE_NAMES.has(name))
      .map(([name]) => name),
  )
  const chars = new Map(sections.map((section) => [section.name, section.chars]))

  const sectionRows = orderedSections(sections, disabled).map((option) => {
    if (option.persona !== undefined) {
      return h(PersonaBlock, { key: option.name, option, profile, patch, chars: chars.get(option.name) })
    }
    const on = !disabled.has(option.name)
    const count = chars.get(option.name)
    return h(SegmentRow, {
      key: option.name,
      checked: on,
      onChange: (checked) => patch((target) => {
        target.sections = target.sections ?? {}
        if (checked) delete target.sections[option.name]
        else target.sections[option.name] = false
      }),
      title: h('span', { className: styles.segmentLabel }, option.label, h(Tags, { names: [option.name] })),
      desc: option.desc,
      meta: on ? (count === undefined || count === 0 ? '当前未出现' : `≈${count} 字`) : '已关闭',
    })
  })

  return h(
    MessageCard,
    {
      role: 'developer',
      title: '系统提示词',
      note: '以下各段按实际拼装顺序拼成同一条消息，每段可单独开关；段开关只作用于根会话，附加规则对所有会话与子代理生效。',
    },
    ...sectionRows,
    h(SectionHeading, {
      title: '本插件附加 · 全局',
      desc: '以下 4 项由 dsh-session-context-config 额外加入，不属于 DSH 自带提示词；对所有新会话与子代理生效。悬停各行可查看注入的完整文本。',
    }),
    ...baselineRows(draft, patchBaseline),
  )
}

export function SnapshotCard({ profile, patch }: { profile: Profile; patch: Patch }): ReactElement {
  return h(
    MessageCard,
    {
      role: 'user',
      title: '运行时上下文快照',
      note: '以下 7 项拼成当前快照；内容变化时整条重发并声明取代旧快照，旧消息留在历史里。消息以 Current runtime context. This snapshot supersedes earlier runtime-context snapshots. 开头；全部关闭时新会话不发这条消息。',
    },
    ...CONTEXT_SWITCHES.map((option) => {
      const on = option.contexts.every((name) => profile.contexts?.[name] !== false)
      return h(SegmentRow, {
        key: option.id,
        checked: on,
        onChange: (checked) => patch((target) => {
          target.contexts = target.contexts ?? {}
          for (const name of option.contexts) {
            if (checked) delete target.contexts[name]
            else target.contexts[name] = false
          }
        }),
        title: h('span', { className: styles.segmentLabel }, option.label, h(Tags, { names: option.contexts })),
        desc: option.desc,
      })
    }),
  )
}

export function ChannelCard({ profile, patch, option }: {
  profile: Profile
  patch: Patch
  option: ChannelCardOption
}): ReactElement {
  const on = profile.channels?.[option.key] !== OFF
  return h(
    MessageCard,
    {
      role: 'user',
      title: option.title,
      note: option.note,
    },
    h(SegmentRow, {
      checked: on,
      onChange: (checked) => patch((target) => {
        target.channels = target.channels ?? {}
        if (checked) delete target.channels[option.key]
        else target.channels[option.key] = OFF
      }),
      title: h('span', { className: styles.segmentLabel }, option.label),
      desc: option.desc,
    }),
  )
}

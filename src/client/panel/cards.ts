/** 配置卡片:按最终请求里的消息分卡;system 卡内每段单独开关。 */
import { createElement as h, Fragment, useState, type ReactElement, type ReactNode } from 'react'
import { BASELINE_TEXT } from '../../baseline.ts'
import { estimateTokens } from '../../tokens.ts'
import { formatTokens, OFF } from '../state/resolve.ts'
import type { AskToolStatus, ChannelPreview, ObservedChannel, Profile, PromptContextState, Snapshot } from '../contract/types.ts'
import { DEFAULT_BASELINE } from './draft.ts'
import {
  CONTEXT_SWITCHES,
  KNOWN_CHANNEL_IDS,
  KNOWN_CHANNEL_SOURCES,
  SECTION_OPTIONS,
  inferContextOption,
  inferSectionOption,
  type ChannelCardOption,
  type ContextOption,
  type SectionOption,
} from './options.ts'
import styles from './panel.module.css'

type Patch = (mutate: (target: Profile) => void) => void

/** 一段注入正文的估算 token;面板只拿到截断后的前缀时,按全文长度比例放大。 */
function tokensOf(text: string | undefined, fullChars?: number, truncated?: boolean): number {
  const value = text ?? ''
  const estimate = estimateTokens(value)
  if (!truncated || fullChars === undefined || value.length === 0 || fullChars <= value.length) return estimate
  return Math.max(estimate, Math.round((estimate * fullChars) / value.length))
}

type SectionEntry = Snapshot['sections'][number]

/** 附加规则由当前档位的 `profile.baseline` 控制,在列表末尾单独渲染,不进 `profile.sections`。 */
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

function baselineRows(profile: Profile, patchBaseline: (key: string, value: boolean | string) => void): ReactElement[] {
  const rows: Array<{ key: 'contract' | 'cardReceipt' | 'untrustedFiles'; label: string; name: string; desc: string; text: string }> = [
    { key: 'contract', label: '行为契约', name: 'session-context-config:contract', desc: '不可逆动作先确认、如实汇报、信息足够就行动、跟随周边风格等 6 条。', text: BASELINE_TEXT.contract },
    { key: 'cardReceipt', label: '卡片回执', name: 'session-context-config:card-receipt', desc: 'UI 已渲染卡片时只回一句确认，不复述字段；失败仍给细节。', text: BASELINE_TEXT.cardReceipt },
    { key: 'untrustedFiles', label: '不可信下载', name: 'session-context-config:untrusted-files', desc: '隔离目录、路径传参、python -I 三条读取规则。', text: BASELINE_TEXT.untrustedFiles },
  ]
  const baseline = profile.baseline ?? DEFAULT_BASELINE
  const customOn = baseline.custom === true
  const customText = baseline.customText ?? ''
  const customMeta = !customOn
    ? '未勾选 · 可先编辑'
    : customText.trim() ? `注入 · 约 ${formatTokens(estimateTokens(customText))} token` : '已勾选 · 空文本不发送'
  return [
    ...rows.map((row) => h(SegmentRow, {
      key: row.key,
      checked: baseline[row.key] !== false,
      onChange: (checked) => patchBaseline(row.key, checked),
      // tooltip 是原样注入 system 的全文;文本里的 \n 在悬停提示里显示为换行。
      tooltip: row.text,
      title: h('span', { className: styles.segmentLabel }, row.label, h(Tags, { names: [row.name], tags: ['本档位'] })),
      desc: row.desc,
    })),
    h(SegmentRow, {
      key: 'custom',
      checked: customOn,
      onChange: (checked) => patchBaseline('custom', checked),
      tooltip: customText.trim() ? customText : undefined,
      title: h('span', { className: styles.segmentLabel }, '自定义文本', h(Tags, { names: ['session-context-config:custom-text'], tags: ['本档位'] })),
      desc: '自由输入的提示词；勾选后对当前档位生效，留空不发送。',
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
  const options = new Map<string, SectionOption>()
  // tool:* 工具引导段强绑定工具的启用状态,由 Host hiddenToolGuide 自动隐藏/显示,
  // 面板不列、不单独配置;工具目录才是它的唯一控制面。
  const isToolGuide = (name: string): boolean => name.startsWith('tool:')
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

/**
 * 人设槽位:一个开关(是否发送) + 一个覆盖开关 + 文本域,两个槽位各自独立。
 * current 是当前 live 装配出的该槽位正文(没覆盖时就是部署文本),用作 tooltip;
 * 覆盖生效时用草稿文本,保证未保存的编辑也能在悬停里预览。
 */
function PersonaBlock({ option, profile, patch, tokens, current }: {
  option: SectionOption
  profile: Profile
  patch: Patch
  tokens?: number
  current?: string
}): ReactElement {
  const key = option.persona!
  const config = profile.prompt[key]
  const on = config.enabled !== false
  const meta = !on
    ? '已关闭'
    : config.override
      ? config.text.length > 0 ? `覆盖 · 约 ${formatTokens(estimateTokens(config.text))} token` : '覆盖为空 · 不发送'
      : tokens !== undefined && tokens > 0 ? `沿用部署 · 约 ${formatTokens(tokens)} token` : '沿用部署'
  const effective = !on
    ? '该槽位已关闭，不发送。'
    : config.override
      ? config.text.length > 0 ? config.text : '覆盖为空，不发送该槽位。'
      : current && current.length > 0 ? current : '部署文本为空，不发送该槽位。'
  const replaced = !on
    ? '该槽位已关闭，不发送。'
    : current && current.length > 0 ? `当前生效文本（勾选覆盖后将替换这段）：\n\n${current}` : '当前生效文本为空。'
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
      tooltip: effective,
    }),
    h(SegmentRow, {
      checked: config.override,
      disabled: !on,
      onChange: (checked) => patch((target) => {
        target.prompt[key].override = checked
      }),
      title: h('span', { className: styles.segmentLabel }, '覆盖部署文本'),
      desc: '为空则不发送该槽位；不为空则替换部署文本。文本里的 {{model}} / {{provider}} 按当前模型展开。',
      tooltip: replaced,
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

export function SystemMessageCard({ profile, patch, patchBaseline, sections }: {
  profile: Profile
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
  const texts = new Map(sections.map((section) => [section.name, section.text ?? '']))

  const sectionRows = orderedSections(sections, disabled).map((option) => {
    if (option.persona !== undefined) {
      return h(PersonaBlock, {
        key: option.name,
        option,
        profile,
        patch,
        tokens: tokensOf(texts.get(option.name), chars.get(option.name)),
        current: texts.get(option.name),
      })
    }
    const on = !disabled.has(option.name)
    const count = chars.get(option.name)
    const text = texts.get(option.name)
    // 关掉的段不一定还在当前装配里(条件未触发、提供它的插件/预设没装载)。这时
    // 仍列出来是为了让用户能重新开启,但必须标清「当前未出现」,否则会被误读成
    // 「这个档位比别的档位多了一个配置」。
    const present = count !== undefined
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
      meta: on
        ? count === undefined || count === 0 ? '当前未出现' : `约 ${formatTokens(tokensOf(text, count))} token`
        : present ? '已关闭' : '已关闭 · 当前未出现',
      // 原样注入的段正文(变量已按当前装配渲染);关闭时也给出正文,便于确认关掉的是什么。
      tooltip: on
        ? text && text.length > 0 ? text : '当前未出现（条件段或空文本）。'
        : text && text.length > 0
          ? `该段已关闭，不进入系统消息。关闭前的文本：\n\n${text}`
          : '该段已关闭，且当前装配里没有出现（条件未触发，或提供它的插件/预设未装载）。',
    })
  })

  return h(
    MessageCard,
    {
      role: 'developer',
      title: '系统提示词',
      note: '以下各段按实际拼装顺序拼成同一条消息，每段可单独开关；悬停各行可查看当前注入的完整文本。段开关只作用于根会话，附加规则按档位生效，子代理跟随所属根会话的档位。',
    },
    ...sectionRows,
    h(SectionHeading, {
      title: '本插件附加 · 本档位',
      desc: '以下 4 项由 dsh-session-context-config 额外加入，不属于 DSH 自带提示词；只对当前档位的根会话生效，子代理跟随所属根会话的档位。悬停各行可查看注入的完整文本。',
    }),
    ...baselineRows(profile, patchBaseline),
  )
}

/**
 * 上下文行 = 已知元数据表 + 装配结果里动态发现的名字。
 * 动态项只展示「有正文」或「已被关掉」的:前者是确实会注入的,后者要留行才能重新打开;
 * 空文本的条件上下文不占行,避免列表塞满「当前未出现」。排序仍按已知 order。
 */
function orderedContexts(contexts: PromptContextState[], profile: Profile): ContextOption[] {
  const index = new Map(contexts.map((entry, position) => [entry.name, position]))
  const covered = new Set(CONTEXT_SWITCHES.flatMap((option) => option.contexts))
  const rows: ContextOption[] = CONTEXT_SWITCHES.map((option) => ({ ...option, contexts: [...option.contexts] }))
  for (const entry of contexts) {
    if (covered.has(entry.name)) continue
    if (entry.chars === 0 && profile.contexts?.[entry.name] !== false) continue
    rows.push(inferContextOption(entry.name))
    covered.add(entry.name)
  }
  for (const name of Object.keys(profile.contexts ?? {})) {
    if (profile.contexts[name] !== false || covered.has(name)) continue
    rows.push(inferContextOption(name))
    covered.add(name)
  }
  const position = (option: ContextOption): number => {
    const positions = option.contexts
      .map((name) => index.get(name))
      .filter((value): value is number => value !== undefined)
    return positions.length > 0 ? Math.min(...positions) : Number.POSITIVE_INFINITY
  }
  return rows.sort((left, right) => left.order - right.order || position(left) - position(right) || left.id.localeCompare(right.id))
}

export function SnapshotCard({ profile, patch, contexts }: {
  profile: Profile
  patch: Patch
  contexts?: PromptContextState[]
}): ReactElement {
  const entries = new Map((contexts ?? []).map((entry) => [entry.name, entry]))
  const rows = orderedContexts(contexts ?? [], profile)
  return h(
    MessageCard,
    {
      role: 'user',
      title: '运行时上下文快照',
      note: `以下 ${rows.length} 项拼成当前快照；内容变化时整条重发并声明取代旧快照，旧消息留在历史里。消息以 Current runtime context. This snapshot supersedes earlier runtime-context snapshots. 开头；全部关闭时新会话不发这条消息。悬停各行可查看当前注入文本。`,
    },
    ...rows.map((option) => {
      const on = option.contexts.every((name) => profile.contexts?.[name] !== false)
      const present = option.contexts
        .map((name) => entries.get(name))
        .filter((entry): entry is PromptContextState => entry !== undefined && entry.chars > 0)
      const tokens = present.reduce((sum, entry) => sum + tokensOf(entry.text, entry.chars), 0)
      const text = present.map((entry) => entry.text ?? '').filter((value) => value.length > 0).join('\n\n')
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
        meta: !on ? '已关闭' : tokens > 0 ? `约 ${formatTokens(tokens)} token` : '当前未出现',
        tooltip: !on
          ? '该上下文已关闭，不注入。'
          : text.length > 0 ? text : '当前未出现（条件上下文或空文本）。',
      })
    }),
  )
}

export function ChannelCard({ profile, patch, option, preview }: {
  profile: Profile
  patch: Patch
  option: ChannelCardOption
  preview?: ChannelPreview
}): ReactElement {
  const on = profile.channels?.[option.key] !== OFF
  const tooltip = !on
    ? '该通道已关闭：后续请求会滤掉这个来源的消息。已写入会话记录的历史不会删除。'
    : preview?.text
      ? `最近一次注入${preview.truncated ? '（正文已截断）' : ''}：\n\n${preview.text}`
      : '当前会话还没有注入过这条消息；正文由宿主按当前工作区/时间动态生成。'
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
      tooltip,
    }),
  )
}

/**
 * 自动发现的注入消息清单:已知两条通道之外、由宿主/第三方插件塞进 user 批次的
 * `source.kind`。每行写 `profile.channels[kind]='off'`;Host 的 pre-step 过滤器按
 * 同一键剔除。运行期消息可能承载状态同步(子代理完成、压缩检查点、目标轮次),
 * 所以文案必须提示风险,不能静默关掉。
 */
export function ObservedMessagesCard({ observed, liveCount, profile, patch }: {
  observed?: ObservedChannel[]
  liveCount?: number
  profile: Profile
  patch: Patch
}): ReactElement {
  const [kindInput, setKindInput] = useState('')
  const rows = (observed ?? []).filter((entry) => !KNOWN_CHANNEL_SOURCES.has(entry.kind))
  const observedKinds = new Set(rows.map((entry) => entry.kind))
  // 手动添加但当前档位还没观察到的 kind:持久化在 profile.channels 里,保证刷新后还在。
  const manualKinds = Object.keys(profile.channels ?? {}).filter((kind) => profile.channels?.[kind] === OFF
    && !observedKinds.has(kind)
    && !KNOWN_CHANNEL_SOURCES.has(kind)
    && !KNOWN_CHANNEL_IDS.has(kind))
  const addKind = (): void => {
    const kind = kindInput.trim()
    // __proto__ 会改原型而不是写入配置;另外已知通道走专用卡,不在这里重复。
    if (!kind || kind === '__proto__' || KNOWN_CHANNEL_SOURCES.has(kind) || KNOWN_CHANNEL_IDS.has(kind)) return
    patch((target) => {
      target.channels = target.channels ?? {}
      target.channels[kind] = OFF
    })
    setKindInput('')
  }
  const empty = rows.length === 0 && manualKinds.length === 0
  return h(
    MessageCard,
    {
      role: 'user',
      title: '其他注入消息（自动发现）',
      note: '只统计使用当前档位的 live 根会话，按 source.kind 聚合；新版本/新插件开始注入后会自动出现在这里。每行可关闭，也可以在底部手动输入一个 kind 提前关闭——关闭会写入 profile.channels[kind]=\'off\'，保存后对新会话/切换该档位生效。运行期消息可能承载插件状态同步，不确定就保持开启。悬停行可看最近一次正文。',
    },
    ...(empty
      ? [h('p', { className: styles.empty }, (liveCount ?? 0) === 0
        ? '当前档位没有 live 根会话，所以没有可聚合的消息。'
        : `当前档位有 ${liveCount} 个 live 根会话，但只观察到工作区指令/时间采样这类已知通道；其它 kind 一旦注入就会出现在这里，也可以在底部手动输入。`)]
      : rows.map((entry) => {
        const on = profile.channels?.[entry.kind] !== OFF
        return h(SegmentRow, {
          key: entry.kind,
          checked: on,
          onChange: (checked) => patch((target) => {
            target.channels = target.channels ?? {}
            if (checked) delete target.channels[entry.kind]
            else target.channels[entry.kind] = OFF
          }),
          title: h('span', { className: styles.segmentLabel }, entry.kind),
          desc: '宿主或第三方插件注入的 user 消息（source.kind）；关闭后这类消息不再进入请求。',
          meta: `${entry.count} 次${entry.chars > 0 ? ` · 约 ${formatTokens(tokensOf(entry.text, entry.chars, entry.truncated))} token` : ''}`,
          tooltip: entry.text ? `${entry.text}${entry.truncated ? '\n\n…（正文已截断）' : ''}` : undefined,
        })
      })),
    ...manualKinds.map((kind) => h(SegmentRow, {
      key: `manual:${kind}`,
      checked: false,
      onChange: (checked) => patch((target) => {
        target.channels = target.channels ?? {}
        if (checked) delete target.channels[kind]
        else target.channels[kind] = OFF
      }),
      title: h('span', { className: styles.segmentLabel }, kind, h(Tags, { tags: ['手动'] })),
      desc: '手动添加的 source.kind；当前档位的会话里还没观察到它，保存后会按同一键过滤。',
      meta: '未观察到',
      tooltip: '手动添加：关闭后该 kind 的消息不进入请求。',
    })),
    h(
      'div',
      { className: styles.kindAdd },
      h('input', {
        className: styles.input,
        value: kindInput,
        maxLength: 200,
        placeholder: '输入 source.kind（如 compact-checkpoint）',
        'aria-label': '手动添加 source.kind',
        onChange: (event: { target: { value: string } }) => setKindInput(event.target.value),
        onKeyDown: (event: { key: string }) => {
          if (event.key === 'Enter') addKind()
        },
      }),
      h('button', {
        type: 'button',
        className: `${styles.btn} ${styles.kindAddBtn}`,
        disabled: kindInput.trim().length === 0,
        onClick: addKind,
      }, '添加'),
    ),
  )
}

/**
 * 「DSH 默认行为」卡:本插件改写发送行为的开关集合。
 *
 * 这里的开关语义统一为「开启 = 本插件介入,关闭 = 保持宿主原样」,与其它卡里
 * 「勾选 = 注入」的段/上下文开关相反,所以用 role=switch 的轨道开关区分,而不是
 * 复选行:一眼能看出这是行为改写,不是内容选择。
 */
function SwitchRow({ checked, onChange, title, desc, meta, tooltip }: {
  checked: boolean
  onChange(checked: boolean): void
  title: ReactNode
  desc: ReactNode
  meta?: ReactNode
  tooltip?: string
}): ReactElement {
  return h(
    'label',
    { className: styles.behaviorRow, title: tooltip },
    h('input', {
      type: 'checkbox',
      role: 'switch',
      className: styles.switchInput,
      checked,
      'aria-checked': checked,
      onChange: (event: { target: { checked: boolean } }) => onChange(event.target.checked),
    }),
    h(
      'span',
      { className: styles.segmentBody },
      h(
        'span',
        { className: styles.segmentTitle },
        h('span', { className: styles.segmentLabel }, title),
        meta === undefined ? null : h('span', { className: styles.segmentMeta }, meta),
      ),
      h('span', { className: styles.segmentDesc }, desc),
    ),
  )
}

export function DefaultBehaviorCard({ profile, patch, askUser }: { profile: Profile; patch: Patch; askUser?: AskToolStatus }): ReactElement {
  const injectedFirst = profile.injectedFirst === true
  const dedupeUserSkill = profile.injectDuplicateSkills === false
  const dedupeSkillTool = profile.dedupeSkillToolResults === true
  // ask_user_question:官方参数结构没变才允许改写(Host 在每次快照里现算)。
  // 开关 = 本插件是否接管等待;秒数 = 接管后的等待时长(留空 = 不设期限,落 -1)。
  const askTimeout = typeof profile.askUserTimeout === 'number' ? profile.askUserTimeout : undefined
  // 只有「宿主参数结构与基线不符」才禁用控件:那说明改写一定出错。没有 live 会话、该档位把
  // 工具延迟加载、定义缺字段都不算——档位是配置面,能否生效要到对应会话创建时才定。
  const askBlocked = askUser?.reason === 'schema'
  const askActive = askTimeout !== undefined
  const secondsValue = askTimeout !== undefined && askTimeout > 0 ? String(askTimeout) : ''
  // 右上角写实际生效的等待效果。只有本插件自己接管的两档能写死(实现就是如此);
  // 「不介入」时宿主怎么等待由版本与那行 loader 配置决定(legacy 阻塞 / timed 按行配置超时),
  // 所以这里只陈述「宿主原样」,不推断会不会超时。
  const askEffect = !askActive
    ? '不介入，宿主原样'
    : secondsValue
      ? `${secondsValue} 秒后返回 pending`
      : '不会超时，断线可恢复'
  return h(
    'section',
    { className: styles.card },
    h('h2', { className: styles.cardTitle }, 'DSH 默认行为'),
    h('p', { className: styles.hint }, '这里的开关改写 DSH 默认的发送行为：开启 = 由本插件介入，关闭 = 保持宿主原样。只对当前档位的根会话生效，切换档位时重新计算。'),
    h(SwitchRow, {
      checked: injectedFirst,
      onChange: (checked) => patch((target) => {
        target.injectedFirst = checked
      }),
      title: '注入消息前置',
      meta: injectedFirst ? '上下文在前' : '用户消息在前',
      desc: '把工作区指令、技能目录、运行时快照这三类起始上下文按固定顺序排到用户消息之前发送，跨会话时它们能落进同一段可复用前缀。时间采样（每轮都变，前移没有收益）、技能正文与运行期通知保持宿主顺序。',
      tooltip: '开启后模型看到的顺序变了：三类上下文在前、用户消息在后。关闭时保持宿主默认顺序（用户消息在前、注入消息追加在其后）。',
    }),
    h(SwitchRow, {
      checked: dedupeUserSkill,
      onChange: (checked) => patch((target) => {
        target.injectDuplicateSkills = !checked
      }),
      title: '用户 /技能名 注入去重',
      meta: dedupeUserSkill ? '只留一份' : '宿主默认',
      desc: '宿主在用户消息里出现 /技能名 时无条件注入整份技能正文。开启后，同一份正文已在本会话可见历史里就跳过这次注入；被压缩或替换掉的正文不算，会重新注入。',
      tooltip: '判定依据是本会话将要发送的历史（deriveMessages）：压缩或替换掉的正文不在其中，所以被压缩后会重新注入；拿不到历史时不去重（宁可重复，不丢指令）。',
    }),
    h(SwitchRow, {
      checked: dedupeSkillTool,
      onChange: (checked) => patch((target) => {
        target.dedupeSkillToolResults = checked
      }),
      title: 'skill 工具结果去重',
      meta: dedupeSkillTool ? '只回提示' : '宿主默认',
      desc: '模型调用 skill 工具时，若同一份正文已经在可见历史里，工具结果只回一行「已加载」提示，不再重复整份正文。与上一条分开控制；只改模型看到的正文，不动技能定义与工具 schema。',
      tooltip: '只拦 skill 工具这一条路径：正文已在历史里才替换，压缩掉后重新加载仍拿完整正文。',
    }),
    h(
      'div',
      { className: styles.askRow, 'data-ask-guard': askUser?.reason ?? 'unknown' },
      h(
        'div',
        { className: styles.askTitle },
        h(
          'label',
          { className: styles.askSwitch },
          h('input', {
            type: 'checkbox',
            role: 'switch',
            className: styles.switchInput,
            checked: askActive,
            'aria-checked': askActive,
            disabled: askBlocked,
            onChange: (event: { target: { checked: boolean } }) => patch((target) => {
              target.askUserTimeout = event.target.checked ? -1 : undefined
            }),
          }),
          // 标题里嵌实际工具名:一眼看出这一项改的是哪个工具,而不是笼统的「超时」。
          h(
            'span',
            { className: styles.askLabel },
            '调整 ',
            h('span', { className: styles.askTool }, 'ask_user_question'),
            ' 超时时间',
          ),
        ),
        h('span', { className: styles.askMeta }, askEffect),
      ),
      h('p', { className: styles.askDesc }, '开启后由本插件接管等待：卡片带调用 id，断线重连后仍是同一张卡、草稿不丢、提交失败可见，工具调用行也能重新打开面板。在下方秒数框里填等待时间，到点工具返回 pending（不是跳过），问题仍可回答；留空则不设期限、不会超时。关闭则保持宿主原样。'),
      h(
        'div',
        { className: styles.askSecondsRow },
        h('span', { className: styles.askSecondsLabel }, '超时'),
        h('input', {
          type: 'number',
          className: styles.askSeconds,
          value: secondsValue,
          min: 1,
          max: 2147483,
          placeholder: askActive ? '留空则不超时' : '',
          disabled: askBlocked || !askActive,
          'aria-label': '提问等待秒数',
          onChange: (event: { target: { value: string } }) => {
            const raw = event.target.value.trim()
            const parsed = raw === '' ? NaN : Number(raw)
            patch((target) => {
              // 开关已开启(本插件接管等待):清空或非法值回到 -1「不设期限」,
              // 不能写 undefined——那会把开关一起关掉。
              target.askUserTimeout = Number.isInteger(parsed) && parsed >= 1 ? parsed : -1
            })
          },
        }),
        h('span', { className: styles.askSecondsUnit }, '秒'),
      ),
      askUser === undefined || askUser.reason === 'ok'
        ? null
        : h('p', { className: askBlocked ? styles.askWarn : styles.askHint }, askBlocked
          ? `· 本项已停用：${askUser.message}`
          : `· ${askUser.message}`),
    ),
  )
}

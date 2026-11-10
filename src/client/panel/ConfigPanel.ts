/**
 * 配置面板:档位草稿(增删改名/组/server/工具状态/摘要)、系统提示词与基线开关、
 * 保存与预览。草稿干净时跟随快照镜像,脏时冻结;写成功后置干净等镜像重derive。
 */
import { createElement as h, useCallback, useEffect, useMemo, useState, type ReactElement } from 'react'
import { SegmentedControl } from '@deepseek-ai/dsh-client-ui-primitives'
import { Glyph } from '../menu/icons.ts'
import { useError, useSnapshot } from '../state/hooks.ts'
import { loadSnapshot, request, setSnapshot, emit } from '../state/store.ts'
import { effective, formatTokens, NONE, ON, presetNames, statsFor } from '../state/resolve.ts'
import type { CatalogTool, Profile, Snapshot } from '../contract/types.ts'
import { GROUP_STATES, CHANNEL_CARDS } from './options.ts'
import { ChannelCard, DEFAULT_BASELINE, SectionHeading, SnapshotCard, SystemMessageCard, type PanelDraft } from './cards.ts'
import { stateTag, toolRow } from './group-cards.ts'
import { PreviewDialog } from './PreviewDialog.ts'
import styles from './panel.module.css'

const API_STATE = '/session-context-config/api/state'
const LABEL = '上下文档位'

type Patch = (mutate: (target: Profile) => void) => void

/** 取快照诊断里的第一条可读消息;工具目录为空时给面板一个自报告入口,而不是静默少一块。 */
function firstDiagnostic(diagnostics: unknown[]): string | null {
  for (const item of diagnostics) {
    if (!item || typeof item !== 'object') continue
    const { source, message } = item as { source?: unknown; message?: unknown }
    if (typeof message !== 'string' || !message) continue
    return typeof source === 'string' && source ? `${source}: ${message}` : message
  }
  return null
}

export function ConfigPanel(props: { closePanel?: () => void }): ReactElement {
  const snapshot = useSnapshot()
  const error = useError()
  const [draft, setDraft] = useState<PanelDraft | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewMode, setPreviewMode] = useState<string | null>(null)

  useEffect(() => {
    if (!snapshot || draft) return
    setDraft(JSON.parse(JSON.stringify({
      profiles: snapshot.profiles,
      lastUsedId: snapshot.lastUsedId,
      baseline: snapshot.baseline ?? DEFAULT_BASELINE,
    })))
    setSelectedId(snapshot.profiles[0]?.id ?? null)
  }, [snapshot, draft])

  const profile = useMemo(
    () => draft?.profiles?.find((item) => item.id === selectedId) ?? null,
    [draft, selectedId],
  )

  const groups = snapshot?.groups ?? []
  const tools: CatalogTool[] = snapshot?.tools ?? []
  const toolsByGroup = useMemo(() => {
    const map = new Map<string, CatalogTool[]>()
    for (const tool of tools) {
      if (!map.has(tool.group)) map.set(tool.group, [])
      map.get(tool.group)!.push(tool)
    }
    return map
  }, [tools])

  const dirty = useMemo(() => {
    if (!snapshot || !draft) return false
    return JSON.stringify(draft) !== JSON.stringify({
      profiles: snapshot.profiles,
      lastUsedId: snapshot.lastUsedId,
      baseline: snapshot.baseline ?? DEFAULT_BASELINE,
    })
  }, [snapshot, draft])

  const patchBaseline = useCallback((key: string, value: boolean | string) => {
    setDraft((current) => (current ? { ...current, baseline: { ...current.baseline, [key]: value } } : current))
    setStatus(null)
  }, [])

  const patch: Patch = useCallback(
    (mutate) => {
      setDraft((current) => {
        if (!current) return current
        const next = JSON.parse(JSON.stringify(current)) as PanelDraft
        const target = next.profiles.find((item) => item.id === selectedId)
        if (!target) return current
        mutate(target)
        return next
      })
      setStatus(null)
    },
    [selectedId],
  )

  const setGroupState = useCallback(
    (groupId: string, state: string) => {
      patch((target) => {
        if (state === ON) delete target.groups[groupId]
        else target.groups[groupId] = state
      })
    },
    [patch],
  )

  const setServerState = useCallback(
    (serverId: string, state: string) => {
      patch((target) => {
        if (state === ON) delete target.servers[serverId]
        else target.servers[serverId] = state
      })
    },
    [patch],
  )

  const setToolState = useCallback(
    (toolName: string, state: string) => {
      patch((target) => {
        if (state === ON) delete target.tools[toolName]
        else target.tools[toolName] = state
      })
    },
    [patch],
  )

  const clearGroupTools = useCallback(
    (groupId: string) => {
      patch((target) => {
        for (const tool of toolsByGroup.get(groupId) ?? []) delete target.tools[tool.name]
      })
    },
    [patch, toolsByGroup],
  )

  const addProfile = useCallback(() => {
    if (!draft) return
    let index = draft.profiles.length + 1
    let id = `custom-${index}`
    while (draft.profiles.some((item) => item.id === id)) {
      index += 1
      id = `custom-${index}`
    }
    setDraft({
      ...draft,
      profiles: [
        ...draft.profiles,
        {
          id,
          name: `档位 ${index}`,
          description: '',
          prompt: {
            prefix: { enabled: true, override: false, text: '' },
            suffix: { enabled: true, override: false, text: '' },
          },
          contexts: {},
          sections: {},
          channels: {},
          groups: {},
          servers: {},
          tools: {},
          summaries: {},
        },
      ],
    })
    setSelectedId(id)
    setStatus(null)
  }, [draft])

  const removeProfile = useCallback(() => {
    if (!draft || draft.profiles.length <= 1) return
    const rest = draft.profiles.filter((item) => item.id !== selectedId)
    setDraft({ ...draft, profiles: rest })
    setSelectedId(rest[0].id)
    setStatus(null)
  }, [draft, selectedId])

  const save = useCallback(async () => {
    if (!draft) return
    setBusy(true)
    try {
      const result = await request<{ snapshot: Snapshot }>(API_STATE, { method: 'POST', body: JSON.stringify(draft) })
      setSnapshot(result.snapshot)
      setDraft(JSON.parse(JSON.stringify({
        profiles: result.snapshot.profiles,
        lastUsedId: result.snapshot.lastUsedId,
        baseline: result.snapshot.baseline ?? DEFAULT_BASELINE,
      })))
      setStatus('已保存')
      emit()
    } catch (cause) {
      setStatus((cause as Error).message || String(cause))
    } finally {
      setBusy(false)
    }
  }, [draft])

  if (error) {
    return h(
      'div',
      { className: styles.root },
      h(
        'div',
        { className: styles.scroll },
        h('div', { className: styles.card }, h('p', { className: styles.error }, error), h('button', { className: styles.btn, onClick: () => loadSnapshot(true), style: { marginTop: 10 } }, '重试')),
      ),
    )
  }
  if (!snapshot || !draft || !profile) {
    return h('div', { className: styles.root }, h('div', { className: styles.empty }, '正在读取…'))
  }

  const modeNames = presetNames(snapshot, previewMode ?? snapshot.defaultPreset) ?? presetNames(snapshot, snapshot.defaultPreset)
  const s = statsFor(profile, tools, modeNames)
  const catalogDiagnostic = tools.length === 0 ? firstDiagnostic(snapshot.diagnostics) : null

  const perMode = snapshot.presets.map((preset) => ({
    id: preset.id,
    name: preset.name,
    ...statsFor(profile, tools, new Set(preset.tools.map((tool) => tool.name))),
  }))

  const groupRows = groups.map((group) => {
    const list = toolsByGroup.get(group.id) ?? []
    const configuredServers = group.id === 'mcp' ? Object.keys(profile.servers ?? {}) : []
    const servers = [
      ...new Set([...list.map((tool) => tool.server).filter((server): server is string => Boolean(server)), ...configuredServers]),
    ]
    if (list.length === 0 && servers.length === 0) return null
    const groupState = profile.groups?.[group.id] ?? ON
    const customized = list.some((tool) => (profile.tools?.[tool.name] ?? ON) !== ON)
    return h(
      'div',
      { className: styles.card, key: group.id },
      h(
        'div',
        { className: styles.groupHead },
        h('span', { className: styles.groupName }, group.title),
        h('span', { className: styles.count }, `${list.length} 个`),
        group.id === 'mcp' && servers.length > 0 ? h('span', { className: styles.mini }, `${servers.length} 个 server`) : null,
        h('span', { className: styles.push }),
        h(SegmentedControl, {
          id: `scc-group-${group.id}`,
          value: groupState,
          options: GROUP_STATES,
          onChange: (next) => setGroupState(group.id, next),
          label: `${group.title}组状态`,
        }),
      ),
      group.id === 'mcp'
        ? servers.map((serverId) => {
            const serverTools = list.filter((tool) => tool.server === serverId)
            const serverState = profile.servers?.[serverId] ?? ON
            const serverEffective = effective(profile, { name: '', group: group.id, server: serverId })
            return h(
              'div',
              { key: serverId },
              h(
                'div',
                { className: styles.serverRow },
                h('span', { className: styles.srv, title: serverId }, serverId),
                stateTag(serverEffective, serverState),
                h('span', { className: styles.count }, serverTools.length > 0 ? `${serverTools.length} 个` : '未上线'),
                h('span', { className: styles.push }),
                h(SegmentedControl, {
                  id: `scc-server-${serverId}`,
                  value: serverState,
                  options: GROUP_STATES,
                  onChange: (next) => setServerState(serverId, next),
                  label: `${serverId} 状态`,
                }),
              ),
              ...serverTools.map((tool) => toolRow(tool, profile, setToolState)),
            )
          })
        : list.map((tool) => toolRow(tool, profile, setToolState)),
      group.id === 'mcp' || !customized
        ? null
        : h(
            'button',
            { className: styles.clear, type: 'button', onClick: () => clearGroupTools(group.id) },
            '清除本组工具级设置',
          ),
    )
  })

  return h(
    'div',
    { className: styles.root },
    h(
      'header',
      { className: styles.head },
      h('div', { className: styles.headIcon }, h(Glyph, { size: 18 })),
      h(
        'div',
        { className: styles.headText },
        h('h1', { className: styles.title }, LABEL),
        h('p', { className: styles.sub }, '在这里配置档位；新会话与已开始的会话都可以选它。组只提供默认值，隐藏与强制开启会压过子项。'),
      ),
      props?.closePanel
        ? h('button', { className: styles.iconBtn, onClick: props.closePanel, title: '关闭' }, '✕')
        : null,
    ),
    h(
      'div',
      { className: styles.scroll },
      h(
        'section',
        { className: styles.card },
        h(
          'div',
          { className: styles.chipRow },
          h(
            'div',
            { className: styles.segWrap },
            h(SegmentedControl, {
              id: 'scc-profile',
              value: profile.id,
              options: draft.profiles.map((item) => ({ value: item.id, label: item.name })),
              onChange: setSelectedId,
              label: '档位',
            }),
          ),
          h('button', { className: styles.link, type: 'button', onClick: addProfile }, '+ 新建档位'),
          h('button', { className: styles.link, type: 'button', onClick: removeProfile, disabled: draft.profiles.length <= 1 }, '删除当前'),
        ),
        h(
          'div',
          { className: styles.field },
          h(
            'label',
            { className: styles.fieldRow },
            h('span', { className: styles.fieldLabel }, '名称'),
            h('input', {
              className: styles.input,
              value: profile.name,
              maxLength: 60,
              'aria-label': '档位名称',
              onChange: (event: { target: { value: string } }) => {
                const value = event.target.value
                patch((target) => {
                  target.name = value
                })
              },
            }),
          ),
          h(
            'label',
            { className: styles.fieldRow },
            h('span', { className: styles.fieldLabel }, '描述'),
            h('input', {
              className: styles.input,
              value: profile.description,
              maxLength: 200,
              placeholder: '一句话说明这套档位用来做什么',
              'aria-label': '档位说明',
              onChange: (event: { target: { value: string } }) => {
                const value = event.target.value
                patch((target) => {
                  target.description = value
                })
              },
            }),
          ),
        ),
        h('div', { className: styles.sep }),
        h(
          'div',
          { className: styles.chipRow },
          h('span', { className: styles.mini }, `注入 ${s.on} · 延迟 ${s.defer} · 隐藏 ${s.off}`),
          h('span', { className: styles.mini }, `≈ ${formatTokens(s.onTokens)} tokens`),
          h('button', { className: styles.link, type: 'button', onClick: () => setPreviewOpen(true) }, '预览各模式结果'),
        ),
        h(
          'div',
          { className: styles.chipRow, style: { marginTop: 6 } },
          ...perMode.map((item) => h('span', { className: styles.mini, key: item.id }, `${item.name} ${item.on}${item.defer ? `+${item.defer}迟` : ''}`)),
        ),
      ),

      h(SystemMessageCard, { profile, draft, patch, patchBaseline, sections: snapshot.sections ?? [] }),

      h(SnapshotCard, { profile, patch }),

      ...CHANNEL_CARDS.map((option) => h(ChannelCard, { key: option.key, profile, patch, option })),

      h(SectionHeading, {
        title: '工具目录',
        desc: '按组 / server / 单个工具控制注入、延迟（占位折叠）与隐藏；工具引导文本跟随工具状态，不在上方逐段配置。',
      }),

      tools.length === 0
        ? h(
            'section',
            { className: styles.card },
            h('h2', { className: styles.cardTitle }, '工具目录'),
            h('p', { className: styles.error }, catalogDiagnostic ?? '没有读到任何工具。'),
            h(
              'p',
              { className: styles.hint },
              catalogDiagnostic
                ? '上面的诊断来自宿主工具目录枚举；修复后点「重新读取」。'
                : '宿主没有返回工具表；确认已配置 agent preset 后点「重新读取」。',
            ),
            h('button', { className: `${styles.btn} ${styles.cardAction}`, type: 'button', onClick: () => loadSnapshot(true) }, '重新读取'),
          )
        : null,

      ...groupRows,

      snapshot.live?.some((item) => !item.blank)
        ? h(
            'p',
            { className: styles.mini },
            '已开始的会话不会自动套用这里的改动；它们只在会话头部确认切换时重算。',
          )
        : null,
    ),
    h(
      'footer',
      { className: styles.foot },
      h('div', { className: styles.footNote }, status ?? (dirty ? '有未保存的改动' : '已保存')),
      h('button', { className: styles.btn, type: 'button', onClick: () => loadSnapshot(true), disabled: busy }, '重新读取'),
      h('button', { className: styles.btn, 'data-kind': 'primary', type: 'button', onClick: save, disabled: busy || !dirty }, busy ? '保存中…' : '保存'),
    ),
    previewOpen ? h(PreviewDialog, { profile, snapshot, onClose: () => setPreviewOpen(false) }) : null,
  )
}

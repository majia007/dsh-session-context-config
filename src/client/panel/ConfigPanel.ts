/**
 * 配置面板:档位草稿(增删改名/组/server/工具状态/摘要)、系统提示词与基线开关、
 * 保存与预览。草稿干净时跟随快照镜像,脏时冻结;写成功后按响应快照重建并置干净。
 */
import { createElement as h, useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { SegmentedControl } from '@deepseek-ai/dsh-client-ui-primitives'
import { Glyph } from '../menu/icons.ts'
import { Popover } from '../menu/popup.ts'
import { useError, useSnapshot } from '../state/hooks.ts'
import { loadSnapshot, request, setSnapshot, emit } from '../state/store.ts'
import { effective, formatTokens, NONE, ON, presetNames, statsFor } from '../state/resolve.ts'
import type { CatalogTool, Profile, Snapshot } from '../contract/types.ts'
import { GROUP_STATES, CHANNEL_CARDS } from './options.ts'
import { ChannelCard, ObservedMessagesCard, SectionHeading, SnapshotCard, SystemMessageCard } from './cards.ts'
import { DEFAULT_BASELINE, draftOf, type PanelDraft } from './draft.ts'
import { stateTag, toolRow } from './group-cards.ts'
import { PreviewDialog } from './PreviewDialog.ts'
import styles from './panel.module.css'
import menuStyles from '../menu/menu.module.css'

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

/** 新建档位可用的下一个 custom id。 */
function nextProfileId(profiles: Profile[]): string {
  let index = profiles.length + 1
  let id = `custom-${index}`
  while (profiles.some((profile) => profile.id === id)) {
    index += 1
    id = `custom-${index}`
  }
  return id
}

/** 复制预设时避免同名:先「 副本」,再「 副本 2」。 */
function uniqueProfileName(profiles: Profile[], base: string): string {
  if (!profiles.some((profile) => profile.name === base)) return base
  let candidate = `${base} 副本`
  let copy = 2
  while (profiles.some((profile) => profile.name === candidate)) {
    candidate = `${base} 副本 ${copy}`
    copy += 1
  }
  return candidate
}

/** 直接点「新建档位」:全启用模板(组/工具/上下文/段/通道都按默认注入)。 */
function allOnProfile(id: string, name: string): Profile {
  return {
    id,
    name,
    description: '',
    prompt: {
      prefix: { enabled: true, override: false, text: '' },
      suffix: { enabled: true, override: false, text: '' },
    },
    contexts: {},
    sections: {},
    baseline: { ...DEFAULT_BASELINE, customText: '' },
    channels: {},
    groups: {},
    servers: {},
    tools: {},
    summaries: {},
  }
}

/** 从插件内置预设复制:换 custom id 与不撞名称,其余字段原样深拷贝。 */
function copyOfPreset(preset: Profile, profiles: Profile[]): Profile {
  const copy = JSON.parse(JSON.stringify(preset)) as Profile
  copy.id = nextProfileId(profiles)
  copy.name = uniqueProfileName(profiles, preset.name)
  if (!copy.baseline) copy.baseline = { ...DEFAULT_BASELINE, customText: '' }
  return copy
}

export function ConfigPanel(props: { closePanel?: () => void }): ReactElement {
  const snapshot = useSnapshot()
  const error = useError()
  const [draft, setDraft] = useState<PanelDraft | null>(null)
  // 「干净锚点」:草稿最近一次从快照派生(或保存成功)时的序列化镜像。
  // 草稿与锚点一致 = 干净,快照更新时跟随重建;不一致 = 用户改过,冻结等保存(「重新读取」也不丢弃未保存改动)。
  const [anchor, setAnchor] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewMode, setPreviewMode] = useState<string | null>(null)
  const [presetMenuOpen, setPresetMenuOpen] = useState(false)
  const presetAnchor = useRef<HTMLButtonElement | null>(null)
  const presetCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 悬停下拉读的是宿主快照里的当前插件内置预设,不是 state.profiles 里的已安装档位。
  const defaultPresets = snapshot?.defaults ?? []

  useEffect(() => () => {
    if (presetCloseTimer.current) clearTimeout(presetCloseTimer.current)
  }, [])

  useEffect(() => {
    if (!snapshot) return
    // 脏草稿冻结:外部更新(如会话 chip 切档位)不得覆盖用户未保存的编辑。
    if (draft && anchor !== null && JSON.stringify(draft) !== anchor) return
    const next = draftOf(snapshot)
    const serialized = JSON.stringify(next)
    // 内容与锚点一致时跳过,避免每个快照帧都重建草稿对象(setState 新对象会再触发本 effect)。
    if (serialized === anchor) return
    setAnchor(serialized)
    setDraft(next)
    setSelectedId((current) => {
      const ids = next.profiles.map((item) => item.id)
      return current && ids.includes(current) ? current : (ids[0] ?? null)
    })
  }, [snapshot, draft, anchor])

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

  // 「未保存改动」只看草稿与锚点的差异:外部快照更新对干净草稿不是改动(跟随重建后仍干净)。
  // 拿草稿对比最新快照会把 chip 切档位误报成用户改动,诱导保存把旧 lastUsedId 回滚。
  const dirty = useMemo(() => {
    if (!snapshot || !draft || anchor === null) return false
    return JSON.stringify(draft) !== anchor
  }, [snapshot, draft, anchor])

  const patchBaseline = useCallback((key: string, value: boolean | string) => {
    setDraft((current) => {
      if (!current) return current
      const next = JSON.parse(JSON.stringify(current)) as PanelDraft
      const target = next.profiles.find((item) => item.id === selectedId)
      if (!target) return current
      const baseline = target.baseline ?? { ...DEFAULT_BASELINE, customText: '' }
      target.baseline = { ...baseline, [key]: value }
      return next
    })
    setStatus(null)
  }, [selectedId])

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

  const cancelPresetClose = useCallback(() => {
    if (!presetCloseTimer.current) return
    clearTimeout(presetCloseTimer.current)
    presetCloseTimer.current = null
  }, [])

  const closePresetMenu = useCallback(() => {
    cancelPresetClose()
    setPresetMenuOpen(false)
  }, [cancelPresetClose])

  const openPresetMenu = useCallback(() => {
    if (defaultPresets.length === 0) return
    cancelPresetClose()
    setPresetMenuOpen(true)
  }, [defaultPresets.length, cancelPresetClose])

  // 指针从触发器移到 portal 菜单要跨过 4px 间隙:延后关闭,菜单的 mouseenter 会取消。
  const schedulePresetClose = useCallback(() => {
    cancelPresetClose()
    presetCloseTimer.current = setTimeout(() => {
      presetCloseTimer.current = null
      setPresetMenuOpen(false)
    }, 140)
  }, [cancelPresetClose])

  const addProfile = useCallback(() => {
    if (!draft) return
    const id = nextProfileId(draft.profiles)
    const next = allOnProfile(id, `档位 ${id.slice('custom-'.length)}`)
    setDraft({ ...draft, profiles: [...draft.profiles, next] })
    setSelectedId(id)
    setStatus(null)
    closePresetMenu()
  }, [draft, closePresetMenu])

  const addProfileFromPreset = useCallback((preset: Profile) => {
    if (!draft) return
    const next = copyOfPreset(preset, draft.profiles)
    setDraft({ ...draft, profiles: [...draft.profiles, next] })
    setSelectedId(next.id)
    setStatus(null)
    closePresetMenu()
  }, [draft, closePresetMenu])

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
      const saved = draftOf(result.snapshot)
      setSnapshot(result.snapshot)
      setAnchor(JSON.stringify(saved))
      setDraft(saved)
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
          h(
            'div',
            {
              className: styles.newProfile,
              onMouseEnter: openPresetMenu,
              onMouseLeave: schedulePresetClose,
            },
            h(
              'button',
              {
                ref: presetAnchor,
                className: styles.link,
                type: 'button',
                onClick: addProfile,
                'aria-haspopup': defaultPresets.length > 0 ? 'menu' : undefined,
                'aria-expanded': presetMenuOpen,
                title: defaultPresets.length > 0 ? '点击新建全启用档位；悬停选择插件内置预设' : '新建全启用档位',
              },
              '+ 新建档位',
              defaultPresets.length > 0 ? h('span', { className: styles.caret, 'aria-hidden': 'true' }, '▾') : null,
            ),
            presetMenuOpen && defaultPresets.length > 0
              ? h(
                  Popover,
                  {
                    anchor: presetAnchor,
                    onClose: closePresetMenu,
                    onMouseEnter: cancelPresetClose,
                    onMouseLeave: schedulePresetClose,
                    label: '从插件内置预设新建档位',
                  },
                  h(
                    'div',
                    { className: menuStyles.menuHead },
                    '从插件内置预设新建',
                    h('span', { className: menuStyles.menuNote }, '复制为新档位'),
                  ),
                  ...defaultPresets.map((preset) => h(
                    'button',
                    {
                      key: preset.id,
                      className: menuStyles.row,
                      type: 'button',
                      role: 'menuitem',
                      title: preset.description || preset.name,
                      onClick: () => addProfileFromPreset(preset),
                    },
                    h(
                      'span',
                      { className: menuStyles.rowMain },
                      h('span', { className: menuStyles.rowName }, preset.name),
                      h('span', { className: menuStyles.rowDesc }, preset.description || '（无描述）'),
                    ),
                    h('span', { className: menuStyles.rowCount }, '内置'),
                  )),
                )
              : null,
          ),
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

      h(SystemMessageCard, { profile, patch, patchBaseline, sections: snapshot.sections ?? [] }),

      h(SnapshotCard, { profile, patch, contexts: snapshot.contexts ?? [] }),

      ...CHANNEL_CARDS.map((option) => h(ChannelCard, {
        key: option.key,
        profile,
        patch,
        option,
        preview: snapshot.channelsByProfile?.[profile.id]?.[option.key],
      })),

      h(ObservedMessagesCard, {
        observed: snapshot.observedChannelsByProfile?.[profile.id] ?? [],
        liveCount: snapshot.live?.filter((item) => item.profileId === profile.id).length ?? 0,
        profile,
        patch,
      }),

      h(SectionHeading, {
        title: '工具目录',
        desc: '按组 / server / 单个工具控制注入、延迟（占位折叠）与隐藏；工具引导段（tool:*）跟随这里的工具/组状态自动隐藏或恢复，不单独配置。',
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

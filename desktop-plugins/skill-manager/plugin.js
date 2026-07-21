/** Native Hermes Desktop skill manager. Plain ESM; no build step. */
import {
  Badge, Button, Codicon, EmptyState, ErrorState, GlyphSpinner, Input,
  PALETTE_AREA, ROUTES_AREA, SIDEBAR_NAV_AREA, ScrollArea, cn, host,
  useMutation, usePluginI18n, useQuery, useQueryClient
} from '@hermes/plugin-sdk'
import { useMemo, useState } from 'react'
import { Fragment, jsx, jsxs } from 'react/jsx-runtime'

const ID = 'skill-manager'
const ROUTE = '/skill-manager'
const QUERY_KEY = [ID, 'inventory']
const REFRESH_INTERVAL_MS = 15000
const SOURCES = ['all', 'builtin', 'hub-installed', 'local', 'codex']
const STATUSES = ['all', 'enabled', 'disabled', 'deleted']
const CONFIRMED_ACTIONS = new Set(['delete', 'delete-codex', 'reset'])
const TONE_CLASSES = {
  enabled: 'text-foreground border-(--ui-stroke-primary)',
  disabled: 'text-(--ui-text-tertiary) border-(--ui-stroke-secondary)',
  deleted: 'text-foreground border-(--ui-stroke-primary)',
  builtin: 'text-(--ui-accent) border-(--ui-accent)',
  'hub-installed': 'text-(--ui-text-secondary) border-(--ui-stroke-primary)',
  local: 'text-(--ui-text-secondary) border-(--ui-stroke-secondary)'
}

const MESSAGES = {
  en: {
    title: 'Skill Manager',
    subtitle: 'Manage Hermes skills and sync them into Codex.',
    search: 'Search',
    searchPlaceholder: 'Search skills, descriptions, sources, statuses, or paths',
    refresh: 'Refresh',
    refreshing: 'Refreshing',
    pluginUpdateButton: 'Update plugin',
    pluginUpdateTitle: 'Update Skill Manager?',
    pluginUpdateBody: 'Hermes will pull the latest plugin version and reload the Desktop entry. If backend files changed, restart the Hermes gateway afterward.',
    pluginUpdateConfirm: 'Update now',
    pluginUpdateSuccess: 'Plugin updated. Restart the Hermes gateway to apply backend changes.',
    pluginUpToDate: 'The plugin is already up to date.',
    retry: 'Retry',
    showDeleted: 'Show deleted built-ins',
    results: (shown, total) => `${shown} of ${total}`,
    allCategories: 'All categories',
    root: '(root)',
    details: 'Skill details',
    close: 'Close',
    noDescription: 'No description',
    recent: 'Recent actions',
    partial: 'Some skill data could not be loaded.',
    loadError: 'Skill inventory unavailable',
    backendUnavailable: 'The skill backend is not mounted. Install or enable the backend plugin, restart Hermes Desktop, then retry.',
    unknownError: 'Unknown error',
    emptyTitle: 'No matching skills',
    emptyBody: 'Adjust or clear the active filters.',
    cancel: 'Cancel',
    confirm: 'Confirm',
    working: 'Working…',
    confirmPlaceholder: 'Type the exact skill name',
    confirmFill: 'Fill name',
    success: (action, name) => `${action}: ${name}`,
    nav: 'Skill Manager',
    open: 'Open Skill Manager',
    stats: { total: 'Total', builtin: 'Built-in', community: 'Community', local: 'Local' },
    sources: {
      all: 'All', builtin: 'Built-in', 'hub-installed': 'Community',
      local: 'Local', codex: 'Codex'
    },
    statuses: { all: 'All statuses', enabled: 'Enabled', disabled: 'Disabled', deleted: 'Deleted' },
    trust: { builtin: 'Built-in', official: 'Official', community: 'Community', local: 'Local' },
    codex: { installed: 'In Codex', notInstalled: 'Not in Codex' },
    codexList: {
      title: 'Codex user skills',
      count: value => `${value} skills`,
      empty: 'No Codex user skills found'
    },
    table: {
      skill: 'Skill', description: 'Description', source: 'Source',
      category: 'Category', status: 'Status', codex: 'Codex',
      path: 'Path', actions: 'Actions'
    },
    fields: {
      category: 'Category', source: 'Source', trust: 'Trust', status: 'Status',
      path: 'Hermes path', identifier: 'Identifier', installed: 'Installed',
      updated: 'Updated', codexStatus: 'Codex status', codexPath: 'Codex path'
    },
    actions: {
      delete: 'Delete', reset: 'Reset', update: 'Update', restore: 'Restore',
      'sync-codex': 'Sync', 'delete-codex': 'Delete', 'plugin-update': 'Plugin update'
    },
    confirmTitle: {
      delete: 'Delete skill', 'delete-codex': 'Delete Codex skill',
      reset: 'Reset skill', 'sync-codex': 'Replace Codex skill'
    },
    confirmBody: {
      delete: name => `This permanently removes the local files for ${name}. Type the exact skill name to continue.`,
      'delete-codex': name => `This permanently removes the Codex user skill ${name}. Type the exact skill name to continue.`,
      reset: name => `This replaces the local contents of ${name} with its source version. Type the exact skill name to continue.`,
      'sync-codex': name => `Codex already has ${name}. Type the exact skill name to replace it with the Hermes copy.`
    }
  },
  zh: {
    title: '技能管理',
    subtitle: '管理 Hermes 技能，并将它们同步到 Codex。',
    search: '搜索',
    searchPlaceholder: '搜索技能、简介、来源、状态或路径',
    refresh: '刷新',
    refreshing: '刷新中',
    pluginUpdateButton: '更新插件',
    pluginUpdateTitle: '更新技能管理插件？',
    pluginUpdateBody: 'Hermes 将拉取最新插件版本并重新加载 Desktop 入口。如果后端文件有变化，更新后还需重启 Hermes 网关。',
    pluginUpdateConfirm: '立即更新',
    pluginUpdateSuccess: '插件已更新。请重启 Hermes 网关以应用后端变更。',
    pluginUpToDate: '插件已是最新版本。',
    retry: '重试',
    showDeleted: '显示已删除内建',
    results: (shown, total) => `显示 ${shown} / ${total}`,
    allCategories: '全部分类',
    root: '（根目录）',
    details: '技能详情',
    close: '关闭',
    noDescription: '无简介',
    recent: '最近操作',
    partial: '部分技能数据加载失败。',
    loadError: '无法加载技能清单',
    backendUnavailable: '技能后端尚未挂载。请安装或启用后端插件，重启 Hermes Desktop 后再重试。',
    unknownError: '未知错误',
    emptyTitle: '没有匹配的技能',
    emptyBody: '请调整或清除当前筛选条件。',
    cancel: '取消',
    confirm: '确认',
    working: '处理中…',
    confirmPlaceholder: '输入完整技能名',
    confirmFill: '填入名称',
    success: (action, name) => `${action}：${name}`,
    nav: '技能管理',
    open: '打开技能管理',
    stats: { total: '总数', builtin: '内建', community: '社区', local: '本地' },
    sources: {
      all: '全部', builtin: '内建', 'hub-installed': '社区',
      local: '本地', codex: 'Codex'
    },
    statuses: { all: '全部状态', enabled: '启用', disabled: '停用', deleted: '已删除' },
    trust: { builtin: '内建', official: '官方', community: '社区', local: '本地' },
    codex: { installed: '已在 Codex', notInstalled: '未在 Codex' },
    codexList: {
      title: 'Codex 用户技能',
      count: value => `${value} 个技能`,
      empty: '尚未发现 Codex 用户技能'
    },
    table: {
      skill: '技能', description: '简介', source: '来源',
      category: '分类', status: '状态', codex: 'Codex',
      path: '路径', actions: '操作'
    },
    fields: {
      category: '分类', source: '来源', trust: '信任', status: '状态',
      path: 'Hermes 路径', identifier: '标识', installed: '安装时间',
      updated: '更新时间', codexStatus: 'Codex 状态', codexPath: 'Codex 路径'
    },
    actions: {
      delete: '删除', reset: '重置', update: '更新', restore: '恢复',
      'sync-codex': '同步', 'delete-codex': '删除', 'plugin-update': '插件更新'
    },
    confirmTitle: {
      delete: '删除技能', 'delete-codex': '删除 Codex 技能',
      reset: '重置技能', 'sync-codex': '覆盖 Codex 技能'
    },
    confirmBody: {
      delete: name => `这会永久删除 ${name} 的本地文件。请输入完整技能名继续。`,
      'delete-codex': name => `这会永久删除 Codex 用户技能 ${name}。请输入完整技能名继续。`,
      reset: name => `这会用来源版本覆盖 ${name} 的本地内容。请输入完整技能名继续。`,
      'sync-codex': name => `Codex 中已存在 ${name}。请输入完整技能名，用 Hermes 副本覆盖它。`
    }
  }
}

let pluginContext

const asArray = value => Array.isArray(value) ? value : []
const sourceOf = row => row.kind || row.source || 'local'
const canSync = row => ['hub-installed', 'local'].includes(sourceOf(row)) && row.status !== 'deleted'
const actionsOf = row => Array.from(new Set([
  ...asArray(row.availableActions),
  ...(canSync(row) ? ['sync-codex'] : [])
]))
const descriptionOf = (row, language) => language === 'zh'
  ? row.descriptionZh || row.description || row.descriptionEn || ''
  : row.descriptionEn || row.description || row.descriptionZh || ''
const currentLanguage = () => {
  const locale = typeof document !== 'undefined'
    ? document.documentElement.lang
    : typeof navigator !== 'undefined' ? navigator.language : ''
  return String(locale || '').toLowerCase().startsWith('zh') ? 'zh' : 'en'
}
const actionVariant = action => ['delete', 'delete-codex'].includes(action)
  ? 'destructive'
  : action === 'sync-codex' ? 'default' : 'secondary'
const requiresConfirmation = (row, action) => CONFIRMED_ACTIONS.has(action)
  || (action === 'sync-codex' && row.codexInstalled)

function errorPayload(error) {
  const raw = error && error.message ? String(error.message) : String(error || '')
  const status = Number((raw.match(/^(\d+):/) || [])[1] || 0)
  try {
    return { raw, status, body: JSON.parse(raw.replace(/^\d+:\s*/, '')) }
  } catch (_ignored) {
    return { raw, status, body: null }
  }
}

function errorMessage(error, fallback, t, backendHint = false) {
  const { raw, status, body } = errorPayload(error)
  const detail = typeof body?.detail === 'string'
    ? body.detail
    : typeof body?.error === 'string'
      ? body.error
      : body?.detail?.message || raw
  if (backendHint && (status === 404 || /headless backend|endpoint is likely missing/i.test(detail))) {
    return t('backendUnavailable')
  }
  return detail || fallback
}

function mutationBody(action, row, confirm) {
  return {
    source: sourceOf(row),
    name: row.name,
    ...(action === 'delete-codex' ? { relative_path: row.relativePath } : {}),
    ...(confirm ? { confirm } : {}),
    force: action === 'sync-codex' && Boolean(confirm)
  }
}

function countSources(rows) {
  return rows.reduce((counts, row) => {
    const source = sourceOf(row)
    counts[source] = (counts[source] || 0) + 1
    return counts
  }, {})
}

function filterRows(rows, filters) {
  const { category, language, query, source, status, t } = filters
  const needle = query.trim().toLowerCase()
  return rows.filter(row => {
    if (source !== 'all' && sourceOf(row) !== source) return false
    if (status !== 'all' && row.status !== status) return false
    if (category !== 'all' && (row.category || t('root')) !== category) return false
    return !needle || [
      row.name, row.category, row.source, row.trustLevel, row.status,
      row.installPath, descriptionOf(row, language)
    ].join('\n').toLowerCase().includes(needle)
  }).sort((left, right) => String(left.name).localeCompare(
    String(right.name),
    undefined,
    { numeric: true, sensitivity: 'base' }
  ))
}

function filterCodexRows(rows, query) {
  const needle = query.trim().toLowerCase()
  return rows.filter(row => !needle || [
    row.name, row.description, row.relativePath, row.path
  ].join('\n').toLowerCase().includes(needle))
}

function useInventoryView(data, filters, showDeleted, t) {
  const installed = asArray(data.skills)
  const missing = asArray(data.missingBuiltinSkills)
  const codex = asArray(data.codexSkills)
  const rows = showDeleted ? installed.concat(missing) : installed
  const categories = useMemo(
    () => Array.from(new Set(rows.map(row => row.category || t('root')))).sort(),
    [rows, t]
  )
  const installedCounts = useMemo(() => countSources(installed), [installed])
  const rowCounts = useMemo(() => countSources(rows), [rows])
  const visible = useMemo(
    () => filterRows(rows, { ...filters, t }),
    [rows, filters.query, filters.source, filters.status, filters.category, filters.language, t]
  )
  const codexVisible = useMemo(
    () => filterCodexRows(codex, filters.query),
    [codex, filters.query]
  )
  return {
    categories, codex, codexVisible, installed, installedCounts,
    missing, rowCounts, rows, visible
  }
}

function useSkillMutation(t, onComplete, onConflict) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ action, row, confirm }) => pluginContext.rest(`/${action}`, {
      method: 'POST',
      body: mutationBody(action, row, confirm)
    }),
    onSuccess: (_data, variables) => {
      host.notify({
        kind: 'success',
        message: t('success', t(`actions.${variables.action}`), variables.row.name)
      })
      onComplete()
      queryClient.invalidateQueries({ queryKey: QUERY_KEY })
    },
    onError: (error, variables) => {
      const payload = errorPayload(error)
      if (variables.action === 'sync-codex' && !variables.confirm && payload.status === 409) {
        onConflict(variables)
        return
      }
      host.notify({ kind: 'error', message: errorMessage(error, t('unknownError'), t) })
    }
  })
}

function usePluginUpdate(t, onComplete) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => pluginContext.rest('/plugin-update', {
      method: 'POST',
      body: { confirm: ID },
      timeoutMs: 70000
    }),
    onSuccess: data => {
      host.notify({
        kind: 'success',
        message: t(data.unchanged ? 'pluginUpToDate' : 'pluginUpdateSuccess')
      })
      onComplete()
      queryClient.invalidateQueries({ queryKey: QUERY_KEY })
    },
    onError: error => {
      host.notify({ kind: 'error', message: errorMessage(error, t('unknownError'), t) })
    }
  })
}

function ToneBadge({ children, tone }) {
  return jsx(Badge, {
    className: cn('max-w-full truncate border bg-transparent font-normal', TONE_CLASSES[tone]),
    children
  })
}

function Stat({ label, value }) {
  return jsxs('div', {
    className: 'flex min-w-24 items-baseline gap-2 py-1',
    children: [
      jsx('div', { className: 'text-xs text-(--ui-text-tertiary)', children: label }),
      jsx('div', { className: 'text-lg font-semibold tabular-nums', children: value })
    ]
  })
}

function ActionButtons({ busy, onAction, row, t }) {
  const actions = actionsOf(row)
  if (!actions.length) return null
  return jsx('div', {
    className: 'flex flex-wrap items-center gap-2 md:justify-end',
    children: actions.map(action => jsx(Button, {
      disabled: busy,
      size: 'sm',
      variant: actionVariant(action),
      onClick: () => onAction(row, action),
      children: t(`actions.${action}`)
    }, action))
  })
}

function DetailDrawer({ busy, language, onAction, onClose, row, t }) {
  if (!row) return null
  const fields = [
    [t('fields.category'), row.category || t('root')],
    [t('fields.source'), t(`sources.${sourceOf(row)}`)],
    [t('fields.trust'), t(`trust.${row.trustLevel || sourceOf(row)}`)],
    [t('fields.status'), t(`statuses.${row.status}`)],
    [t('fields.path'), row.installPath || '-'],
    [t('fields.identifier'), row.identifier || '-'],
    [t('fields.installed'), row.installedAt || '-'],
    [t('fields.updated'), row.updatedAt || '-']
  ]
  if (canSync(row)) fields.push(
    [t('fields.codexStatus'), row.codexInstalled ? t('codex.installed') : t('codex.notInstalled')],
    [t('fields.codexPath'), row.codexPath || '-']
  )
  return jsx('div', {
    className: 'fixed inset-0 z-40 flex justify-end bg-background/90 backdrop-blur-sm',
    role: 'presentation',
    onMouseDown: event => event.target === event.currentTarget && onClose(),
    children: jsxs('section', {
      'aria-label': t('details'),
      'aria-modal': true,
      className: 'flex h-full w-full max-w-lg flex-col border-l border-(--ui-stroke-secondary) bg-background shadow-xl',
      role: 'dialog',
      children: [
        jsxs('header', {
          className: 'flex items-start justify-between gap-3 border-b border-(--ui-stroke-secondary) p-4',
          children: [
            jsxs('div', { children: [
              jsx('div', { className: 'text-xs text-(--ui-text-tertiary)', children: t('details') }),
              jsx('h2', { className: 'mt-1 break-all text-lg font-semibold', children: row.name })
            ] }),
            jsx(Button, {
              'aria-label': t('close'), size: 'icon', variant: 'ghost', onClick: onClose,
              children: jsx(Codicon, { name: 'close' })
            })
          ]
        }),
        jsx(ScrollArea, {
          className: 'min-h-0 flex-1',
          children: jsxs('div', { className: 'space-y-5 p-4', children: [
            jsx('p', {
              className: 'whitespace-pre-wrap break-words text-sm leading-6 text-(--ui-text-secondary)',
              children: descriptionOf(row, language) || t('noDescription')
            }),
            jsx('dl', {
              className: 'space-y-3',
              children: fields.map(([label, value]) => jsxs('div', {
                className: 'grid gap-1 sm:grid-cols-[8rem_minmax(0,1fr)]',
                children: [
                  jsx('dt', { className: 'text-xs text-(--ui-text-tertiary)', children: label }),
                  jsx('dd', { className: 'break-all text-sm', children: value })
                ]
              }, label))
            })
          ] })
        }),
        actionsOf(row).length ? jsx('footer', {
          className: 'border-t border-(--ui-stroke-secondary) p-4',
          children: jsx(ActionButtons, { busy, onAction, row, t })
        }) : null
      ]
    })
  })
}

function ConfirmOverlay({ busy, onCancel, onConfirm, pending, t }) {
  const [value, setValue] = useState('')
  if (!pending) return null
  const valid = value === pending.row.name && !busy
  return jsx('div', {
    className: 'fixed inset-0 z-50 grid place-items-center bg-background/90 p-4 backdrop-blur-sm',
    role: 'presentation',
    onMouseDown: event => !busy && event.target === event.currentTarget && onCancel(),
    children: jsxs('section', {
      'aria-modal': true,
      className: 'w-full max-w-md rounded-lg border border-(--ui-stroke-secondary) bg-background p-4 shadow-xl',
      role: 'dialog',
      children: [
        jsx('h2', { className: 'text-base font-semibold', children: t(`confirmTitle.${pending.action}`) }),
        jsx('p', {
          className: 'mt-2 text-sm leading-6 text-(--ui-text-secondary)',
          children: t(`confirmBody.${pending.action}`, pending.row.name)
        }),
        jsx('code', {
          className: 'mt-3 block break-all rounded border border-(--ui-stroke-secondary) px-2 py-1.5 text-sm',
          children: pending.row.name
        }),
        jsxs('div', { className: 'mt-3 flex items-center gap-2', children: [
          jsx(Input, {
            autoFocus: true,
            className: 'min-w-0 flex-1',
            disabled: busy,
            placeholder: t('confirmPlaceholder'),
            value,
            onChange: event => setValue(event.target.value),
            onKeyDown: event => event.key === 'Enter' && valid && onConfirm(value)
          }),
          jsx(Button, {
            'aria-label': t('confirmFill'),
            disabled: busy,
            size: 'sm',
            title: t('confirmFill'),
            variant: 'secondary',
            onClick: () => setValue(pending.row.name),
            children: jsxs(Fragment, { children: [
              jsx(Codicon, { name: 'edit' }),
              ` ${t('confirmFill')}`
            ] })
          })
        ] }),
        jsxs('footer', { className: 'mt-4 flex justify-end gap-2', children: [
          jsx(Button, { disabled: busy, variant: 'ghost', onClick: onCancel, children: t('cancel') }),
          jsx(Button, {
            disabled: !valid,
            variant: actionVariant(pending.action),
            onClick: () => onConfirm(value),
            children: busy ? t('working') : t('confirm')
          })
        ] })
      ]
    })
  })
}

function PluginUpdateOverlay({ busy, onCancel, onConfirm, open, t }) {
  if (!open) return null
  return jsx('div', {
    className: 'fixed inset-0 z-50 grid place-items-center bg-background/90 p-4 backdrop-blur-sm',
    role: 'presentation',
    onMouseDown: event => !busy && event.target === event.currentTarget && onCancel(),
    children: jsxs('section', {
      'aria-labelledby': 'plugin-update-title',
      'aria-modal': true,
      className: 'w-full max-w-md rounded-lg border border-(--ui-stroke-secondary) bg-background p-4 shadow-xl',
      role: 'dialog',
      children: [
        jsx('h2', {
          className: 'text-base font-semibold',
          id: 'plugin-update-title',
          children: t('pluginUpdateTitle')
        }),
        jsx('p', {
          className: 'mt-2 text-sm leading-6 text-(--ui-text-secondary)',
          children: t('pluginUpdateBody')
        }),
        jsxs('footer', { className: 'mt-4 flex justify-end gap-2', children: [
          jsx(Button, { disabled: busy, variant: 'ghost', onClick: onCancel, children: t('cancel') }),
          jsx(Button, {
            disabled: busy,
            onClick: onConfirm,
            children: busy ? t('working') : t('pluginUpdateConfirm')
          })
        ] })
      ]
    })
  })
}

function Diagnostics({ rows, t }) {
  if (!rows.length) return null
  return jsx('section', {
    className: 'rounded-md border border-(--ui-stroke-primary) p-3 text-sm',
    children: jsxs(Fragment, { children: [
      jsx('strong', { children: t('partial') }),
      jsx('ul', {
        className: 'mt-2 list-disc pl-5 text-(--ui-text-secondary)',
        children: rows.map((item, index) => jsx('li', {
          children: `${item.component}: ${item.message}`
        }, `${item.component}:${index}`))
      })
    ] })
  })
}

function History({ history, t }) {
  if (!history.length) return null
  return jsxs('details', {
    className: 'rounded-md border border-(--ui-stroke-secondary)',
    children: [
      jsx('summary', { className: 'cursor-pointer px-3 py-2 text-sm font-medium', children: t('recent') }),
      jsx('div', {
        className: 'grid gap-2 border-t border-(--ui-stroke-secondary) p-3',
        children: history.slice(0, 5).map((item, index) => jsxs('div', {
          className: 'grid gap-1 rounded border border-(--ui-stroke-secondary) px-3 py-2 text-sm sm:grid-cols-[6rem_minmax(0,1fr)_10rem]',
          children: [
            jsx('span', { children: t(`actions.${item.action}`) }),
            jsx('strong', { className: 'min-w-0 break-all font-medium', children: item.name || '-' }),
            jsx('time', {
              className: 'text-(--ui-text-tertiary)',
              children: item.at ? new Date(item.at).toLocaleString() : '-'
            })
          ]
        }, `${item.at || index}:${item.name || ''}`))
      })
    ]
  })
}

function CodexTable({ busy, onAction, path, rows, t }) {
  if (!rows.length) return jsx(EmptyState, {
    title: t('codexList.empty'),
    description: path || '-'
  })
  return jsxs('section', {
    className: 'space-y-2',
    children: [
      jsx('code', {
        className: 'block break-all text-xs text-(--ui-text-tertiary)',
        children: path || '-'
      }),
      jsx('div', {
        className: 'overflow-x-auto border border-(--ui-stroke-secondary)',
        children: jsxs('table', {
          'aria-label': t('codexList.title'),
          className: 'w-full min-w-[46rem] border-collapse text-sm',
          children: [
            jsx('thead', {
              className: 'bg-(--ui-bg-secondary) text-left text-xs text-(--ui-text-tertiary)',
              children: jsx('tr', { children: [
                jsx('th', { className: 'px-3 py-2 font-medium', children: t('table.skill') }),
                jsx('th', { className: 'px-3 py-2 font-medium', children: t('table.description') }),
                jsx('th', { className: 'px-3 py-2 font-medium', children: t('table.path') }),
                jsx('th', { className: 'px-3 py-2 text-right font-medium', children: t('table.actions') })
              ] })
            }),
            jsx('tbody', {
              className: 'divide-y divide-(--ui-stroke-secondary)',
              children: rows.map(row => jsx('tr', {
                className: 'align-top hover:bg-(--ui-bg-secondary)',
                children: [
                  jsx('td', { className: 'px-3 py-2 font-medium', children: row.name }),
                  jsx('td', {
                    className: 'max-w-sm px-3 py-2 text-(--ui-text-secondary)',
                    children: row.description || t('noDescription')
                  }),
                  jsx('td', {
                    className: 'px-3 py-2',
                    children: jsx('code', { className: 'break-all text-xs', children: row.relativePath })
                  }),
                  jsx('td', {
                    className: 'px-3 py-2 text-right',
                    children: jsx(Button, {
                      disabled: busy,
                      size: 'sm',
                      variant: 'destructive',
                      onClick: () => onAction(row, 'delete-codex'),
                      children: t('actions.delete-codex')
                    })
                  })
                ]
              }, row.relativePath))
            })
          ]
        })
      })
    ]
  })
}

function PageHeader({ counts, fetching, onRefresh, onUpdate, total, t, updating }) {
  return jsxs('header', {
    className: 'border-b border-(--ui-stroke-secondary) px-4 py-4',
    children: [
      jsxs('div', { className: 'flex flex-wrap items-start justify-between gap-3', children: [
        jsxs('div', { children: [
          jsx('h1', { className: 'text-lg font-semibold', children: t('title') }),
          jsx('p', { className: 'mt-1 text-sm text-(--ui-text-secondary)', children: t('subtitle') })
        ] }),
        jsxs('div', { className: 'flex flex-wrap gap-2', children: [
          jsx(Button, {
            disabled: updating,
            onClick: onUpdate,
            children: jsxs(Fragment, { children: [
              jsx(Codicon, { name: 'cloud-download' }),
              ` ${updating ? t('working') : t('pluginUpdateButton')}`
            ] })
          }),
          jsx(Button, {
            disabled: fetching,
            variant: 'secondary',
            onClick: onRefresh,
            children: jsxs(Fragment, { children: [
              jsx(Codicon, { name: 'refresh' }),
              ` ${fetching ? t('refreshing') : t('refresh')}`
            ] })
          })
        ] })
      ] }),
      jsxs('div', { className: 'mt-4 flex flex-wrap gap-x-6 gap-y-1', children: [
        jsx(Stat, { label: t('stats.total'), value: total }),
        jsx(Stat, { label: t('stats.builtin'), value: counts.builtin || 0 }),
        jsx(Stat, { label: t('stats.community'), value: counts['hub-installed'] || 0 }),
        jsx(Stat, { label: t('stats.local'), value: counts.local || 0 })
      ] })
    ]
  })
}

function FilterPanel({ categories, codexCount, counts, filters, missingCount, onChange, rows, visibleCount, t }) {
  const showingCodex = filters.source === 'codex'
  return jsxs('section', {
    className: 'space-y-3 rounded-md border border-(--ui-stroke-secondary) p-3',
    children: [
      jsx('div', {
        className: 'flex flex-wrap gap-2',
        children: SOURCES.map(key => jsx(Button, {
          size: 'sm',
          variant: filters.source === key ? 'default' : 'secondary',
          onClick: () => onChange('source', key),
          children: `${t(`sources.${key}`)} ${key === 'all'
            ? rows.length
            : key === 'codex' ? codexCount : counts[key] || 0}`
        }, key))
      }),
      jsxs('div', {
        className: showingCodex
          ? 'grid gap-2'
          : 'grid gap-2 lg:grid-cols-[minmax(16rem,1fr)_12rem_12rem_auto]',
        children: [
          jsx(Input, {
            'aria-label': t('search'),
            placeholder: t('searchPlaceholder'),
            value: filters.query,
            onChange: event => onChange('query', event.target.value)
          }),
          showingCodex ? null : jsx('select', {
            'aria-label': t('fields.category'),
            className: 'h-8 rounded border border-(--ui-stroke-secondary) bg-transparent px-2 text-sm',
            value: filters.category,
            onChange: event => onChange('category', event.target.value),
            children: [
              jsx('option', { value: 'all', children: t('allCategories') }),
              ...categories.map(value => jsx('option', { value, children: value }, value))
            ]
          }),
          showingCodex ? null : jsx('select', {
            'aria-label': t('fields.status'),
            className: 'h-8 rounded border border-(--ui-stroke-secondary) bg-transparent px-2 text-sm',
            value: filters.status,
            onChange: event => onChange('status', event.target.value),
            children: STATUSES.map(value => jsx('option', {
              value,
              children: t(`statuses.${value}`)
            }, value))
          }),
          showingCodex ? null : jsxs('label', { className: 'flex min-h-8 items-center gap-2 text-sm', children: [
            jsx('input', {
              type: 'checkbox',
              checked: filters.showDeleted,
              onChange: event => onChange('showDeleted', event.target.checked)
            }),
            `${t('showDeleted')} (${missingCount})`
          ] })
        ]
      }),
      jsx('div', {
        className: 'text-xs text-(--ui-text-tertiary)',
        children: t('results', visibleCount, rows.length)
      })
    ]
  })
}

function SkillTable({ busy, language, onAction, onSelect, rows, t }) {
  if (!rows.length) return jsx(EmptyState, { title: t('emptyTitle'), description: t('emptyBody') })
  return jsx('div', {
    className: 'overflow-x-auto border border-(--ui-stroke-secondary)',
    children: jsxs('table', { className: 'w-full min-w-[72rem] border-collapse text-sm', children: [
      jsx('thead', {
        className: 'bg-(--ui-bg-secondary) text-left text-xs text-(--ui-text-tertiary)',
        children: jsx('tr', { children: [
          jsx('th', { className: 'px-3 py-2 font-medium', children: t('table.skill') }),
          jsx('th', { className: 'px-3 py-2 font-medium', children: t('table.description') }),
          jsx('th', { className: 'px-3 py-2 font-medium', children: t('table.source') }),
          jsx('th', { className: 'px-3 py-2 font-medium', children: t('table.category') }),
          jsx('th', { className: 'px-3 py-2 font-medium', children: t('table.status') }),
          jsx('th', { className: 'px-3 py-2 font-medium', children: t('table.codex') }),
          jsx('th', { className: 'px-3 py-2 text-right font-medium', children: t('table.actions') })
        ] })
      }),
      jsx('tbody', {
        className: 'divide-y divide-(--ui-stroke-secondary)',
        children: rows.map(row => jsx('tr', {
          className: 'align-top hover:bg-(--ui-bg-secondary)',
          children: [
            jsx('td', {
              className: 'px-3 py-2',
              children: jsx('button', {
                className: 'break-all text-left font-medium hover:underline',
                type: 'button',
                onClick: () => onSelect(row),
                children: row.name
              })
            }),
            jsx('td', {
              className: 'max-w-sm px-3 py-2 text-(--ui-text-secondary)',
              children: descriptionOf(row, language) || t('noDescription')
            }),
            jsx('td', {
              className: 'px-3 py-2',
              children: jsx(ToneBadge, { tone: sourceOf(row), children: t(`sources.${sourceOf(row)}`) })
            }),
            jsx('td', { className: 'px-3 py-2', children: row.category || t('root') }),
            jsx('td', {
              className: 'px-3 py-2',
              children: jsx(ToneBadge, { tone: row.status, children: t(`statuses.${row.status}`) })
            }),
            jsx('td', {
              className: 'px-3 py-2',
              children: canSync(row)
                ? t(row.codexInstalled ? 'codex.installed' : 'codex.notInstalled')
                : '-'
            }),
            jsx('td', {
              className: 'px-3 py-2',
              children: jsx(ActionButtons, { busy, onAction, row, t })
            })
          ]
        }, `${sourceOf(row)}:${row.name}`))
      })
    ] })
  })
}

function SkillManagePage() {
  const t = usePluginI18n(ID)
  const [filters, setFilters] = useState({
    query: '', source: 'all', status: 'all', category: 'all',
    showDeleted: false
  })
  const [selected, setSelected] = useState(null)
  const [pending, setPending] = useState(null)
  const [pluginUpdateOpen, setPluginUpdateOpen] = useState(false)
  const inventory = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => pluginContext.rest('/inventory'),
    refetchInterval: REFRESH_INTERVAL_MS,
    retry: 2,
    retryDelay: attempt => Math.min(1000 * (attempt + 1), 3000)
  })
  const mutation = useSkillMutation(
    t,
    () => { setPending(null); setSelected(null) },
    variables => setPending({ row: variables.row, action: variables.action })
  )
  const pluginUpdate = usePluginUpdate(t, () => setPluginUpdateOpen(false))
  const data = inventory.data || {}
  const language = currentLanguage()
  const view = useInventoryView(data, { ...filters, language }, filters.showDeleted, t)
  const showingCodex = filters.source === 'codex'
  const changeFilter = (key, value) => setFilters(current => ({ ...current, [key]: value }))
  const beginAction = (row, action) => requiresConfirmation(row, action)
    ? setPending({ row, action })
    : mutation.mutate({ row, action, confirm: '' })

  if (inventory.isPending) {
    return jsx('div', { className: 'grid h-full place-items-center', children: jsx(GlyphSpinner, {}) })
  }
  if (inventory.isError) {
    return jsx('div', {
      className: 'grid h-full place-items-center p-6',
      children: jsx(ErrorState, {
        title: t('loadError'),
        description: errorMessage(inventory.error, t('unknownError'), t, true),
        children: jsx(Button, {
          variant: 'secondary',
          onClick: () => inventory.refetch(),
          children: t('retry')
        })
      })
    })
  }

  return jsxs(Fragment, { children: [
    jsxs('div', { className: 'flex h-full min-h-0 flex-col', children: [
      jsx(PageHeader, {
        counts: view.installedCounts,
        fetching: inventory.isFetching,
        onRefresh: () => inventory.refetch(),
        onUpdate: () => setPluginUpdateOpen(true),
        total: view.installed.length,
        t,
        updating: pluginUpdate.isPending
      }),
      jsx(ScrollArea, {
        className: 'min-h-0 flex-1',
        children: jsxs('main', { className: 'mx-auto w-full max-w-7xl space-y-4 p-4', children: [
          jsx('code', {
            className: 'block max-w-full break-all text-xs text-(--ui-text-tertiary)',
            children: data.meta?.skillsDir
          }),
          jsx(Diagnostics, { rows: asArray(data.diagnostics), t }),
          jsx(FilterPanel, {
            categories: view.categories,
            codexCount: view.codex.length,
            counts: view.rowCounts,
            filters,
            missingCount: data.missingBuiltinCount || 0,
            onChange: changeFilter,
            rows: view.rows,
            visibleCount: showingCodex ? view.codexVisible.length : view.visible.length,
            t
          }),
          showingCodex
            ? jsx(CodexTable, {
                busy: mutation.isPending,
                onAction: beginAction,
                path: data.meta?.codexSkillsDir,
                rows: view.codexVisible,
                t
              })
            : jsx(SkillTable, {
                busy: mutation.isPending,
                language,
                onAction: beginAction,
                onSelect: setSelected,
                rows: view.visible,
                t
              }),
          jsx(History, { history: asArray(data.history), t })
        ] })
      })
    ] }),
    jsx(DetailDrawer, {
      busy: mutation.isPending,
      language,
      row: selected,
      t,
      onClose: () => setSelected(null),
      onAction: beginAction
    }),
    jsx(ConfirmOverlay, {
      key: pending ? `${pending.action}:${pending.row.name}` : 'none',
      busy: mutation.isPending,
      pending,
      t,
      onCancel: () => setPending(null),
      onConfirm: confirm => mutation.mutate({ ...pending, confirm })
    }),
    jsx(PluginUpdateOverlay, {
      busy: pluginUpdate.isPending,
      open: pluginUpdateOpen,
      t,
      onCancel: () => setPluginUpdateOpen(false),
      onConfirm: () => pluginUpdate.mutate()
    })
  ] })
}

export default {
  id: ID,
  name: 'Skill Manager',
  register(ctx) {
    pluginContext = ctx
    ctx.i18n.register(MESSAGES)
    ctx.registerMany([
      {
        id: 'route',
        area: ROUTES_AREA,
        data: { path: ROUTE },
        render: () => jsx(SkillManagePage, {})
      },
      {
        id: 'nav',
        area: SIDEBAR_NAV_AREA,
        data: { path: ROUTE, label: ctx.i18n.t('nav'), codicon: 'extensions' }
      },
      {
        id: 'open',
        area: PALETTE_AREA,
        data: {
          id: 'skill-manager.open',
          label: ctx.i18n.t('open'),
          keywords: ['skill', 'manage', '技能'],
          run: () => host.navigate(ROUTE)
        }
      }
    ])
  }
}

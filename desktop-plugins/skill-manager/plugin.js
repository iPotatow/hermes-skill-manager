/** Native Hermes Desktop skill manager. Plain ESM; no build step. */
import {
  Badge, Button, Codicon, CopyButton, EmptyState, ErrorState, GlyphSpinner,
  Input, SegmentedControl, StatusDot,
  PALETTE_AREA, ROUTES_AREA, SIDEBAR_NAV_AREA, ScrollArea, cn, host,
  useMutation, usePluginI18n, useQuery, useQueryClient
} from '@hermes/plugin-sdk'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Fragment, jsx, jsxs } from 'react/jsx-runtime'

const ID = 'skill-manager'
const ROUTE = '/skill-manager'
const QUERY_KEY = [ID, 'inventory']
const REFRESH_INTERVAL_MS = 15000
// Hub mutations can download content and run a security scan. Hermes Desktop's
// generic 15s REST timeout is too short for that workflow.
const HUB_MUTATION_TIMEOUT_MS = 300000
const VIEWS = ['hermes', 'codex']
const SOURCES = ['all', 'builtin', 'optional', 'hub-installed', 'local']
const CONFIRMED_ACTIONS = new Set(['delete', 'delete-codex', 'reset'])
const TONE_CLASSES = {
  enabled: 'text-foreground border-(--ui-stroke-primary)',
  disabled: 'text-(--ui-text-tertiary) border-(--ui-stroke-secondary)',
  deleted: 'text-foreground border-(--ui-stroke-primary)',
  builtin: 'text-(--ui-accent) border-(--ui-accent)',
  'hub-installed': 'text-(--ui-text-secondary) border-(--ui-stroke-primary)',
  local: 'text-(--ui-text-secondary) border-(--ui-stroke-secondary)',
  installed: 'text-(--ui-accent) border-(--ui-accent)',
  missing: 'text-(--ui-text-tertiary) border-(--ui-stroke-secondary)'
}

const MESSAGES = {
  en: {
    language: 'en',
    title: 'Skill Manager',
    subtitle: 'Manage Hermes skills and sync them into Codex.',
    search: 'Search',
    searchPlaceholder: 'Search skills, descriptions, sources, or paths',
    refresh: 'Refresh',
    refreshing: 'Refreshing',
    pluginUpdateButton: 'Update plugin',
    pluginUpdateTitle: 'Update Skill Manager?',
    pluginUpdateBody: 'Hermes will pull the latest plugin version and reload the Desktop entry. If backend files changed, restart the Hermes gateway afterward.',
    pluginUpdateConfirm: 'Update now',
    pluginUpdateSuccess: 'Plugin updated. Restart the Hermes gateway to apply backend changes.',
    pluginUpToDate: 'The plugin is already up to date.',
    retry: 'Retry',
    showMissingBuiltin: 'Show restorable built-ins',
    results: (shown, total) => `${shown} of ${total}`,
    clearFilters: 'Clear filters',
    copy: 'Copy',
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
    operation: {
      title: 'Operation progress',
      subject: (action, name) => `${action} · ${name}`,
      dismiss: 'Dismiss progress',
      phases: {
        confirm: 'Waiting for confirmation',
        execute: 'Applying change',
        refresh: 'Refreshing inventory',
        success: 'Completed',
        error: 'Failed'
      },
      steps: { confirm: 'Confirm', execute: 'Apply', refresh: 'Refresh' }
    },
    nav: 'Skill Manager',
    open: 'Open Skill Manager',
    views: { hermes: 'Hermes skills', codex: 'Codex skills' },
    stats: { disabled: 'Disabled', restorable: 'Restorable', diagnostics: 'Diagnostics' },
    sources: {
      all: 'All', builtin: 'Built-in', optional: 'Optional', 'hub-installed': 'Community',
      local: 'Local', codex: 'Codex'
    },
    statuses: { all: 'All statuses', enabled: 'Enabled', disabled: 'Disabled', deleted: 'Deleted' },
    trust: { builtin: 'Built-in', official: 'Official', community: 'Community', local: 'Local' },
    hermesSync: { title: 'Hermes sync', synced: 'Synced from Hermes', codexOnly: 'Codex only' },
    codexList: {
      title: 'Codex user skills',
      count: value => `${value} skills`,
      empty: 'No Codex user skills found'
    },
    optionalList: {
      title: 'Official Optional skills',
      empty: 'No Optional skills found',
      installed: 'Installed',
      available: 'Available'
    },
    table: {
      skill: 'Skill', category: 'Category', source: 'Source', type: 'Type',
      path: 'Path', actions: 'Actions'
    },
    fields: {
      category: 'Category', source: 'Source', type: 'Type', trust: 'Trust', status: 'Status',
      path: 'Hermes path', identifier: 'Identifier', installed: 'Installed',
      updated: 'Updated'
    },
    actions: {
      delete: 'Delete', reset: 'Reset', update: 'Update', restore: 'Restore',
      'sync-codex': 'Sync', 'delete-codex': 'Delete', 'install-optional': 'Install',
      'plugin-update': 'Plugin update'
    },
    detailGroups: { overview: 'Overview', location: 'Location' },
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
    language: 'zh',
    title: '技能管理',
    subtitle: '管理 Hermes 技能，并将它们同步到 Codex。',
    search: '搜索',
    searchPlaceholder: '搜索技能、简介、来源或路径',
    refresh: '刷新',
    refreshing: '刷新中',
    pluginUpdateButton: '更新插件',
    pluginUpdateTitle: '更新技能管理插件？',
    pluginUpdateBody: 'Hermes 将拉取最新插件版本并重新加载 Desktop 入口。如果后端文件有变化，更新后还需重启 Hermes 网关。',
    pluginUpdateConfirm: '立即更新',
    pluginUpdateSuccess: '插件已更新。请重启 Hermes 网关以应用后端变更。',
    pluginUpToDate: '插件已是最新版本。',
    retry: '重试',
    showMissingBuiltin: '显示可恢复的内建技能',
    results: (shown, total) => `显示 ${shown} / ${total}`,
    clearFilters: '清除筛选',
    copy: '复制',
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
    operation: {
      title: '操作进度',
      subject: (action, name) => `${action} · ${name}`,
      dismiss: '关闭进度',
      phases: {
        confirm: '等待确认',
        execute: '正在执行',
        refresh: '正在刷新清单',
        success: '操作完成',
        error: '操作失败'
      },
      steps: { confirm: '确认', execute: '执行', refresh: '刷新' }
    },
    nav: '技能管理',
    open: '打开技能管理',
    views: { hermes: 'Hermes 技能', codex: 'Codex 技能' },
    stats: { disabled: '已停用', restorable: '可恢复', diagnostics: '诊断' },
    sources: {
      all: '全部', builtin: '内建', optional: '可选', 'hub-installed': '社区',
      local: '本地', codex: 'Codex'
    },
    statuses: { all: '全部状态', enabled: '启用', disabled: '停用', deleted: '已删除' },
    trust: { builtin: '内建', official: '官方', community: '社区', local: '本地' },
    hermesSync: { title: 'Hermes 同步', synced: '同步于 Hermes', codexOnly: '仅 Codex' },
    codexList: {
      title: 'Codex 用户技能',
      count: value => `${value} 个技能`,
      empty: '尚未发现 Codex 用户技能'
    },
    optionalList: {
      title: '官方 Optional 技能',
      empty: '尚未发现 Optional 技能',
      installed: '已安装',
      available: '可安装'
    },
    table: {
      skill: '技能', category: '分类', source: '来源', type: '类型',
      path: '路径', actions: '操作'
    },
    fields: {
      category: '分类', source: '来源', type: '类型', trust: '信任', status: '状态',
      path: 'Hermes 路径', identifier: '标识', installed: '安装时间',
      updated: '更新时间'
    },
    actions: {
      delete: '删除', reset: '重置', update: '更新', restore: '恢复',
      'sync-codex': '同步', 'delete-codex': '删除', 'install-optional': '安装',
      'plugin-update': '插件更新'
    },
    detailGroups: { overview: '基本信息', location: '来源与路径' },
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
const rawSourceOf = row => row.rawSource || row.source || sourceOf(row)
const canSync = row => ['builtin', 'hub-installed', 'local'].includes(sourceOf(row))
  && row.status !== 'deleted'
const actionsOf = row => Array.from(new Set([
  ...asArray(row.availableActions),
  ...(canSync(row) ? ['sync-codex'] : [])
]))
const descriptionOf = (row, language) => language === 'zh'
  ? row.descriptionZh || row.description || row.descriptionEn || ''
  : row.descriptionEn || row.description || row.descriptionZh || ''
const actionVariant = action => ['delete', 'delete-codex'].includes(action)
  ? 'destructive'
  : action === 'sync-codex' ? 'default' : 'secondary'
const requiresConfirmation = (row, action) => CONFIRMED_ACTIONS.has(action)
  || (action === 'sync-codex' && row.codexInstalled)
const actionLabel = (_row, action, t) => t(`actions.${action}`)
const hasValue = value => value !== undefined && value !== null && value !== '' && value !== '-'
const OPERATION_STEPS = ['confirm', 'execute', 'refresh']
const operationIsRunning = activity => ['confirm', 'execute', 'refresh'].includes(activity?.phase)
const operationIsTerminal = activity => ['success', 'error'].includes(activity?.phase)
const operationMatches = (activity, row) => Boolean(
  activity?.row
  && activity.row.name === row.name
  && (activity.row.relativePath || '') === (row.relativePath || '')
  && sourceOf(activity.row) === sourceOf(row)
)

function useDialogA11y(open, onClose, closable = true) {
  const ref = useRef(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  useEffect(() => {
    if (!open || !ref.current) return undefined
    const node = ref.current
    const previous = document.activeElement
    const focusableSelector = [
      'button:not([disabled])', '[href]', 'input:not([disabled])',
      'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])'
    ].join(',')
    const focusables = () => Array.from(node.querySelectorAll(focusableSelector))
    focusables()[0]?.focus()
    const onKeyDown = event => {
      if (event.key === 'Escape' && closable) {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const items = focusables()
      if (!items.length) {
        event.preventDefault()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      previous?.focus?.()
    }
  }, [closable, open])
  return ref
}

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
    ...(action === 'install-optional' ? { identifier: row.identifier } : {}),
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
  const { category, language, query, source, t } = filters
  const needle = query.trim().toLowerCase()
  return rows.filter(row => {
    if (source !== 'all' && sourceOf(row) !== source) return false
    if (category !== 'all' && (row.category || t('root')) !== category) return false
    return !needle || [
      row.name, row.category, row.source, row.trustLevel,
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
    row.name, row.description, row.relativePath, row.path,
    row.hermesSkill?.name, row.hermesSkill?.source, row.hermesSkill?.kind
  ].join('\n').toLowerCase().includes(needle))
}

function filterOptionalRows(rows, filters) {
  const { category, query } = filters
  const needle = query.trim().toLowerCase()
  return rows.filter(row => {
    if (category !== 'all' && (row.category || '') !== category) return false
    return !needle || [
      row.name, row.description, row.category, row.identifier, row.catalogPath
    ].join('\n').toLowerCase().includes(needle)
  })
}

function linkCodexToHermes(codexRows, hermesRows) {
  const syncedByName = new Map(
    hermesRows.filter(row => row.codexInstalled).map(row => [row.name, row])
  )
  return codexRows.map(row => ({ ...row, hermesSkill: syncedByName.get(row.name) || null }))
}

function useInventoryView(data, filters, showMissingBuiltin, t) {
  const installed = asArray(data.skills)
  const missing = asArray(data.missingBuiltinSkills)
  const codex = asArray(data.codexSkills)
  const optional = asArray(data.optionalSkills)
  const linkedCodex = useMemo(() => linkCodexToHermes(codex, installed), [codex, installed])
  const rows = showMissingBuiltin ? installed.concat(missing) : installed
  const categories = useMemo(
    () => Array.from(new Set(rows.map(row => row.category || t('root')))).sort(),
    [rows, t]
  )
  const rowCounts = useMemo(() => countSources(rows), [rows])
  const visible = useMemo(
    () => filterRows(rows, { ...filters, t }),
    [rows, filters.query, filters.source, filters.category, filters.language, t]
  )
  const codexVisible = useMemo(
    () => filterCodexRows(linkedCodex, filters.query),
    [linkedCodex, filters.query]
  )
  const optionalCategories = useMemo(
    () => Array.from(new Set(optional.map(row => row.category).filter(Boolean))).sort(),
    [optional]
  )
  const optionalVisible = useMemo(
    () => filterOptionalRows(optional, filters),
    [optional, filters.query, filters.category]
  )
  return {
    categories, codex: linkedCodex, codexVisible, installed, missing, optional,
    optionalCategories, optionalVisible, rowCounts, rows, visible
  }
}

function useSkillMutation(t, onComplete, onConflict, onActivity) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ action, row, confirm }) => pluginContext.rest(`/${action}`, {
      method: 'POST',
      body: mutationBody(action, row, confirm),
      timeoutMs: ['update', 'install-optional'].includes(action)
        ? HUB_MUTATION_TIMEOUT_MS
        : undefined
    }),
    onMutate: variables => {
      onActivity({ action: variables.action, row: variables.row, phase: 'execute' })
    },
    onSuccess: async (_data, variables) => {
      onActivity({ action: variables.action, row: variables.row, phase: 'refresh' })
      await queryClient.invalidateQueries({ queryKey: QUERY_KEY }).catch(() => {})
      onComplete()
      onActivity({ action: variables.action, row: variables.row, phase: 'success' })
      host.notify({
        kind: 'success',
        message: t('success', t(`actions.${variables.action}`), variables.row.name)
      })
    },
    onError: (error, variables) => {
      const payload = errorPayload(error)
      if (variables.action === 'sync-codex' && !variables.confirm && payload.status === 409) {
        onActivity({ action: variables.action, row: variables.row, phase: 'confirm' })
        onConflict(variables)
        return
      }
      const message = errorMessage(error, t('unknownError'), t)
      onActivity({
        action: variables.action,
        row: variables.row,
        phase: 'error',
        failedPhase: 'execute',
        message
      })
      host.notify({ kind: 'error', message })
    }
  })
}

function usePluginUpdate(t, onComplete, onActivity) {
  const queryClient = useQueryClient()
  const row = { name: ID, kind: 'plugin' }
  return useMutation({
    mutationFn: () => pluginContext.rest('/plugin-update', {
      method: 'POST',
      body: { confirm: ID },
      timeoutMs: 70000
    }),
    onMutate: () => {
      onActivity({ action: 'plugin-update', row, phase: 'execute' })
    },
    onSuccess: async data => {
      const message = t(data.unchanged ? 'pluginUpToDate' : 'pluginUpdateSuccess')
      onActivity({ action: 'plugin-update', row, phase: 'refresh' })
      await queryClient.invalidateQueries({ queryKey: QUERY_KEY }).catch(() => {})
      onComplete()
      onActivity({ action: 'plugin-update', row, phase: 'success', message })
      host.notify({
        kind: 'success',
        message
      })
    },
    onError: error => {
      const message = errorMessage(error, t('unknownError'), t)
      onActivity({
        action: 'plugin-update',
        row,
        phase: 'error',
        failedPhase: 'execute',
        message
      })
      host.notify({ kind: 'error', message })
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

function operationStepTone(activity, index, activeIndex) {
  if (activity.phase === 'success') return 'good'
  if (activity.phase === 'error' && index === activeIndex) return 'bad'
  if (index < activeIndex) return 'good'
  if (index === activeIndex) return 'warn'
  return 'muted'
}

function OperationSteps({ activity, t }) {
  const activePhase = activity.phase === 'error'
    ? activity.failedPhase || 'execute'
    : activity.phase
  const activeIndex = activity.phase === 'success'
    ? OPERATION_STEPS.length
    : Math.max(0, OPERATION_STEPS.indexOf(activePhase))
  const value = activity.phase === 'success'
    ? 100
    : Math.round(((activeIndex + 0.5) / OPERATION_STEPS.length) * 100)
  return jsxs('div', { className: 'space-y-2', children: [
    jsx('div', {
      'aria-label': t('operation.phases.' + activity.phase),
      'aria-valuemax': 100,
      'aria-valuemin': 0,
      'aria-valuenow': value,
      'aria-valuetext': t('operation.phases.' + activity.phase),
      className: 'h-1.5 overflow-hidden rounded-full bg-(--ui-bg-secondary)',
      role: 'progressbar',
      children: jsx('div', {
        className: cn(
          'h-full rounded-full transition-[width] duration-300',
          activity.phase === 'error' ? 'bg-destructive' : 'bg-(--ui-accent)',
          operationIsRunning(activity) && 'animate-pulse'
        ),
        style: { width: `${value}%` }
      })
    }),
    jsx('ol', {
      className: 'grid grid-cols-3 gap-2',
      children: OPERATION_STEPS.map((step, index) => jsxs('li', {
        className: 'flex min-w-0 items-center gap-1.5 text-xs text-(--ui-text-secondary)',
        children: [
          jsx(StatusDot, { tone: operationStepTone(activity, index, activeIndex) }),
          jsx('span', { className: 'truncate', children: t(`operation.steps.${step}`) })
        ]
      }, step))
    })
  ] })
}

function OperationProgress({ activity, onDismiss, t }) {
  if (!activity) return null
  const running = operationIsRunning(activity)
  return jsxs('section', {
    'aria-atomic': true,
    'aria-live': 'polite',
    className: 'space-y-3 rounded-md border border-(--ui-stroke-primary) p-3',
    children: [
      jsxs('div', { className: 'flex items-start justify-between gap-3', children: [
        jsxs('div', { className: 'flex min-w-0 items-start gap-2', children: [
          running
            ? jsx(GlyphSpinner, {})
            : jsx(StatusDot, { tone: activity.phase === 'success' ? 'good' : 'bad', className: 'mt-1.5' }),
          jsxs('div', { className: 'min-w-0', children: [
            jsx('div', { className: 'text-xs font-medium text-(--ui-text-tertiary)', children: t('operation.title') }),
            jsx('div', {
              className: 'truncate text-sm font-medium',
              children: t('operation.subject', t(`actions.${activity.action}`), activity.row.name)
            }),
            jsx('div', {
              className: 'mt-0.5 text-xs text-(--ui-text-secondary)',
              children: t(`operation.phases.${activity.phase}`)
            })
          ] })
        ] }),
        operationIsTerminal(activity) ? jsx(Button, {
          'aria-label': t('operation.dismiss'),
          size: 'icon',
          title: t('operation.dismiss'),
          variant: 'ghost',
          onClick: onDismiss,
          children: jsx(Codicon, { name: 'close' })
        }) : null
      ] }),
      jsx(OperationSteps, { activity, t }),
      activity.message ? jsx('p', {
        className: 'break-words text-xs text-(--ui-text-secondary)',
        children: activity.message
      }) : null
    ]
  })
}

function InlineOperation({ activity, row, t }) {
  if (!operationIsRunning(activity) || !operationMatches(activity, row)) return null
  return jsxs('div', {
    'aria-live': 'polite',
    className: 'flex items-center justify-end gap-1.5 text-xs text-(--ui-text-secondary)',
    children: [
      jsx(GlyphSpinner, {}),
      jsx('span', { children: t(`operation.phases.${activity.phase}`) })
    ]
  })
}

function ActionButtons({ activity, busy, onAction, row, t }) {
  const actions = actionsOf(row)
  if (!actions.length) return null
  return jsxs('div', { className: 'space-y-1.5', children: [
    jsx(InlineOperation, { activity, row, t }),
    jsx('div', {
      className: 'flex flex-wrap items-center gap-2 md:justify-end',
      children: actions.map(action => jsx(Button, {
        disabled: busy,
        size: 'sm',
        variant: actionVariant(action),
        onClick: () => onAction(row, action),
        children: actionLabel(row, action, t)
      }, action))
    })
  ] })
}

function SourceCell({ row, t }) {
  const kind = sourceOf(row)
  const raw = rawSourceOf(row)
  const showRaw = !['builtin', 'local'].includes(kind) && raw !== kind
  return jsxs('div', { className: 'min-w-0 space-y-1', children: [
    jsx(ToneBadge, { tone: kind, children: t(`sources.${kind}`) }),
    showRaw ? jsx('div', {
      className: 'truncate text-xs text-(--ui-text-tertiary)',
      title: raw,
      children: raw
    }) : null
  ] })
}

function HermesSyncStatus({ row, t }) {
  const hermes = row.hermesSkill
  if (!hermes) return jsx(ToneBadge, { tone: 'missing', children: t('hermesSync.codexOnly') })
  const kind = sourceOf(hermes)
  const raw = rawSourceOf(hermes)
  const sourceLabel = ['builtin', 'local'].includes(kind) || raw === kind
    ? t(`sources.${kind}`)
    : `${t(`sources.${kind}`)} · ${raw}`
  return jsxs('div', { className: 'min-w-0 space-y-1', children: [
    jsx(ToneBadge, { tone: 'installed', children: t('hermesSync.synced') }),
    jsx('div', {
      className: 'truncate text-xs text-(--ui-text-tertiary)',
      title: sourceLabel,
      children: sourceLabel
    })
  ] })
}

function DetailField({ copyable = false, label, t, value }) {
  if (!hasValue(value)) return null
  return jsxs('div', {
    className: 'grid gap-1 sm:grid-cols-[8rem_minmax(0,1fr)]',
    children: [
      jsx('dt', { className: 'text-xs text-(--ui-text-tertiary)', children: label }),
      jsxs('dd', { className: 'flex min-w-0 items-start gap-1 text-sm', children: [
        jsx('span', { className: 'min-w-0 flex-1 break-all', children: value }),
        copyable ? jsx(CopyButton, {
          appearance: 'inline', label: t('copy'), showLabel: false, text: String(value)
        }) : null
      ] })
    ]
  })
}

function DetailGroup({ fields, label, t }) {
  const visible = fields.filter(([, value]) => hasValue(value))
  if (!visible.length) return null
  return jsxs('section', { className: 'space-y-3', children: [
    jsx('h3', {
      className: 'border-b border-(--ui-stroke-secondary) pb-2 text-xs font-semibold uppercase tracking-wide text-(--ui-text-tertiary)',
      children: label
    }),
    jsx('dl', {
      className: 'space-y-3',
      children: visible.map(([fieldLabel, value, copyable]) => jsx(DetailField, {
        copyable, label: fieldLabel, t, value
      }, fieldLabel))
    })
  ] })
}

function DetailDrawer({ activity, busy, language, onAction, onClose, row, t }) {
  const dialogRef = useDialogA11y(Boolean(row), onClose)
  if (!row) return null
  const overviewFields = [
    [t('fields.category'), row.category || t('root')],
    [t('fields.type'), t(`sources.${sourceOf(row)}`)],
    [t('fields.trust'), t(`trust.${row.trustLevel || sourceOf(row)}`)],
    [t('fields.status'), t(`statuses.${row.status}`)]
  ]
  const locationFields = [
    [t('fields.source'), rawSourceOf(row)],
    [t('fields.path'), row.installPath, true],
    [t('fields.identifier'), row.identifier, true],
    [t('fields.installed'), row.installedAt],
    [t('fields.updated'), row.updatedAt]
  ]
  return jsx('div', {
    className: 'fixed inset-0 z-40 flex justify-end bg-background/60 backdrop-blur-[1px]',
    role: 'presentation',
    onMouseDown: event => event.target === event.currentTarget && onClose(),
    children: jsxs('section', {
      'aria-labelledby': 'skill-detail-title',
      'aria-modal': true,
      className: 'flex h-full w-full max-w-lg flex-col border-l border-(--ui-stroke-secondary) bg-background shadow-xl',
      ref: dialogRef,
      role: 'dialog',
      children: [
        jsxs('header', {
          className: 'flex items-start justify-between gap-3 border-b border-(--ui-stroke-secondary) p-4',
          children: [
            jsxs('div', { children: [
              jsx('div', { className: 'text-xs text-(--ui-text-tertiary)', children: t('details') }),
              jsx('h2', {
                className: 'mt-1 break-all text-lg font-semibold',
                id: 'skill-detail-title',
                children: row.name
              })
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
            jsx(DetailGroup, { fields: overviewFields, label: t('detailGroups.overview'), t }),
            jsx(DetailGroup, { fields: locationFields, label: t('detailGroups.location'), t })
          ] })
        }),
        actionsOf(row).length ? jsx('footer', {
          className: 'border-t border-(--ui-stroke-secondary) p-4',
          children: jsx(ActionButtons, { activity, busy, onAction, row, t })
        }) : null
      ]
    })
  })
}

function ConfirmOverlay({ activity, busy, onCancel, onConfirm, pending, t }) {
  const [value, setValue] = useState('')
  const dialogRef = useDialogA11y(Boolean(pending), onCancel, !busy)
  if (!pending) return null
  const valid = value === pending.row.name && !busy
  return jsx('div', {
    className: 'fixed inset-0 z-50 grid place-items-center bg-background/90 p-4 backdrop-blur-sm',
    role: 'presentation',
    onMouseDown: event => !busy && event.target === event.currentTarget && onCancel(),
    children: jsxs('section', {
      'aria-labelledby': 'skill-confirm-title',
      'aria-modal': true,
      className: 'w-full max-w-md rounded-lg border border-(--ui-stroke-secondary) bg-background p-4 shadow-xl',
      ref: dialogRef,
      role: 'dialog',
      children: [
        jsx('h2', {
          className: 'text-base font-semibold',
          id: 'skill-confirm-title',
          children: t(`confirmTitle.${pending.action}`)
        }),
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
        activity ? jsx('div', {
          className: 'mt-4',
          children: jsx(OperationSteps, { activity, t })
        }) : null,
        jsxs('footer', { className: 'mt-4 flex justify-end gap-2', children: [
          jsx(Button, { disabled: busy, variant: 'ghost', onClick: onCancel, children: t('cancel') }),
          jsx(Button, {
            'aria-busy': busy,
            disabled: !valid,
            variant: actionVariant(pending.action),
            onClick: () => onConfirm(value),
            children: busy
              ? jsxs(Fragment, { children: [jsx(GlyphSpinner, {}), ` ${t('working')}`] })
              : t('confirm')
          })
        ] })
      ]
    })
  })
}

function PluginUpdateOverlay({ activity, busy, onCancel, onConfirm, open, t }) {
  const dialogRef = useDialogA11y(open, onCancel, !busy)
  if (!open) return null
  return jsx('div', {
    className: 'fixed inset-0 z-50 grid place-items-center bg-background/90 p-4 backdrop-blur-sm',
    role: 'presentation',
    onMouseDown: event => !busy && event.target === event.currentTarget && onCancel(),
    children: jsxs('section', {
      'aria-labelledby': 'plugin-update-title',
      'aria-modal': true,
      className: 'w-full max-w-md rounded-lg border border-(--ui-stroke-secondary) bg-background p-4 shadow-xl',
      ref: dialogRef,
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
        activity ? jsx('div', {
          className: 'mt-4',
          children: jsx(OperationSteps, { activity, t })
        }) : null,
        jsxs('footer', { className: 'mt-4 flex justify-end gap-2', children: [
          jsx(Button, { disabled: busy, variant: 'ghost', onClick: onCancel, children: t('cancel') }),
          jsx(Button, {
            'aria-busy': busy,
            disabled: busy,
            onClick: onConfirm,
            children: busy
              ? jsxs(Fragment, { children: [jsx(GlyphSpinner, {}), ` ${t('working')}`] })
              : t('pluginUpdateConfirm')
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

function CodexTable({ activity, busy, onAction, rows, t }) {
  if (!rows.length) return jsx(EmptyState, {
    title: t('codexList.empty'),
    description: t('emptyBody')
  })
  return jsx('div', {
    className: 'overflow-x-auto rounded-sm border border-(--ui-stroke-secondary)',
    children: jsxs('table', {
      'aria-label': t('codexList.title'),
      className: 'w-full min-w-[56rem] table-fixed border-collapse text-sm',
      children: [
        jsx('thead', {
          className: 'sticky top-0 z-10 bg-(--ui-bg-secondary) text-left text-xs text-(--ui-text-tertiary)',
          children: jsx('tr', { children: [
            jsx('th', {
              className: 'sticky left-0 z-20 w-[23rem] bg-(--ui-bg-secondary) px-3 py-2 align-middle font-medium',
              children: t('table.skill')
            }),
            jsx('th', { className: 'w-[16rem] px-3 py-2 align-middle font-medium', children: t('table.path') }),
            jsx('th', {
              className: 'w-[10rem] px-3 py-2 align-middle font-medium',
              children: t('hermesSync.title')
            }),
            jsx('th', {
              className: 'sticky right-0 z-20 w-[7rem] bg-(--ui-bg-secondary) px-3 py-2 text-right align-middle font-medium',
              children: t('table.actions')
            })
          ] })
        }),
        jsx('tbody', {
          className: 'divide-y divide-(--ui-stroke-secondary)',
          children: rows.map(row => jsx('tr', {
            className: 'group align-middle hover:bg-(--ui-bg-secondary)',
            children: [
              jsx('td', {
                className: 'sticky left-0 z-[1] bg-background px-3 py-2 align-middle group-hover:bg-(--ui-bg-secondary)',
                children: jsxs('div', { className: 'min-w-0', children: [
                  jsx('div', { className: 'break-all font-medium', children: row.name }),
                  jsx('div', {
                    className: 'mt-0.5 truncate text-xs text-(--ui-text-secondary)',
                    title: row.description || t('noDescription'),
                    children: row.description || t('noDescription')
                  })
                ] })
              }),
              jsx('td', {
                className: 'px-3 py-2 align-middle',
                children: jsx('code', { className: 'break-all text-xs', children: row.relativePath })
              }),
              jsx('td', {
                className: 'px-3 py-2 align-middle',
                children: jsx(HermesSyncStatus, { row, t })
              }),
              jsx('td', {
                className: 'sticky right-0 z-[1] bg-background px-2 py-1.5 text-right align-middle group-hover:bg-(--ui-bg-secondary)',
                children: jsxs('div', { className: 'space-y-1.5', children: [
                  jsx(InlineOperation, { activity, row, t }),
                  jsx(Button, {
                    disabled: busy,
                    size: 'sm',
                    variant: 'destructive',
                    onClick: () => onAction(row, 'delete-codex'),
                    children: t('actions.delete-codex')
                  })
                ] })
              })
            ]
          }, row.relativePath))
        })
      ]
    })
  })
}

function OptionalTable({ activity, busy, onAction, rows, t }) {
  if (!rows.length) return jsx(EmptyState, {
    title: t('optionalList.empty'),
    description: t('emptyBody')
  })
  return jsx('div', {
    className: 'overflow-x-auto rounded-sm border border-(--ui-stroke-secondary)',
    children: jsxs('table', {
      'aria-label': t('optionalList.title'),
      className: 'w-full min-w-[54rem] table-fixed border-collapse text-sm',
      children: [
        jsx('thead', {
          className: 'sticky top-0 z-10 bg-(--ui-bg-secondary) text-left text-xs text-(--ui-text-tertiary)',
          children: jsx('tr', { children: [
            jsx('th', {
              className: 'sticky left-0 z-20 w-[28rem] bg-(--ui-bg-secondary) px-3 py-2 align-middle font-medium',
              children: t('table.skill')
            }),
            jsx('th', { className: 'w-[12rem] px-3 py-2 align-middle font-medium', children: t('table.category') }),
            jsx('th', { className: 'w-[7rem] px-3 py-2 align-middle font-medium', children: t('fields.status') }),
            jsx('th', {
              className: 'sticky right-0 z-20 w-[7rem] bg-(--ui-bg-secondary) px-3 py-2 text-right align-middle font-medium',
              children: t('table.actions')
            })
          ] })
        }),
        jsx('tbody', {
          className: 'divide-y divide-(--ui-stroke-secondary)',
          children: rows.map(row => jsx('tr', {
            className: 'group align-middle hover:bg-(--ui-bg-secondary)',
            children: [
              jsx('td', {
                className: 'sticky left-0 z-[1] bg-background px-3 py-2 align-middle group-hover:bg-(--ui-bg-secondary)',
                children: jsxs('div', { className: 'min-w-0', children: [
                  jsx('div', { className: 'break-all font-medium', children: row.name }),
                  jsx('div', {
                    className: 'mt-0.5 truncate text-xs text-(--ui-text-secondary)',
                    title: row.description || t('noDescription'),
                    children: row.description || t('noDescription')
                  })
                ] })
              }),
              jsx('td', { className: 'px-3 py-2 align-middle', children: row.category || t('root') }),
              jsx('td', {
                className: 'px-3 py-2 align-middle',
                children: jsx(ToneBadge, {
                  tone: row.installed ? 'installed' : 'missing',
                  children: t(`optionalList.${row.installed ? 'installed' : 'available'}`)
                })
              }),
              jsx('td', {
                className: 'sticky right-0 z-[1] bg-background px-2 py-1.5 text-right align-middle group-hover:bg-(--ui-bg-secondary)',
                children: row.installed
                  ? null
                  : jsxs('div', { className: 'space-y-1.5', children: [
                      jsx(InlineOperation, { activity, row, t }),
                      jsx(Button, {
                        disabled: busy,
                        size: 'sm',
                        variant: 'secondary',
                        onClick: () => onAction(row, 'install-optional'),
                        children: t('actions.install-optional')
                      })
                    ] })
              })
            ]
          }, row.identifier))
        })
      ]
    })
  })
}

function PageHeader({ fetching, onRefresh, onUpdate, operating, summary, t, updating }) {
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
            disabled: updating || operating,
            size: 'sm',
            variant: 'secondary',
            onClick: onUpdate,
            children: jsxs(Fragment, { children: [
              jsx(Codicon, { name: 'cloud-download' }),
              ` ${updating ? t('working') : t('pluginUpdateButton')}`
            ] })
          }),
          jsx(Button, {
            'aria-label': fetching ? t('refreshing') : t('refresh'),
            disabled: fetching,
            size: 'icon',
            title: fetching ? t('refreshing') : t('refresh'),
            variant: 'ghost',
            onClick: onRefresh,
            children: fetching ? jsx(GlyphSpinner, {}) : jsx(Codicon, { name: 'refresh' })
          })
        ] })
      ] }),
      jsxs('div', { className: 'mt-4 flex flex-wrap gap-x-6 gap-y-1', children: [
        jsx(Stat, { label: t('stats.disabled'), value: summary.disabled }),
        jsx(Stat, { label: t('stats.restorable'), value: summary.restorable }),
        jsx(Stat, { label: t('stats.diagnostics'), value: summary.diagnostics })
      ] })
    ]
  })
}

function PathLine({ path, t }) {
  if (!path) return null
  return jsxs('div', {
    className: 'flex min-w-0 items-center gap-1 text-xs text-(--ui-text-tertiary)',
    children: [
      jsx(Codicon, { name: 'folder' }),
      jsx('code', { className: 'min-w-0 truncate', title: path, children: path }),
      jsx(CopyButton, { appearance: 'inline', label: t('copy'), showLabel: false, text: path })
    ]
  })
}

function FilterPanel({
  categories, codexCount, counts, filters, hermesCount, missingCount,
  onChange, onClear, onViewChange, optionalCount, rowCount, totalCount, visibleCount, t
}) {
  const showingCodex = filters.view === 'codex'
  const showingOptional = !showingCodex && filters.source === 'optional'
  const hasActiveFilters = Boolean(filters.query)
    || (!showingCodex && filters.category !== 'all')
    || (!showingCodex && (filters.source !== 'all' || filters.showMissingBuiltin))
  const viewCounts = { hermes: hermesCount, codex: codexCount }
  const viewOptions = VIEWS.map(id => ({
    id,
    label: `${t(`views.${id}`)} ${viewCounts[id]}`
  }))
  return jsxs('section', {
    className: 'space-y-3 rounded-md border border-(--ui-stroke-secondary) p-3',
    children: [
      jsxs('div', { className: 'flex flex-wrap items-center justify-between gap-2', children: [
        jsx(SegmentedControl, { options: viewOptions, value: filters.view, onChange: onViewChange }),
        jsx('div', {
          className: 'shrink-0 text-xs text-(--ui-text-tertiary)',
          children: t('results', visibleCount, totalCount)
        })
      ] }),
      jsxs('div', { className: 'flex flex-wrap items-center gap-2', children: [
        showingCodex ? null : jsx('div', {
          className: 'flex flex-wrap gap-1.5',
          children: SOURCES.map(key => jsx(Button, {
            'aria-pressed': filters.source === key,
            size: 'sm',
            variant: filters.source === key ? 'default' : 'secondary',
            onClick: () => onChange('source', key),
            children: `${t(`sources.${key}`)} ${
              key === 'all' ? rowCount : key === 'optional' ? optionalCount : counts[key] || 0
            }`
          }, key))
        }),
        jsx(Input, {
          'aria-label': t('search'),
          className: 'min-w-[16rem] flex-1',
          placeholder: t('searchPlaceholder'),
          value: filters.query,
          onChange: event => onChange('query', event.target.value)
        }),
        showingCodex ? null : jsx('select', {
          'aria-label': t('fields.category'),
          className: 'h-8 w-[12rem] shrink-0 rounded border border-(--ui-stroke-secondary) bg-transparent px-2 text-sm',
          value: filters.category,
          onChange: event => onChange('category', event.target.value),
          children: [
            jsx('option', { value: 'all', children: t('allCategories') }),
            ...categories.map(value => jsx('option', { value, children: value }, value))
          ]
        }),
        showingCodex || showingOptional ? null : jsxs('label', {
          className: 'flex min-h-8 shrink-0 items-center gap-2 text-sm',
          children: [
            jsx('input', {
              type: 'checkbox',
              checked: filters.showMissingBuiltin,
              onChange: event => onChange('showMissingBuiltin', event.target.checked)
            }),
            `${t('showMissingBuiltin')} (${missingCount})`
          ]
        }),
        hasActiveFilters ? jsx(Button, {
          size: 'sm',
          variant: 'ghost',
          onClick: onClear,
          children: jsxs(Fragment, { children: [
            jsx(Codicon, { name: 'clear-all' }),
            ` ${t('clearFilters')}`
          ] })
        }) : null
      ] })
    ]
  })
}

function SkillTable({ activity, busy, language, onAction, onSelect, rows, t }) {
  if (!rows.length) return jsx(EmptyState, { title: t('emptyTitle'), description: t('emptyBody') })
  return jsx('div', {
    className: 'overflow-x-auto rounded-sm border border-(--ui-stroke-secondary)',
    children: jsxs('table', {
      'aria-label': t('views.hermes'),
      className: 'w-full min-w-[60rem] table-fixed border-collapse text-sm',
      children: [
        jsx('thead', {
          className: 'sticky top-0 z-10 bg-(--ui-bg-secondary) text-left text-xs text-(--ui-text-tertiary)',
          children: jsx('tr', { children: [
            jsx('th', {
              className: 'sticky left-0 z-20 w-[26rem] bg-(--ui-bg-secondary) px-3 py-2 align-middle font-medium',
              children: t('table.skill')
            }),
            jsx('th', { className: 'w-[8rem] px-3 py-2 align-middle font-medium', children: t('table.category') }),
            jsx('th', { className: 'w-[10rem] px-3 py-2 align-middle font-medium', children: t('table.source') }),
            jsx('th', {
              className: 'sticky right-0 z-20 w-[16rem] bg-(--ui-bg-secondary) px-3 py-2 text-right align-middle font-medium',
              children: t('table.actions')
            })
          ] })
        }),
        jsx('tbody', {
          className: 'divide-y divide-(--ui-stroke-secondary)',
          children: rows.map(row => jsx('tr', {
            className: 'group align-middle hover:bg-(--ui-bg-secondary)',
            children: [
              jsx('td', {
                className: 'sticky left-0 z-[1] bg-background px-3 py-2 align-middle group-hover:bg-(--ui-bg-secondary)',
                children: jsxs('div', { className: 'min-w-0', children: [
                  jsx('button', {
                    className: 'block max-w-full break-all text-left font-medium hover:underline',
                    type: 'button',
                    onClick: () => onSelect(row),
                    children: row.name
                  }),
                  jsx('div', {
                    className: 'mt-0.5 truncate text-xs text-(--ui-text-secondary)',
                    title: descriptionOf(row, language) || t('noDescription'),
                    children: descriptionOf(row, language) || t('noDescription')
                  })
                ] })
              }),
              jsx('td', { className: 'px-3 py-2 align-middle', children: row.category || t('root') }),
              jsx('td', {
                className: 'px-3 py-2 align-middle',
                children: jsx(SourceCell, { row, t })
              }),
              jsx('td', {
                className: 'sticky right-0 z-[1] bg-background px-2 py-1.5 align-middle group-hover:bg-(--ui-bg-secondary)',
                children: jsx(ActionButtons, { activity, busy, onAction, row, t })
              })
            ]
          }, `${sourceOf(row)}:${row.name}`))
        })
      ]
    })
  })
}

function SkillManagePage() {
  const t = usePluginI18n(ID)
  const [filters, setFilters] = useState({
    view: 'hermes', query: '', source: 'all', category: 'all',
    showMissingBuiltin: false
  })
  const [selected, setSelected] = useState(null)
  const [pending, setPending] = useState(null)
  const [activity, setActivity] = useState(null)
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
    variables => setPending({ row: variables.row, action: variables.action }),
    setActivity
  )
  const pluginUpdate = usePluginUpdate(t, () => setPluginUpdateOpen(false), setActivity)
  const data = inventory.data || {}
  const language = t('language') === 'zh' ? 'zh' : 'en'
  const view = useInventoryView(data, { ...filters, language }, filters.showMissingBuiltin, t)
  const showingCodex = filters.view === 'codex'
  const showingOptional = !showingCodex && filters.source === 'optional'
  const diagnostics = asArray(data.diagnostics)
  const summary = {
    disabled: view.installed.filter(row => row.status === 'disabled').length,
    restorable: view.missing.length,
    diagnostics: diagnostics.length
  }
  const visibleCount = showingCodex
    ? view.codexVisible.length
    : showingOptional ? view.optionalVisible.length : view.visible.length
  const totalCount = showingCodex
    ? view.codex.length
    : showingOptional ? view.optional.length : view.rows.length
  const busy = mutation.isPending || pluginUpdate.isPending
  const changeFilter = (key, value) => setFilters(current => ({ ...current, [key]: value }))
  const clearFilters = () => setFilters(current => ({
    ...current, query: '', source: 'all', category: 'all', showMissingBuiltin: false
  }))
  const beginAction = (row, action) => {
    if (requiresConfirmation(row, action)) {
      setActivity({ action, row, phase: 'confirm' })
      setPending({ row, action })
      return
    }
    mutation.mutate({ row, action, confirm: '' })
  }
  const cancelPending = () => {
    setPending(null)
    if (activity?.phase === 'confirm') setActivity(null)
  }
  const openPluginUpdate = () => {
    setActivity({ action: 'plugin-update', row: { name: ID, kind: 'plugin' }, phase: 'confirm' })
    setPluginUpdateOpen(true)
  }
  const cancelPluginUpdate = () => {
    setPluginUpdateOpen(false)
    if (activity?.action === 'plugin-update' && activity.phase === 'confirm') setActivity(null)
  }

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
        fetching: inventory.isFetching,
        onRefresh: () => inventory.refetch(),
        onUpdate: openPluginUpdate,
        operating: mutation.isPending,
        summary,
        t,
        updating: pluginUpdate.isPending
      }),
      jsx(ScrollArea, {
        className: 'min-h-0 flex-1',
        children: jsxs('main', { className: 'mx-auto w-full max-w-7xl space-y-4 p-4', children: [
          jsx(OperationProgress, {
            activity,
            onDismiss: () => setActivity(null),
            t
          }),
          jsx(Diagnostics, { rows: diagnostics, t }),
          jsx(PathLine, {
            path: showingOptional
              ? ''
              : showingCodex ? data.meta?.codexSkillsDir : data.meta?.skillsDir,
            t
          }),
          jsx(FilterPanel, {
            categories: showingOptional ? view.optionalCategories : view.categories,
            codexCount: view.codex.length,
            counts: view.rowCounts,
            filters,
            hermesCount: view.installed.length,
            missingCount: data.missingBuiltinCount || 0,
            onChange: changeFilter,
            onClear: clearFilters,
            onViewChange: value => setFilters(current => ({
              ...current,
              view: value,
              source: 'all',
              category: 'all',
              showMissingBuiltin: false
            })),
            optionalCount: view.optional.length,
            rowCount: view.rows.length,
            totalCount,
            visibleCount,
            t
          }),
          showingCodex
            ? jsx(CodexTable, {
                activity,
                busy,
                onAction: beginAction,
                rows: view.codexVisible,
                t
              })
            : showingOptional
              ? jsx(OptionalTable, {
                  activity,
                  busy,
                  onAction: beginAction,
                  rows: view.optionalVisible,
                  t
                })
              : jsx(SkillTable, {
                activity,
                busy,
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
      activity,
      busy,
      language,
      row: selected,
      t,
      onClose: () => setSelected(null),
      onAction: beginAction
    }),
    jsx(ConfirmOverlay, {
      key: pending ? `${pending.action}:${pending.row.name}` : 'none',
      activity,
      busy: mutation.isPending,
      pending,
      t,
      onCancel: cancelPending,
      onConfirm: confirm => mutation.mutate({ ...pending, confirm })
    }),
    jsx(PluginUpdateOverlay, {
      activity,
      busy: pluginUpdate.isPending,
      open: pluginUpdateOpen,
      t,
      onCancel: cancelPluginUpdate,
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

/** Native Hermes Desktop skill manager. */
import {
  Badge, Button, Codicon, EmptyState, ErrorState, GlyphSpinner, Input,
  PALETTE_AREA, ROUTES_AREA, SIDEBAR_NAV_AREA, ScrollArea, cn, host,
  useMutation, usePluginI18n, useQuery, useQueryClient
} from '@hermes/plugin-sdk'
import { useMemo, useState } from 'react'
import { Fragment, jsx, jsxs } from 'react/jsx-runtime'

const ID = 'desktop-skill-manager'
const ROUTE = '/desktop-skill-manager'
const SOURCES = ['all', 'builtin', 'hub-installed', 'local']
let pluginContext

const sourceOf = row => row.kind || row.source || 'local'
const actionsOf = row => row.status === 'deleted' ? (row.availableActions || []) : [...(row.availableActions || []), 'sync-codex']
const descriptionOf = (row, lang) => lang === 'zh'
  ? row.descriptionZh || row.description || row.descriptionEn || ''
  : row.descriptionEn || row.description || row.descriptionZh || ''

function errorMessage(error, fallback) {
  const raw = error && error.message ? String(error.message) : String(error || fallback)
  try {
    const parsed = JSON.parse(raw.replace(/^\d+:\s*/, ''))
    return typeof parsed.detail === 'string' ? parsed.detail : parsed.detail?.message || raw
  } catch (_ignored) {
    return raw
  }
}

function ToneBadge({ children, tone }) {
  const tones = {
    enabled: 'text-foreground border-(--ui-stroke-primary)',
    disabled: 'text-(--ui-text-tertiary) border-(--ui-stroke-secondary)',
    deleted: 'text-foreground border-(--ui-stroke-primary)',
    builtin: 'text-(--ui-accent) border-(--ui-accent)',
    'hub-installed': 'text-(--ui-text-secondary) border-(--ui-stroke-primary)',
    local: 'text-(--ui-text-secondary) border-(--ui-stroke-secondary)'
  }
  return jsx(Badge, { className: cn('max-w-full truncate border bg-transparent font-normal', tones[tone]), children })
}

function Stat({ label, value }) {
  return jsxs('div', { className: 'min-w-24 rounded-md border border-(--ui-stroke-secondary) px-3 py-2', children: [
    jsx('div', { className: 'text-xs text-(--ui-text-tertiary)', children: label }),
    jsx('div', { className: 'mt-1 text-xl font-semibold tabular-nums', children: value })
  ] })
}

function DetailDialog({ language, onAction, onClose, row, t }) {
  if (!row) return null
  const fields = [
    [t('fields.category'), row.category || t('root')],
    [t('fields.source'), t(`sources.${sourceOf(row)}`)],
    [t('fields.trust'), t(`trust.${row.trustLevel || sourceOf(row)}`)],
    [t('fields.status'), t(`statuses.${row.status}`)],
    [t('fields.path'), row.installPath || '-'],
    [t('fields.identifier'), row.identifier || '-'],
    [t('fields.installed'), row.installedAt || '-'],
    [t('fields.updated'), row.updatedAt || '-'],
    [t('fields.codexStatus'), row.codexInstalled ? t('codex.installed') : t('codex.notInstalled')],
    [t('fields.codexPath'), row.codexPath || '-']
  ]
  return jsx('div', { className: 'fixed inset-0 z-40 flex justify-end bg-background/90 backdrop-blur-sm', role: 'presentation', onMouseDown: event => event.target === event.currentTarget && onClose(), children:
    jsxs('section', { 'aria-label': t('details'), className: 'flex h-full w-full max-w-lg flex-col border-l border-(--ui-stroke-secondary) bg-background shadow-xl', role: 'dialog', children: [
      jsxs('header', { className: 'flex items-start justify-between gap-3 border-b border-(--ui-stroke-secondary) p-4', children: [
        jsxs('div', { children: [jsx('div', { className: 'text-xs text-(--ui-text-tertiary)', children: t('details') }), jsx('h2', { className: 'mt-1 break-all text-lg font-semibold', children: row.name })] }),
        jsx(Button, { 'aria-label': t('close'), size: 'icon', variant: 'ghost', onClick: onClose, children: jsx(Codicon, { name: 'close' }) })
      ] }),
      jsx(ScrollArea, { className: 'min-h-0 flex-1', children: jsxs('div', { className: 'space-y-5 p-4', children: [
        jsx('p', { className: 'whitespace-pre-wrap break-words text-sm leading-6 text-(--ui-text-secondary)', children: descriptionOf(row, language) || t('noDescription') }),
        jsx('dl', { className: 'space-y-3', children: fields.map(([label, value]) => jsxs('div', { className: 'grid gap-1 sm:grid-cols-[8rem_minmax(0,1fr)]', children: [jsx('dt', { className: 'text-xs text-(--ui-text-tertiary)', children: label }), jsx('dd', { className: 'break-all text-sm', children: value })] }, label)) })
      ] }) }),
      actionsOf(row).length ? jsx('footer', { className: 'flex flex-wrap justify-end gap-2 border-t border-(--ui-stroke-secondary) p-4', children: actionsOf(row).map(action => jsx(Button, { variant: action === 'delete' ? 'destructive' : action === 'sync-codex' ? 'default' : 'secondary', onClick: () => onAction(row, action), children: t(`actions.${action}`) }, action)) }) : null
    ] })
  })
}

function ConfirmOverlay({ busy, onCancel, onConfirm, pending, t }) {
  const [value, setValue] = useState('')
  if (!pending) return null
  const valid = value === pending.row.name && !busy
  return jsx('div', { className: 'fixed inset-0 z-50 grid place-items-center bg-background/90 p-4 backdrop-blur-sm', role: 'presentation', onMouseDown: event => !busy && event.target === event.currentTarget && onCancel(), children:
    jsxs('section', { 'aria-modal': true, className: 'w-full max-w-md rounded-lg border border-(--ui-stroke-secondary) bg-background p-4 shadow-xl', role: 'dialog', children: [
      jsx('h2', { className: 'text-base font-semibold', children: t(`confirmTitle.${pending.action}`) }),
      jsx('p', { className: 'mt-2 text-sm leading-6 text-(--ui-text-secondary)', children: t(`confirmBody.${pending.action}`, pending.row.name) }),
      jsx('code', { className: 'mt-3 block break-all rounded border border-(--ui-stroke-secondary) px-2 py-1.5 text-sm', children: pending.row.name }),
      jsx(Input, { autoFocus: true, className: 'mt-3', disabled: busy, placeholder: t('confirmPlaceholder'), value, onChange: event => setValue(event.target.value), onKeyDown: event => event.key === 'Enter' && valid && onConfirm(value) }),
      jsxs('footer', { className: 'mt-4 flex justify-end gap-2', children: [
        jsx(Button, { disabled: busy, variant: 'ghost', onClick: onCancel, children: t('cancel') }),
        jsx(Button, { disabled: !valid, variant: pending.action === 'delete' ? 'destructive' : 'default', onClick: () => onConfirm(value), children: busy ? t('working') : t('confirm') })
      ] })
    ] })
  })
}

function History({ history, t }) {
  if (!history?.length) return null
  return jsxs('details', { className: 'rounded-md border border-(--ui-stroke-secondary)', children: [
    jsx('summary', { className: 'cursor-pointer px-3 py-2 text-sm font-medium', children: t('recent') }),
    jsx('div', { className: 'grid gap-2 border-t border-(--ui-stroke-secondary) p-3', children: history.slice(0, 5).map((item, index) => jsxs('div', { className: 'grid gap-1 rounded border border-(--ui-stroke-secondary) px-3 py-2 text-sm sm:grid-cols-[6rem_minmax(0,1fr)_10rem]', children: [
      jsx('span', { children: t(`actions.${item.action}`) }), jsx('strong', { className: 'min-w-0 break-all font-medium', children: item.name || '-' }), jsx('time', { className: 'text-(--ui-text-tertiary)', children: item.at ? new Date(item.at).toLocaleString() : '-' })
    ] }, `${item.at || index}:${item.name || ''}`)) })
  ] })
}

function SkillManagePage() {
  const t = usePluginI18n(ID)
  const queryClient = useQueryClient()
  const [query, setQuery] = useState('')
  const [source, setSource] = useState('all')
  const [status, setStatus] = useState('all')
  const [category, setCategory] = useState('all')
  const [showDeleted, setShowDeleted] = useState(false)
  const [selected, setSelected] = useState(null)
  const [pending, setPending] = useState(null)
  const language = String(document.documentElement.lang || navigator.language || '').toLowerCase().startsWith('zh') ? 'zh' : 'en'
  const inventory = useQuery({ queryKey: [ID, 'inventory'], queryFn: () => pluginContext.rest('/inventory'), refetchInterval: 15000 })
  const mutation = useMutation({
    mutationFn: ({ action, row, confirm }) => pluginContext.rest(`/${action}`, { method: 'POST', body: { source: sourceOf(row), name: row.name, ...(confirm ? { confirm } : {}), force: action === 'sync-codex' && Boolean(confirm) } }),
    onSuccess: (_data, variables) => { host.notify({ kind: 'success', message: t('success', t(`actions.${variables.action}`), variables.row.name) }); setPending(null); setSelected(null); queryClient.invalidateQueries({ queryKey: [ID, 'inventory'] }) },
    onError: error => host.notify({ kind: 'error', message: errorMessage(error, t('unknownError')) })
  })
  const data = inventory.data || {}
  const installed = Array.isArray(data.skills) ? data.skills : []
  const missing = Array.isArray(data.missingBuiltinSkills) ? data.missingBuiltinSkills : []
  const rows = showDeleted ? installed.concat(missing) : installed
  const categories = useMemo(() => Array.from(new Set(rows.map(row => row.category || t('root')))).sort(), [rows, t])
  const counts = useMemo(() => installed.reduce((result, row) => { const key = sourceOf(row); result[key] = (result[key] || 0) + 1; return result }, {}), [installed])
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return rows.filter(row => {
      if (source !== 'all' && sourceOf(row) !== source) return false
      if (status !== 'all' && row.status !== status) return false
      if (category !== 'all' && (row.category || t('root')) !== category) return false
      return !needle || [row.name, row.category, row.source, row.trustLevel, row.status, row.installPath, descriptionOf(row, language)].join('\n').toLowerCase().includes(needle)
    }).sort((left, right) => String(left.name).localeCompare(String(right.name), undefined, { numeric: true, sensitivity: 'base' }))
  }, [rows, query, source, status, category, language, t])
  const beginAction = (row, action) => action === 'delete' || action === 'reset' || (action === 'sync-codex' && row.codexInstalled) ? setPending({ row, action }) : mutation.mutate({ row, action, confirm: '' })

  if (inventory.isPending) return jsx('div', { className: 'grid h-full place-items-center', children: jsx(GlyphSpinner, {}) })
  if (inventory.isError) return jsx('div', { className: 'grid h-full place-items-center p-6', children: jsx(ErrorState, {
    title: t('loadError'),
    description: errorMessage(inventory.error, t('unknownError')),
    children: jsx(Button, { variant: 'secondary', onClick: () => inventory.refetch(), children: t('retry') })
  }) })

  return jsxs(Fragment, { children: [
    jsxs('div', { className: 'flex h-full min-h-0 flex-col', children: [
      jsxs('header', { className: 'border-b border-(--ui-stroke-secondary) px-4 py-4', children: [
        jsxs('div', { className: 'flex flex-wrap items-start justify-between gap-3', children: [
          jsxs('div', { children: [jsx('h1', { className: 'text-lg font-semibold', children: t('title') }), jsx('p', { className: 'mt-1 text-sm text-(--ui-text-secondary)', children: t('subtitle') }), jsx('code', { className: 'mt-2 block max-w-full break-all text-xs text-(--ui-text-tertiary)', children: data.meta?.skillsDir })] }),
          jsx(Button, { disabled: inventory.isFetching, variant: 'secondary', onClick: () => inventory.refetch(), children: jsxs(Fragment, { children: [jsx(Codicon, { name: 'refresh' }), ` ${inventory.isFetching ? t('refreshing') : t('refresh')}`] }) })
        ] }),
        jsxs('div', { className: 'mt-4 flex flex-wrap gap-2', children: [jsx(Stat, { label: t('stats.total'), value: installed.length }), jsx(Stat, { label: t('stats.builtin'), value: counts.builtin || 0 }), jsx(Stat, { label: t('stats.community'), value: counts['hub-installed'] || 0 }), jsx(Stat, { label: t('stats.local'), value: counts.local || 0 })] })
      ] }),
      jsx(ScrollArea, { className: 'min-h-0 flex-1', children: jsxs('main', { className: 'mx-auto w-full max-w-7xl space-y-4 p-4', children: [
        data.diagnostics?.length ? jsx('section', { className: 'rounded-md border border-(--ui-stroke-primary) p-3 text-sm', children: jsxs(Fragment, { children: [jsx('strong', { children: t('partial') }), jsx('ul', { className: 'mt-2 list-disc pl-5 text-(--ui-text-secondary)', children: data.diagnostics.map((item, index) => jsx('li', { children: `${item.component}: ${item.message}` }, index)) })] }) }) : null,
        jsxs('section', { className: 'space-y-3 rounded-md border border-(--ui-stroke-secondary) p-3', children: [
          jsx('div', { className: 'flex flex-wrap gap-2', children: SOURCES.map(key => jsx(Button, { size: 'sm', variant: source === key ? 'default' : 'secondary', onClick: () => setSource(key), children: `${t(`sources.${key}`)} ${key === 'all' ? rows.length : counts[key] || 0}` }, key)) }),
          jsxs('div', { className: 'grid gap-2 lg:grid-cols-[minmax(16rem,1fr)_12rem_12rem_auto]', children: [
            jsx(Input, { 'aria-label': t('search'), placeholder: t('searchPlaceholder'), value: query, onChange: event => setQuery(event.target.value) }),
            jsx('select', { 'aria-label': t('fields.category'), className: 'h-8 rounded border border-(--ui-stroke-secondary) bg-transparent px-2 text-sm', value: category, onChange: event => setCategory(event.target.value), children: [jsx('option', { value: 'all', children: t('allCategories') }), ...categories.map(value => jsx('option', { value, children: value }, value))] }),
            jsx('select', { 'aria-label': t('fields.status'), className: 'h-8 rounded border border-(--ui-stroke-secondary) bg-transparent px-2 text-sm', value: status, onChange: event => setStatus(event.target.value), children: ['all', 'enabled', 'disabled', 'deleted'].map(value => jsx('option', { value, children: t(`statuses.${value}`) }, value)) }),
            jsxs('label', { className: 'flex min-h-8 items-center gap-2 text-sm', children: [jsx('input', { type: 'checkbox', checked: showDeleted, onChange: event => setShowDeleted(event.target.checked) }), `${t('showDeleted')} (${data.missingBuiltinCount || 0})`] })
          ] }),
          jsx('div', { className: 'text-xs text-(--ui-text-tertiary)', children: t('results', visible.length, rows.length) })
        ] }),
        visible.length ? jsx('section', { className: 'grid gap-2', children: visible.map(row => jsxs('article', { className: 'grid gap-3 rounded-md border border-(--ui-stroke-secondary) p-3 hover:border-(--ui-stroke-primary) md:grid-cols-[minmax(0,1fr)_auto]', children: [
          jsxs('button', { className: 'min-w-0 text-left', type: 'button', onClick: () => setSelected(row), children: [jsx('strong', { className: 'block break-all text-sm font-medium', children: row.name }), jsx('p', { className: 'mt-1 line-clamp-2 break-words text-sm leading-5 text-(--ui-text-secondary)', children: descriptionOf(row, language) || t('noDescription') }), jsxs('div', { className: 'mt-2 flex flex-wrap gap-1.5', children: [jsx(ToneBadge, { tone: sourceOf(row), children: t(`sources.${sourceOf(row)}`) }), jsx(ToneBadge, { tone: row.status, children: t(`statuses.${row.status}`) }), row.codexInstalled ? jsx(ToneBadge, { tone: 'builtin', children: t('codex.installed') }) : null, row.category ? jsx(Badge, { className: 'max-w-48 truncate font-normal', children: row.category }) : null] })] }),
          actionsOf(row).length ? jsx('div', { className: 'flex flex-wrap items-center gap-2 md:justify-end', children: actionsOf(row).map(action => jsx(Button, { disabled: mutation.isPending, size: 'sm', variant: action === 'delete' ? 'destructive' : action === 'sync-codex' ? 'default' : 'secondary', onClick: () => beginAction(row, action), children: t(`actions.${action}`) }, action)) }) : null
        ] }, `${sourceOf(row)}:${row.name}`)) }) : jsx(EmptyState, { title: t('emptyTitle'), description: t('emptyBody') }),
        jsx(History, { history: data.history || [], t })
      ] }) })
    ] }),
    jsx(DetailDialog, { language, row: selected, t, onClose: () => setSelected(null), onAction: beginAction }),
    jsx(ConfirmOverlay, { key: pending ? `${pending.action}:${pending.row.name}` : 'none', busy: mutation.isPending, pending, t, onCancel: () => setPending(null), onConfirm: confirm => mutation.mutate({ ...pending, confirm }) })
  ] })
}

export default {
  id: ID,
  name: 'Skill Manage',
  register(ctx) {
    pluginContext = ctx
    ctx.i18n.register({
      en: {
        title: 'Hermes & Codex Skills', subtitle: 'Manage Hermes skills and sync them into Codex.', search: 'Search', searchPlaceholder: 'Search skills, descriptions, sources, statuses, or paths', refresh: 'Refresh', refreshing: 'Refreshing', retry: 'Retry', showDeleted: 'Show deleted built-ins', results: (shown, total) => `${shown} of ${total}`, allCategories: 'All categories', root: '(root)', details: 'Skill details', close: 'Close', noDescription: 'No description', recent: 'Recent actions', partial: 'Some skill data could not be loaded.', loadError: 'Skill inventory unavailable', unknownError: 'Unknown error', emptyTitle: 'No matching skills', emptyBody: 'Adjust or clear the active filters.', cancel: 'Cancel', confirm: 'Confirm', working: 'Working…', confirmPlaceholder: 'Type the exact skill name', success: (action, name) => `${action}: ${name}`, nav: 'Skills', open: 'Open Skill Manage',
        stats: { total: 'Total', builtin: 'Built-in', community: 'Community', local: 'Local' }, sources: { all: 'All', builtin: 'Built-in', 'hub-installed': 'Community', local: 'Local' }, statuses: { all: 'All statuses', enabled: 'Enabled', disabled: 'Disabled', deleted: 'Deleted' }, trust: { builtin: 'Built-in', official: 'Official', community: 'Community', local: 'Local' }, codex: { installed: 'In Codex', notInstalled: 'Not in Codex' }, fields: { category: 'Category', source: 'Source', trust: 'Trust', status: 'Status', path: 'Hermes path', identifier: 'Identifier', installed: 'Installed', updated: 'Updated', codexStatus: 'Codex status', codexPath: 'Codex path' }, actions: { delete: 'Delete', reset: 'Reset', update: 'Update', restore: 'Restore', 'sync-codex': 'Sync to Codex' }, confirmTitle: { delete: 'Delete skill', reset: 'Reset skill', 'sync-codex': 'Replace Codex skill' }, confirmBody: { delete: name => `This permanently removes the local files for ${name}. Type the exact skill name to continue.`, reset: name => `This replaces the local contents of ${name} with its source version. Type the exact skill name to continue.`, 'sync-codex': name => `Codex already has ${name}. Type the exact skill name to replace it with the Hermes copy.` }
      },
      zh: {
        title: 'Hermes 与 Codex 技能管理', subtitle: '管理 Hermes 技能，并将它们同步到 Codex。', search: '搜索', searchPlaceholder: '搜索技能、简介、来源、状态或路径', refresh: '刷新', refreshing: '刷新中', retry: '重试', showDeleted: '显示已删除内建', results: (shown, total) => `显示 ${shown} / ${total}`, allCategories: '全部分类', root: '（根目录）', details: '技能详情', close: '关闭', noDescription: '无简介', recent: '最近操作', partial: '部分技能数据加载失败。', loadError: '无法加载技能清单', unknownError: '未知错误', emptyTitle: '没有匹配的技能', emptyBody: '请调整或清除当前筛选条件。', cancel: '取消', confirm: '确认', working: '处理中…', confirmPlaceholder: '输入完整技能名', success: (action, name) => `${action}：${name}`, nav: '技能', open: '打开技能管理',
        stats: { total: '总数', builtin: '内建', community: '社区', local: '本地' }, sources: { all: '全部', builtin: '内建', 'hub-installed': '社区', local: '本地' }, statuses: { all: '全部状态', enabled: '启用', disabled: '停用', deleted: '已删除' }, trust: { builtin: '内建', official: '官方', community: '社区', local: '本地' }, codex: { installed: '已在 Codex', notInstalled: '未在 Codex' }, fields: { category: '分类', source: '来源', trust: '信任', status: '状态', path: 'Hermes 路径', identifier: '标识', installed: '安装时间', updated: '更新时间', codexStatus: 'Codex 状态', codexPath: 'Codex 路径' }, actions: { delete: '删除', reset: '重置', update: '更新', restore: '恢复', 'sync-codex': '同步到 Codex' }, confirmTitle: { delete: '删除技能', reset: '重置技能', 'sync-codex': '覆盖 Codex 技能' }, confirmBody: { delete: name => `这会永久删除 ${name} 的本地文件。请输入完整技能名继续。`, reset: name => `这会用来源版本覆盖 ${name} 的本地内容。请输入完整技能名继续。`, 'sync-codex': name => `Codex 中已存在 ${name}。请输入完整技能名，用 Hermes 副本覆盖它。` }
      }
    })
    ctx.register({ id: 'route', area: ROUTES_AREA, data: { path: ROUTE }, render: () => jsx(SkillManagePage, {}) })
    ctx.register({ id: 'nav', area: SIDEBAR_NAV_AREA, data: { path: ROUTE, label: ctx.i18n.t('nav'), codicon: 'extensions' } })
    ctx.register({ id: 'open', area: PALETTE_AREA, data: { id: 'desktop-skill-manager.open', label: ctx.i18n.t('open'), keywords: ['skill', 'manage', '技能'], run: () => host.navigate(ROUTE) } })
  }
}

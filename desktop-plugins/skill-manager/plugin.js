/** Skill Manager Desktop entry with cross-agent symlink bindings. */
import {
  Button, Codicon, EmptyState, ErrorState, GlyphSpinner, Input,
  PALETTE_AREA, ROUTES_AREA, SIDEBAR_NAV_AREA, ScrollArea, host,
  useMutation, useQuery, useQueryClient
} from '@hermes/plugin-sdk'
import { useMemo, useState } from 'react'
import { Fragment, jsx, jsxs } from 'react/jsx-runtime'
import core from './plugin-core.js'

const ID = 'skill-manager'
const LINKS_ROUTE = '/skill-manager/links'
const QUERY_KEY = [ID, 'inventory']
const TARGETS = [
  { id: 'codex', label: 'Codex' },
  { id: 'qwenwork', label: 'QwenWork' },
  { id: 'workbuddy', label: 'WorkBuddy' }
]

let pluginContext

const sourceOf = row => row.kind || row.source || 'local'
const linkable = row => ['builtin', 'hub-installed', 'local'].includes(sourceOf(row))
  && row.status !== 'deleted'

function strings() {
  const zh = pluginContext?.i18n?.t?.('language') === 'zh'
  return zh ? {
    nav: 'Agent 链接',
    open: '打开 Agent 链接',
    title: 'Agent 技能链接',
    subtitle: '技能文件保留在 Hermes 原目录，仅在其他 Agent 的 skills 目录创建软链接。',
    search: '搜索 Hermes 技能',
    skill: '技能',
    target: '链接到 Agent',
    empty: '没有可链接的 Hermes 技能',
    retry: '重试',
    loadError: '无法加载技能清单',
    confirmTitle: '重新绑定软链接',
    confirmBody: (name, agent) => `${agent} 已存在同名软链接。输入完整技能名 ${name} 以重新绑定。`,
    confirmPlaceholder: '输入完整技能名',
    cancel: '取消',
    confirm: '重新绑定',
    linking: '链接中…',
    linked: (name, agent, unchanged) => unchanged
      ? `${name} 已经链接到 ${agent}`
      : `${name} 已链接到 ${agent}`,
    conflict: '目标已有其他软链接，需要确认后重新绑定。'
  } : {
    nav: 'Agent Links',
    open: 'Open Agent Links',
    title: 'Agent Skill Links',
    subtitle: 'Keep skill files in Hermes and expose them to other agents with directory symlinks.',
    search: 'Search Hermes skills',
    skill: 'Skill',
    target: 'Link to agent',
    empty: 'No linkable Hermes skills',
    retry: 'Retry',
    loadError: 'Unable to load skill inventory',
    confirmTitle: 'Rebind symlink',
    confirmBody: (name, agent) => `${agent} already has a symlink with this name. Type ${name} to rebind it.`,
    confirmPlaceholder: 'Type the exact skill name',
    cancel: 'Cancel',
    confirm: 'Rebind',
    linking: 'Linking…',
    linked: (name, agent, unchanged) => unchanged
      ? `${name} is already linked to ${agent}`
      : `${name} linked to ${agent}`,
    conflict: 'The target has another symlink. Confirm the exact skill name to rebind it.'
  }
}

function parseError(error) {
  const raw = error?.message ? String(error.message) : String(error || '')
  const status = Number((raw.match(/^(\d+):/) || [])[1] || 0)
  try {
    const body = JSON.parse(raw.replace(/^\d+:\s*/, ''))
    return { status, detail: body?.detail || body?.error || raw }
  } catch (_ignored) {
    return { status, detail: raw }
  }
}

function ConfirmRebind({ busy, pending, onCancel, onConfirm }) {
  const [value, setValue] = useState('')
  if (!pending) return null
  const t = strings()
  const target = TARGETS.find(item => item.id === pending.agent)?.label || pending.agent
  const valid = value === pending.row.name && !busy
  return jsxs('section', {
    className: 'rounded-md border border-(--ui-stroke-primary) p-3',
    children: [
      jsx('h2', { className: 'text-sm font-semibold', children: t.confirmTitle }),
      jsx('p', {
        className: 'mt-1 text-xs leading-5 text-(--ui-text-secondary)',
        children: t.confirmBody(pending.row.name, target)
      }),
      jsxs('div', { className: 'mt-3 flex flex-wrap items-center gap-2', children: [
        jsx(Input, {
          className: 'min-w-[14rem] flex-1',
          disabled: busy,
          placeholder: t.confirmPlaceholder,
          value,
          onChange: event => setValue(event.target.value),
          onKeyDown: event => event.key === 'Enter' && valid && onConfirm(value)
        }),
        jsx(Button, {
          disabled: busy,
          variant: 'ghost',
          onClick: onCancel,
          children: t.cancel
        }),
        jsx(Button, {
          disabled: !valid,
          onClick: () => onConfirm(value),
          children: busy
            ? jsxs(Fragment, { children: [jsx(GlyphSpinner, {}), ` ${t.linking}`] })
            : t.confirm
        })
      ] })
    ]
  })
}

function AgentLinksPage() {
  const t = strings()
  const [query, setQuery] = useState('')
  const [pending, setPending] = useState(null)
  const queryClient = useQueryClient()
  const inventory = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => pluginContext.rest('/inventory'),
    refetchInterval: 15000,
    retry: 2
  })
  const mutation = useMutation({
    mutationFn: ({ row, agent, confirm = '', force = false }) => pluginContext.rest('/link-agent', {
      method: 'POST',
      body: {
        source: sourceOf(row),
        name: row.name,
        target_agent: agent,
        ...(confirm ? { confirm } : {}),
        force
      }
    }),
    onSuccess: async (data, variables) => {
      setPending(null)
      await queryClient.invalidateQueries({ queryKey: QUERY_KEY }).catch(() => {})
      const target = TARGETS.find(item => item.id === variables.agent)?.label || variables.agent
      host.notify({
        kind: 'success',
        message: t.linked(variables.row.name, target, Boolean(data?.unchanged))
      })
    },
    onError: (error, variables) => {
      const payload = parseError(error)
      if (!variables.force && payload.status === 409 && /软链接|symlink/i.test(String(payload.detail))) {
        setPending({ row: variables.row, agent: variables.agent })
        host.notify({ kind: 'warning', message: t.conflict })
        return
      }
      host.notify({ kind: 'error', message: String(payload.detail || error) })
    }
  })

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return (Array.isArray(inventory.data?.skills) ? inventory.data.skills : [])
      .filter(linkable)
      .filter(row => !needle || [row.name, row.description, row.category, row.source]
        .join('\n').toLowerCase().includes(needle))
      .sort((left, right) => String(left.name).localeCompare(String(right.name)))
  }, [inventory.data, query])

  if (inventory.isPending) {
    return jsx('div', { className: 'grid h-full place-items-center', children: jsx(GlyphSpinner, {}) })
  }
  if (inventory.isError) {
    return jsx('div', {
      className: 'grid h-full place-items-center p-6',
      children: jsx(ErrorState, {
        title: t.loadError,
        description: parseError(inventory.error).detail,
        children: jsx(Button, { variant: 'secondary', onClick: () => inventory.refetch(), children: t.retry })
      })
    })
  }

  return jsxs('div', { className: 'flex h-full min-h-0 flex-col', children: [
    jsxs('header', { className: 'border-b border-(--ui-stroke-secondary) px-4 py-4', children: [
      jsx('h1', { className: 'text-lg font-semibold', children: t.title }),
      jsx('p', { className: 'mt-1 text-sm text-(--ui-text-secondary)', children: t.subtitle })
    ] }),
    jsx(ScrollArea, {
      className: 'min-h-0 flex-1',
      children: jsxs('main', { className: 'space-y-3 p-4', children: [
        jsx(Input, {
          'aria-label': t.search,
          placeholder: t.search,
          value: query,
          onChange: event => setQuery(event.target.value)
        }),
        jsx(ConfirmRebind, {
          busy: mutation.isPending,
          pending,
          onCancel: () => setPending(null),
          onConfirm: confirm => mutation.mutate({ ...pending, confirm, force: true })
        }),
        rows.length ? jsx('div', {
          className: 'overflow-x-auto rounded-sm border border-(--ui-stroke-secondary)',
          children: jsxs('table', { className: 'w-full min-w-[42rem] table-fixed border-collapse text-sm', children: [
            jsx('thead', {
              className: 'bg-(--ui-bg-secondary) text-left text-xs text-(--ui-text-tertiary)',
              children: jsx('tr', { children: [
                jsx('th', { className: 'w-[24rem] px-3 py-2 font-medium', children: t.skill }),
                jsx('th', { className: 'px-3 py-2 text-right font-medium', children: t.target })
              ] })
            }),
            jsx('tbody', {
              className: 'divide-y divide-(--ui-stroke-secondary)',
              children: rows.map(row => jsxs('tr', { children: [
                jsx('td', {
                  className: 'px-3 py-2 align-middle',
                  children: jsxs('div', { className: 'min-w-0', children: [
                    jsx('div', { className: 'break-all font-medium', children: row.name }),
                    jsx('div', {
                      className: 'mt-0.5 truncate text-xs text-(--ui-text-secondary)',
                      title: row.description || '',
                      children: row.description || sourceOf(row)
                    })
                  ] })
                }),
                jsx('td', {
                  className: 'px-3 py-2 align-middle',
                  children: jsx('div', {
                    className: 'flex flex-wrap justify-end gap-2',
                    children: TARGETS.map(target => jsx(Button, {
                      disabled: mutation.isPending,
                      size: 'sm',
                      variant: 'secondary',
                      onClick: () => mutation.mutate({ row, agent: target.id }),
                      children: jsxs(Fragment, { children: [
                        jsx(Codicon, { name: 'link' }),
                        ` ${target.label}`
                      ] })
                    }, target.id))
                  })
                })
              ] }, `${sourceOf(row)}:${row.name}`))
            })
          ] })
        }) : jsx(EmptyState, { title: t.empty })
      ] })
    })
  ] })
}

export default {
  ...core,
  register(ctx) {
    pluginContext = ctx
    core.register(ctx)
    const t = strings()
    ctx.registerMany([
      {
        id: 'agent-links-route',
        area: ROUTES_AREA,
        data: { path: LINKS_ROUTE },
        render: () => jsx(AgentLinksPage, {})
      },
      {
        id: 'agent-links-nav',
        area: SIDEBAR_NAV_AREA,
        data: { path: LINKS_ROUTE, label: t.nav, codicon: 'link' }
      },
      {
        id: 'agent-links-open',
        area: PALETTE_AREA,
        data: {
          id: 'skill-manager.links',
          label: t.open,
          keywords: ['skill', 'link', 'agent', '软链接'],
          run: () => host.navigate(LINKS_ROUTE)
        }
      }
    ])
  }
}

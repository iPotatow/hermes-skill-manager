/** Skill Manager Desktop entry with Hermes-native cross-agent sharing. */
import {
  Badge, Button, Codicon, CopyButton, EmptyState, ErrorState, GlyphSpinner,
  Input, SegmentedControl, StatusDot,
  PALETTE_AREA, ROUTES_AREA, SIDEBAR_NAV_AREA, ScrollArea, host,
  useMutation, useQuery, useQueryClient
} from '@hermes/plugin-sdk'
import { useMemo, useState } from 'react'
import { Fragment, jsx, jsxs } from 'react/jsx-runtime'
import core from './plugin-core.js'

const ID = 'skill-manager'
const LINKS_ROUTE = '/skill-manager/links'
const QUERY_KEY = [ID, 'inventory']
const PAGE_SIZE = 10
const TARGETS = [
  { id: 'hermes', label: 'Hermes' },
  { id: 'codex', label: 'Codex' },
  { id: 'qwenwork', label: 'QwenWork' },
  { id: 'workbuddy', label: 'WorkBuddy' }
]
const ATTENTION_STATES = new Set(['conflict', 'broken', 'occupied'])

let pluginContext

const asArray = value => Array.isArray(value) ? value : []
const sourceOf = row => row.linkSource || row.kind || row.source || 'local'
const originOf = row => row.originAgent || 'hermes'
const relativeOf = row => row.linkRelativePath || row.relativePath || row.installPath || ''
const linkable = row => row.linkable === true
const stateOf = (row, agent) => row.agentLinks?.[agent] || 'absent'
const targetLabel = agent => TARGETS.find(item => item.id === agent)?.label || agent

function strings() {
  const zh = pluginContext?.i18n?.t?.('language') === 'zh'
  return zh ? {
    nav: '技能共享',
    open: '打开技能共享',
    title: '技能共享',
    subtitle: '一份技能，多 Agent 共用。技能保留在原位置，其他 Agent 通过链接使用。',
    skills: value => `${value} 个技能`,
    agents: value => `${value} 个 Agent`,
    shares: value => `${value} 个共享`,
    issues: value => `${value} 个需要处理`,
    search: '搜索技能名称、描述…',
    sourceFilter: '来源',
    statusFilter: '状态',
    agentFilter: 'Agent',
    all: '全部',
    onlyIssues: '只看异常',
    refresh: '重新扫描',
    refreshing: '扫描中…',
    viewSkill: '按技能',
    viewAgent: '按 Agent',
    skill: '技能名称',
    source: '来源',
    description: '描述',
    state: '状态',
    empty: '没有匹配的技能',
    retry: '重试',
    loadError: '无法加载技能清单',
    noDescription: '暂无描述',
    details: '技能详情',
    close: '关闭',
    originNote: '这是原始技能位置；其他 Agent 通过链接使用此技能。',
    relativePath: '相对路径',
    origin: '原始位置',
    agentStates: '在其他 Agent 中的状态',
    create: '创建',
    unlink: '解除',
    rebind: '重新绑定',
    occupiedHelp: '目标 Agent 中存在同名真实目录。为避免数据丢失，Skill Manager 不会覆盖它。',
    conflictHelp: '目标 Agent 已存在其他同名软链接，重新绑定后会改为指向当前技能。',
    brokenHelp: '目标 Agent 中的同名链接已经断开，可以重新绑定到当前技能。',
    confirmTitle: '重新绑定软链接',
    confirmBody: (name, agent) => `${agent} 已存在其他同名链接。输入完整技能名 ${name} 以重新绑定。`,
    confirmPlaceholder: '输入完整技能名',
    cancel: '取消',
    confirm: '重新绑定',
    linking: '处理中…',
    linked: (name, agent, unchanged) => unchanged
      ? `${name} 已经链接到 ${agent}`
      : `${name} 已链接到 ${agent}`,
    unlinked: (name, agent) => `${name} 已从 ${agent} 解绑，源文件未改动`,
    results: (from, to, total) => total ? `显示 ${from}–${to} 条，共 ${total} 条` : '0 条',
    filterStatus: {
      all: '全部状态', shared: '已共享', available: '可共享', issues: '需要处理', origin: '原始位置'
    },
    sourceLabels: {
      builtin: '内建', 'hub-installed': '社区', local: '本地',
      'skills-sh': 'skills.sh', 'skills.sh': 'skills.sh', codex: 'Codex',
      qwen: 'QwenWork', qwenwork: 'QwenWork', workbuddy: 'WorkBuddy', hermes: 'Hermes'
    },
    states: {
      self: '原始位置', linked: '已链接', absent: '可创建链接',
      occupied: '同名真实目录占用', conflict: '名称冲突', broken: '断链'
    }
  } : {
    nav: 'Skill Sharing',
    open: 'Open Skill Sharing',
    title: 'Skill Sharing',
    subtitle: 'Keep one skill in place and share it with multiple agents through directory links.',
    skills: value => `${value} skills`,
    agents: value => `${value} agents`,
    shares: value => `${value} shares`,
    issues: value => `${value} need attention`,
    search: 'Search skill names or descriptions…',
    sourceFilter: 'Source',
    statusFilter: 'Status',
    agentFilter: 'Agent',
    all: 'All',
    onlyIssues: 'Issues only',
    refresh: 'Rescan',
    refreshing: 'Scanning…',
    viewSkill: 'By skill',
    viewAgent: 'By agent',
    skill: 'Skill',
    source: 'Source',
    description: 'Description',
    state: 'State',
    empty: 'No matching skills',
    retry: 'Retry',
    loadError: 'Unable to load skill inventory',
    noDescription: 'No description',
    details: 'Skill details',
    close: 'Close',
    originNote: 'This is the original skill location. Other agents use this skill through links.',
    relativePath: 'Relative path',
    origin: 'Origin',
    agentStates: 'Status in other agents',
    create: 'Create',
    unlink: 'Unlink',
    rebind: 'Rebind',
    occupiedHelp: 'A real directory with the same name already exists in the target agent. Skill Manager will not overwrite it.',
    conflictHelp: 'The target agent has another symlink with this name. Rebinding will point it to this skill.',
    brokenHelp: 'The target agent has a broken link with this name. You can rebind it to this skill.',
    confirmTitle: 'Rebind symlink',
    confirmBody: (name, agent) => `${agent} already has another link with this name. Type ${name} to rebind it.`,
    confirmPlaceholder: 'Type the exact skill name',
    cancel: 'Cancel',
    confirm: 'Rebind',
    linking: 'Working…',
    linked: (name, agent, unchanged) => unchanged
      ? `${name} is already linked to ${agent}`
      : `${name} linked to ${agent}`,
    unlinked: (name, agent) => `${name} unlinked from ${agent}; source files were not changed`,
    results: (from, to, total) => total ? `Showing ${from}–${to} of ${total}` : '0 results',
    filterStatus: {
      all: 'All statuses', shared: 'Shared', available: 'Available', issues: 'Needs attention', origin: 'Origin'
    },
    sourceLabels: {
      builtin: 'Built-in', 'hub-installed': 'Community', local: 'Local',
      'skills-sh': 'skills.sh', 'skills.sh': 'skills.sh', codex: 'Codex',
      qwen: 'QwenWork', qwenwork: 'QwenWork', workbuddy: 'WorkBuddy', hermes: 'Hermes'
    },
    states: {
      self: 'Origin', linked: 'Linked', absent: 'Link available',
      occupied: 'Real directory occupies name', conflict: 'Name conflict', broken: 'Broken link'
    }
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

function actionBody(row, agent, confirm = '', force = false) {
  return {
    source: sourceOf(row),
    name: row.name,
    relative_path: relativeOf(row),
    target_agent: agent,
    ...(confirm ? { confirm } : {}),
    force
  }
}

function linkAgent(row, agent, confirm = '', force = false) {
  return pluginContext.rest('/link-agent', {
    method: 'POST',
    body: actionBody(row, agent, confirm, force)
  })
}

function unlinkAgent(row, agent) {
  return pluginContext.rest('/unlink-agent', {
    method: 'POST',
    body: actionBody(row, agent)
  })
}

function allRows(data) {
  return [
    ...asArray(data.skills),
    ...asArray(data.skillsShSkills),
    ...asArray(data.codexSkills),
    ...asArray(data.qwenworkSkills),
    ...asArray(data.workbuddySkills)
  ].filter(linkable)
}

function isAttention(state) {
  return ATTENTION_STATES.has(state)
}

function rowMatchesStatus(row, targets, status) {
  if (status === 'all') return true
  const states = targets.map(target => stateOf(row, target.id))
  if (status === 'shared') return states.includes('linked')
  if (status === 'available') return states.includes('absent')
  if (status === 'issues') return states.some(isAttention)
  if (status === 'origin') return states.includes('self')
  return true
}

function sourceLabel(row, t) {
  const source = sourceOf(row)
  return t.sourceLabels[source] || source
}

function stateTone(state) {
  if (state === 'linked') return 'good'
  if (state === 'conflict' || state === 'broken') return 'bad'
  if (state === 'occupied') return 'warn'
  return 'muted'
}

function StateMark({ agent, compact = false, onClick, row, t }) {
  const state = stateOf(row, agent.id)
  const disabled = state === 'self'
  const label = t.states[state] || state
  const content = state === 'self'
    ? jsx(Codicon, { name: 'circle-filled' })
    : state === 'absent'
      ? jsx(Codicon, { name: 'add' })
      : state === 'linked'
        ? jsx(StatusDot, { tone: 'good' })
        : state === 'occupied'
          ? jsx(StatusDot, { tone: 'warn' })
          : jsx(StatusDot, { tone: 'bad' })
  return jsx('button', {
    'aria-label': `${agent.label}: ${label}`,
    className: [
      'inline-flex h-8 items-center justify-center gap-1.5 rounded border border-(--ui-stroke-secondary)',
      compact ? 'min-w-8 px-2' : 'min-w-[6.5rem] px-2.5',
      state === 'self' ? 'text-(--ui-accent)' : '',
      disabled ? 'cursor-default' : 'hover:bg-(--ui-bg-secondary)'
    ].filter(Boolean).join(' '),
    disabled,
    title: `${agent.label} · ${label}`,
    type: 'button',
    onClick: () => !disabled && onClick(row, agent),
    children: compact
      ? content
      : jsxs(Fragment, { children: [content, jsx('span', { className: 'truncate text-xs', children: label })] })
  })
}

function ConfirmRebind({ busy, pending, onCancel, onConfirm }) {
  const [value, setValue] = useState('')
  if (!pending) return null
  const t = strings()
  const target = targetLabel(pending.agent)
  const valid = value === pending.row.name && !busy
  return jsx('div', {
    className: 'fixed inset-0 z-50 grid place-items-center bg-background/90 p-4 backdrop-blur-sm',
    role: 'presentation',
    onMouseDown: event => !busy && event.target === event.currentTarget && onCancel(),
    children: jsxs('section', {
      'aria-labelledby': 'agent-link-confirm-title',
      'aria-modal': true,
      className: 'w-full max-w-md rounded-lg border border-(--ui-stroke-secondary) bg-background p-4 shadow-xl',
      role: 'dialog',
      children: [
        jsx('h2', {
          className: 'text-base font-semibold',
          id: 'agent-link-confirm-title',
          children: t.confirmTitle
        }),
        jsx('p', {
          className: 'mt-2 text-sm leading-6 text-(--ui-text-secondary)',
          children: t.confirmBody(pending.row.name, target)
        }),
        jsx('code', {
          className: 'mt-3 block break-all rounded border border-(--ui-stroke-secondary) px-2 py-1.5 text-sm',
          children: pending.row.name
        }),
        jsx(Input, {
          autoFocus: true,
          className: 'mt-3 w-full',
          disabled: busy,
          placeholder: t.confirmPlaceholder,
          value,
          onChange: event => setValue(event.target.value),
          onKeyDown: event => event.key === 'Enter' && valid && onConfirm(value)
        }),
        jsxs('footer', { className: 'mt-4 flex justify-end gap-2', children: [
          jsx(Button, { disabled: busy, variant: 'ghost', onClick: onCancel, children: t.cancel }),
          jsx(Button, {
            disabled: !valid,
            variant: 'destructive',
            onClick: () => onConfirm(value),
            children: busy
              ? jsxs(Fragment, { children: [jsx(GlyphSpinner, {}), ` ${t.linking}`] })
              : t.confirm
          })
        ] })
      ]
    })
  })
}

function Summary({ issueCount, rowCount, shareCount, t }) {
  return jsxs('div', {
    className: 'mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-(--ui-text-secondary)',
    children: [
      jsx('strong', { className: 'font-semibold text-foreground', children: t.skills(rowCount) }),
      jsx('span', { children: '·' }),
      jsx('span', { children: t.agents(TARGETS.length) }),
      jsx('span', { children: '·' }),
      jsx('span', { children: t.shares(shareCount) }),
      jsx('span', { children: '·' }),
      jsxs('span', {
        className: issueCount ? 'font-medium' : '',
        children: [jsx(StatusDot, { tone: issueCount ? 'bad' : 'good', className: 'mr-1.5' }), t.issues(issueCount)]
      })
    ]
  })
}

function FilterBar({ filters, onChange, onRefresh, refreshing, rows, t }) {
  const sources = Array.from(new Set(rows.map(sourceOf))).sort()
  return jsxs('section', { className: 'space-y-3', children: [
    jsxs('div', { className: 'flex flex-wrap items-center gap-2', children: [
      jsx(Input, {
        'aria-label': t.search,
        className: 'min-w-[16rem] flex-1',
        placeholder: t.search,
        value: filters.query,
        onChange: event => onChange('query', event.target.value)
      }),
      jsx('select', {
        'aria-label': t.sourceFilter,
        className: 'h-8 w-[10rem] rounded border border-(--ui-stroke-secondary) bg-transparent px-2 text-sm',
        value: filters.source,
        onChange: event => onChange('source', event.target.value),
        children: [
          jsx('option', { value: 'all', children: `${t.sourceFilter}: ${t.all}` }),
          ...sources.map(source => jsx('option', {
            value: source,
            children: `${t.sourceFilter}: ${t.sourceLabels[source] || source}`
          }, source))
        ]
      }),
      jsx('select', {
        'aria-label': t.statusFilter,
        className: 'h-8 w-[10rem] rounded border border-(--ui-stroke-secondary) bg-transparent px-2 text-sm',
        value: filters.status,
        onChange: event => onChange('status', event.target.value),
        children: Object.entries(t.filterStatus).map(([value, label]) => jsx('option', {
          value,
          children: label
        }, value))
      }),
      jsx('select', {
        'aria-label': t.agentFilter,
        className: 'h-8 w-[10rem] rounded border border-(--ui-stroke-secondary) bg-transparent px-2 text-sm',
        value: filters.agent,
        onChange: event => onChange('agent', event.target.value),
        children: [
          jsx('option', { value: 'all', children: `${t.agentFilter}: ${t.all}` }),
          ...TARGETS.map(target => jsx('option', { value: target.id, children: target.label }, target.id))
        ]
      }),
      jsxs('label', {
        className: 'flex min-h-8 items-center gap-2 whitespace-nowrap text-sm',
        children: [
          jsx('input', {
            type: 'checkbox',
            checked: filters.onlyIssues,
            onChange: event => onChange('onlyIssues', event.target.checked)
          }),
          t.onlyIssues
        ]
      }),
      jsx(Button, {
        'aria-label': refreshing ? t.refreshing : t.refresh,
        disabled: refreshing,
        size: 'sm',
        variant: 'secondary',
        onClick: onRefresh,
        children: refreshing
          ? jsxs(Fragment, { children: [jsx(GlyphSpinner, {}), ` ${t.refreshing}`] })
          : jsxs(Fragment, { children: [jsx(Codicon, { name: 'refresh' }), ` ${t.refresh}`] })
      })
    ] }),
    jsx('div', {
      className: 'flex justify-end',
      children: jsx(SegmentedControl, {
        options: [
          { id: 'skill', label: t.viewSkill },
          { id: 'agent', label: t.viewAgent }
        ],
        value: filters.view,
        onChange: value => onChange('view', value)
      })
    })
  ] })
}

function MatrixTable({ busy, onAgentClick, onSelect, rows, targets, t }) {
  if (!rows.length) return jsx(EmptyState, { title: t.empty })
  return jsx('div', {
    className: 'overflow-x-auto rounded-sm border border-(--ui-stroke-secondary)',
    children: jsxs('table', {
      className: 'w-full min-w-[54rem] table-fixed border-collapse text-sm',
      children: [
        jsx('thead', {
          className: 'sticky top-0 z-10 bg-(--ui-bg-secondary) text-left text-xs text-(--ui-text-tertiary)',
          children: jsx('tr', { children: [
            jsx('th', { className: 'w-[15rem] px-3 py-2 font-medium', children: t.skill }),
            jsx('th', { className: 'w-[8rem] px-3 py-2 font-medium', children: t.source }),
            jsx('th', { className: 'w-[18rem] px-3 py-2 font-medium', children: t.description }),
            ...targets.map(target => jsx('th', {
              className: 'w-[7rem] px-2 py-2 text-center font-medium',
              children: target.label
            }, target.id))
          ] })
        }),
        jsx('tbody', {
          className: 'divide-y divide-(--ui-stroke-secondary)',
          children: rows.map(row => jsxs('tr', {
            className: 'group align-middle hover:bg-(--ui-bg-secondary)',
            children: [
              jsx('td', {
                className: 'px-3 py-2',
                children: jsx('button', {
                  className: 'block max-w-full break-all text-left font-medium hover:underline',
                  type: 'button',
                  onClick: () => onSelect(row, ''),
                  children: row.name
                })
              }),
              jsx('td', {
                className: 'px-3 py-2',
                children: jsx(Badge, {
                  className: 'max-w-full truncate border bg-transparent font-normal',
                  children: sourceLabel(row, t)
                })
              }),
              jsx('td', {
                className: 'px-3 py-2',
                children: jsx('div', {
                  className: 'truncate text-(--ui-text-secondary)',
                  title: row.description || t.noDescription,
                  children: row.description || t.noDescription
                })
              }),
              ...targets.map(target => jsx('td', {
                className: 'px-2 py-1.5 text-center',
                children: jsx(StateMark, {
                  agent: target,
                  compact: true,
                  row,
                  t,
                  onClick: busy ? () => {} : onAgentClick
                })
              }, target.id))
            ]
          }, `${sourceOf(row)}:${relativeOf(row)}:${row.name}`))
        })
      ]
    })
  })
}

function AgentTable({ busy, onAgentClick, onSelect, rows, targets, t }) {
  if (!rows.length) return jsx(EmptyState, { title: t.empty })
  const entries = []
  for (const target of targets) {
    for (const row of rows) entries.push({ target, row, state: stateOf(row, target.id) })
  }
  return jsx('div', {
    className: 'overflow-x-auto rounded-sm border border-(--ui-stroke-secondary)',
    children: jsxs('table', {
      className: 'w-full min-w-[42rem] table-fixed border-collapse text-sm',
      children: [
        jsx('thead', {
          className: 'sticky top-0 z-10 bg-(--ui-bg-secondary) text-left text-xs text-(--ui-text-tertiary)',
          children: jsx('tr', { children: [
            jsx('th', { className: 'w-[9rem] px-3 py-2 font-medium', children: t.agentFilter }),
            jsx('th', { className: 'w-[16rem] px-3 py-2 font-medium', children: t.skill }),
            jsx('th', { className: 'w-[10rem] px-3 py-2 font-medium', children: t.source }),
            jsx('th', { className: 'px-3 py-2 font-medium', children: t.state })
          ] })
        }),
        jsx('tbody', {
          className: 'divide-y divide-(--ui-stroke-secondary)',
          children: entries.map(({ target, row, state }) => jsxs('tr', {
            className: 'hover:bg-(--ui-bg-secondary)',
            children: [
              jsx('td', { className: 'px-3 py-2 font-medium', children: target.label }),
              jsx('td', {
                className: 'px-3 py-2',
                children: jsx('button', {
                  className: 'break-all text-left font-medium hover:underline',
                  type: 'button',
                  onClick: () => onSelect(row, target.id),
                  children: row.name
                })
              }),
              jsx('td', { className: 'px-3 py-2', children: sourceLabel(row, t) }),
              jsx('td', {
                className: 'px-3 py-1.5',
                children: jsx(StateMark, {
                  agent: target,
                  row,
                  t,
                  onClick: busy ? () => {} : onAgentClick
                })
              })
            ]
          }, `${target.id}:${sourceOf(row)}:${relativeOf(row)}:${state}`))
        })
      ]
    })
  })
}

function AgentStatusRow({ agent, busy, onAction, row, t }) {
  const state = stateOf(row, agent.id)
  const action = state === 'absent'
    ? t.create
    : state === 'linked'
      ? t.unlink
      : state === 'conflict' || state === 'broken'
        ? t.rebind
        : ''
  return jsxs('div', {
    className: 'flex items-center gap-2 border-b border-(--ui-stroke-secondary) py-2 last:border-b-0',
    children: [
      jsx('div', { className: 'w-[6rem] shrink-0 text-sm font-medium', children: agent.label }),
      jsx('div', {
        className: 'flex min-w-0 flex-1 items-center gap-2 text-xs text-(--ui-text-secondary)',
        children: [
          state === 'self'
            ? jsx(Codicon, { name: 'circle-filled', className: 'text-(--ui-accent)' })
            : state === 'absent'
              ? jsx(Codicon, { name: 'add' })
              : jsx(StatusDot, { tone: stateTone(state) }),
          jsx('span', { className: 'truncate', children: t.states[state] || state })
        ]
      }),
      action ? jsx(Button, {
        disabled: busy,
        size: 'sm',
        variant: state === 'conflict' || state === 'broken' ? 'destructive' : 'secondary',
        onClick: () => onAction(row, agent),
        children: action
      }) : null
    ]
  })
}

function DetailDrawer({ activeAgent, busy, onAction, onClose, row, t }) {
  if (!row) return null
  const selectedState = activeAgent ? stateOf(row, activeAgent) : ''
  const help = selectedState === 'occupied'
    ? t.occupiedHelp
    : selectedState === 'conflict'
      ? t.conflictHelp
      : selectedState === 'broken' ? t.brokenHelp : ''
  return jsxs('aside', {
    className: 'flex min-h-0 w-[22rem] shrink-0 flex-col border-l border-(--ui-stroke-secondary) bg-background',
    children: [
      jsxs('header', {
        className: 'flex items-start justify-between gap-3 border-b border-(--ui-stroke-secondary) p-4',
        children: [
          jsxs('div', { className: 'min-w-0', children: [
            jsx('div', { className: 'text-xs text-(--ui-text-tertiary)', children: t.details }),
            jsx('h2', { className: 'mt-1 break-all text-lg font-semibold', children: row.name }),
            jsx('div', { className: 'mt-2', children: jsx(Badge, {
              className: 'border bg-transparent font-normal',
              children: sourceLabel(row, t)
            }) })
          ] }),
          jsx(Button, {
            'aria-label': t.close,
            size: 'icon',
            variant: 'ghost',
            onClick: onClose,
            children: jsx(Codicon, { name: 'close' })
          })
        ]
      }),
      jsx(ScrollArea, {
        className: 'min-h-0 flex-1',
        children: jsxs('div', { className: 'space-y-5 p-4', children: [
          jsx('p', {
            className: 'text-sm leading-6 text-(--ui-text-secondary)',
            children: row.description || t.noDescription
          }),
          originOf(row) ? jsxs('section', {
            className: 'rounded-md border border-(--ui-stroke-secondary) p-3',
            children: [
              jsxs('div', { className: 'flex items-center gap-2 text-sm font-medium', children: [
                jsx(Codicon, { name: 'info' }),
                t.originNote
              ] }),
              jsxs('dl', { className: 'mt-3 space-y-2 text-sm', children: [
                jsxs('div', { className: 'grid grid-cols-[6rem_minmax(0,1fr)] gap-2', children: [
                  jsx('dt', { className: 'text-(--ui-text-tertiary)', children: t.origin }),
                  jsx('dd', { children: targetLabel(originOf(row)) })
                ] }),
                relativeOf(row) ? jsxs('div', { className: 'grid grid-cols-[6rem_minmax(0,1fr)] gap-2', children: [
                  jsx('dt', { className: 'text-(--ui-text-tertiary)', children: t.relativePath }),
                  jsxs('dd', { className: 'flex min-w-0 items-start gap-1', children: [
                    jsx('code', { className: 'min-w-0 flex-1 break-all text-xs', children: relativeOf(row) }),
                    jsx(CopyButton, {
                      appearance: 'inline',
                      label: t.relativePath,
                      showLabel: false,
                      text: relativeOf(row)
                    })
                  ] })
                ] }) : null
              ] })
            ]
          }) : null,
          help ? jsx('section', {
            className: 'rounded-md border border-(--ui-stroke-primary) p-3 text-sm leading-6 text-(--ui-text-secondary)',
            children: help
          }) : null,
          jsxs('section', { children: [
            jsx('h3', { className: 'mb-1 text-sm font-semibold', children: t.agentStates }),
            ...TARGETS.map(agent => jsx(AgentStatusRow, {
              agent,
              busy,
              row,
              t,
              onAction
            }, agent.id))
          ] })
        ] })
      })
    ]
  })
}

function Pagination({ page, pageCount, setPage, shown, total, t }) {
  if (!total) return null
  const from = (page - 1) * PAGE_SIZE + 1
  const to = Math.min((page - 1) * PAGE_SIZE + shown, total)
  return jsxs('div', {
    className: 'flex flex-wrap items-center justify-between gap-2 pt-3 text-xs text-(--ui-text-tertiary)',
    children: [
      jsx('span', { children: t.results(from, to, total) }),
      jsxs('div', { className: 'flex items-center gap-1', children: [
        jsx(Button, {
          'aria-label': 'Previous page',
          disabled: page <= 1,
          size: 'icon',
          variant: 'ghost',
          onClick: () => setPage(value => Math.max(1, value - 1)),
          children: jsx(Codicon, { name: 'chevron-left' })
        }),
        jsx('span', { className: 'min-w-12 text-center tabular-nums', children: `${page} / ${pageCount}` }),
        jsx(Button, {
          'aria-label': 'Next page',
          disabled: page >= pageCount,
          size: 'icon',
          variant: 'ghost',
          onClick: () => setPage(value => Math.min(pageCount, value + 1)),
          children: jsx(Codicon, { name: 'chevron-right' })
        })
      ] })
    ]
  })
}

function AgentLinksPage() {
  const t = strings()
  const [filters, setFilters] = useState({
    query: '', source: 'all', status: 'all', agent: 'all', onlyIssues: false, view: 'skill'
  })
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState(null)
  const [selectedAgent, setSelectedAgent] = useState('')
  const [pending, setPending] = useState(null)
  const queryClient = useQueryClient()
  const inventory = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => pluginContext.rest('/inventory'),
    refetchInterval: 15000,
    retry: 2
  })
  const mutation = useMutation({
    mutationFn: ({ action = 'link', row, agent, confirm = '', force = false }) => (
      action === 'unlink'
        ? unlinkAgent(row, agent)
        : linkAgent(row, agent, confirm, force)
    ),
    onSuccess: async (data, variables) => {
      setPending(null)
      await queryClient.invalidateQueries({ queryKey: QUERY_KEY }).catch(() => {})
      const target = targetLabel(variables.agent)
      host.notify({
        kind: 'success',
        message: variables.action === 'unlink'
          ? t.unlinked(variables.row.name, target)
          : t.linked(variables.row.name, target, Boolean(data?.unchanged))
      })
    },
    onError: (error, variables) => {
      const payload = parseError(error)
      if (variables.action !== 'unlink' && !variables.force && payload.status === 409
        && /软链接|symlink/i.test(String(payload.detail))) {
        setPending({ row: variables.row, agent: variables.agent })
        return
      }
      host.notify({ kind: 'error', message: String(payload.detail || error) })
    }
  })

  const rows = useMemo(() => allRows(inventory.data || {}).sort((left, right) => (
    String(left.name).localeCompare(String(right.name), undefined, { numeric: true, sensitivity: 'base' })
    || String(originOf(left)).localeCompare(String(originOf(right)))
    || String(relativeOf(left)).localeCompare(String(relativeOf(right)))
  )), [inventory.data])
  const visibleTargets = filters.agent === 'all'
    ? TARGETS
    : TARGETS.filter(target => target.id === filters.agent)
  const filteredRows = useMemo(() => {
    const needle = filters.query.trim().toLowerCase()
    return rows.filter(row => {
      if (filters.source !== 'all' && sourceOf(row) !== filters.source) return false
      if (needle && ![
        row.name, row.description, row.category, row.source, row.linkSource, row.originAgent
      ].join('\n').toLowerCase().includes(needle)) return false
      if (!rowMatchesStatus(row, visibleTargets, filters.status)) return false
      if (filters.onlyIssues && !visibleTargets.some(target => isAttention(stateOf(row, target.id)))) return false
      return true
    })
  }, [rows, filters.query, filters.source, filters.status, filters.onlyIssues, filters.agent])
  const shareCount = rows.reduce((count, row) => count + TARGETS.filter(
    target => stateOf(row, target.id) === 'linked'
  ).length, 0)
  const issueCount = rows.reduce((count, row) => count + TARGETS.filter(
    target => isAttention(stateOf(row, target.id))
  ).length, 0)
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount)
  const pageRows = filteredRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
  const busy = mutation.isPending
  const changeFilter = (key, value) => {
    setFilters(current => ({ ...current, [key]: value }))
    setPage(1)
  }
  const selectRow = (row, agent = '') => {
    setSelected(row)
    setSelectedAgent(agent)
  }
  const runTargetAction = (row, target) => {
    const state = stateOf(row, target.id)
    setSelected(row)
    setSelectedAgent(target.id)
    if (state === 'absent') {
      mutation.mutate({ action: 'link', row, agent: target.id })
      return
    }
    if (state === 'linked') return
    if (state === 'conflict' || state === 'broken') return
  }
  const runDrawerAction = (row, target) => {
    const state = stateOf(row, target.id)
    setSelectedAgent(target.id)
    if (state === 'absent') {
      mutation.mutate({ action: 'link', row, agent: target.id })
    } else if (state === 'linked') {
      mutation.mutate({ action: 'unlink', row, agent: target.id })
    } else if (state === 'conflict' || state === 'broken') {
      setPending({ row, agent: target.id })
    }
  }

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

  return jsxs(Fragment, { children: [
    jsxs('div', { className: 'flex h-full min-h-0 flex-col', children: [
      jsxs('header', { className: 'border-b border-(--ui-stroke-secondary) px-4 py-4', children: [
        jsxs('div', { className: 'flex flex-wrap items-start justify-between gap-3', children: [
          jsxs('div', { children: [
            jsx('h1', { className: 'text-xl font-semibold', children: t.title }),
            jsx('p', { className: 'mt-1 text-sm text-(--ui-text-secondary)', children: t.subtitle })
          ] }),
          jsx(Button, {
            disabled: inventory.isFetching,
            size: 'sm',
            variant: 'secondary',
            onClick: () => inventory.refetch(),
            children: inventory.isFetching
              ? jsxs(Fragment, { children: [jsx(GlyphSpinner, {}), ` ${t.refreshing}`] })
              : jsxs(Fragment, { children: [jsx(Codicon, { name: 'refresh' }), ` ${t.refresh}`] })
          })
        ] }),
        jsx(Summary, { issueCount, rowCount: rows.length, shareCount, t })
      ] }),
      jsxs('div', { className: 'flex min-h-0 flex-1 overflow-hidden', children: [
        jsxs('main', { className: 'flex min-w-0 flex-1 flex-col p-4', children: [
          jsx(FilterBar, {
            filters,
            onChange: changeFilter,
            onRefresh: () => inventory.refetch(),
            refreshing: inventory.isFetching,
            rows,
            t
          }),
          jsx(ScrollArea, {
            className: 'mt-3 min-h-0 flex-1',
            children: jsxs('div', { children: [
              filters.view === 'skill'
                ? jsx(MatrixTable, {
                    busy,
                    onAgentClick: runTargetAction,
                    onSelect: selectRow,
                    rows: pageRows,
                    targets: visibleTargets,
                    t
                  })
                : jsx(AgentTable, {
                    busy,
                    onAgentClick: runTargetAction,
                    onSelect: selectRow,
                    rows: pageRows,
                    targets: visibleTargets,
                    t
                  }),
              jsx(Pagination, {
                page: safePage,
                pageCount,
                setPage,
                shown: pageRows.length,
                total: filteredRows.length,
                t
              })
            ] })
          })
        ] }),
        selected ? jsx(DetailDrawer, {
          activeAgent: selectedAgent,
          busy,
          row: selected,
          t,
          onAction: runDrawerAction,
          onClose: () => { setSelected(null); setSelectedAgent('') }
        }) : null
      ] })
    ] }),
    jsx(ConfirmRebind, {
      key: pending ? `${sourceOf(pending.row)}:${relativeOf(pending.row)}:${pending.agent}` : 'none',
      busy,
      pending,
      onCancel: () => setPending(null),
      onConfirm: confirm => mutation.mutate({
        action: 'link',
        row: pending.row,
        agent: pending.agent,
        confirm,
        force: true
      })
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
          keywords: ['skill', 'sharing', 'link', 'agent', '共享', '软链接'],
          run: () => host.navigate(LINKS_ROUTE)
        }
      }
    ])
  }
}

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const pluginPath = path.join(__dirname, '..', 'desktop-plugins', 'skill-manager', 'plugin.js')
const source = fs.readFileSync(pluginPath, 'utf8')

test('desktop plugin stays within the uncompiled runtime contract', () => {
  const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(match => match[1])
  assert.deepEqual([...new Set(imports)].sort(), ['@hermes/plugin-sdk', 'react', 'react/jsx-runtime'])
  assert.doesNotMatch(source, /<[A-Z][A-Za-z0-9]*[\s/>]/)
  assert.match(source, /const ID = 'skill-manager'/)
})

test('desktop plugin registers all navigation surfaces in one contribution batch', () => {
  assert.match(source, /ctx\.registerMany\(\[/)
  assert.match(source, /area:\s*ROUTES_AREA/)
  assert.match(source, /area:\s*SIDEBAR_NAV_AREA/)
  assert.match(source, /area:\s*PALETTE_AREA/)
  assert.match(source, /run:\s*\(\) => host\.navigate\(ROUTE\)/)
})

test('desktop plugin uses the scoped backend and shared React Query client', () => {
  assert.match(source, /pluginContext\.rest\('\/inventory'\)/)
  assert.match(source, /pluginContext\.rest\(`\/\$\{action\}`/)
  assert.match(source, /refetchInterval:\s*REFRESH_INTERVAL_MS/)
  assert.match(source, /invalidateQueries\(\{ queryKey: QUERY_KEY \}\)/)
})

test('plugin update has a dedicated endpoint and an explicit second confirmation', () => {
  assert.match(source, /function PluginUpdateOverlay/)
  assert.match(source, /pluginContext\.rest\('\/plugin-update'/)
  assert.match(source, /body:\s*\{ confirm: ID \}/)
  assert.match(source, /onUpdate:\s*\(\) => setPluginUpdateOpen\(true\)/)
  assert.match(source, /onConfirm:\s*\(\) => pluginUpdate\.mutate\(\)/)
  assert.match(source, /pluginUpdateTitle: '更新技能管理插件？'/)
})

test('desktop action policy preserves every backend operation and confirmation boundary', () => {
  for (const action of ['delete', 'delete-codex', 'reset', 'restore', 'update', 'sync-codex']) {
    assert.match(source, new RegExp(action))
  }
  assert.match(source, /\['builtin', 'hub-installed', 'local'\]\.includes\(sourceOf\(row\)\)/)
  assert.match(source, /force:\s*action === 'sync-codex' && Boolean\(confirm\)/)
  assert.match(source, /CONFIRMED_ACTIONS = new Set\(\['delete', 'delete-codex', 'reset'\]\)/)
  assert.match(source, /payload\.status === 409/)
})

test('desktop renders Hermes and Codex user skills as tables without skill cards', () => {
  assert.match(source, /function SkillTable/)
  assert.match(source, /function CodexTable/)
  assert.match(source, /jsxs\('table'/)
  assert.match(source, /onClick: \(\) => onAction\(row, 'delete-codex'\)/)
  assert.doesNotMatch(source, /function SkillCard/)
  assert.doesNotMatch(source, /function SkillList/)
  assert.doesNotMatch(source, /codexList\.(?:system|user)/)
})

test('descriptions sit below skill names and stay on one line', () => {
  assert.match(source, /min-w-\[60rem\] table-fixed/)
  assert.match(source, /min-w-\[56rem\] table-fixed/)
  assert.match(source, /className: 'mt-0\.5 truncate text-xs text-\(--ui-text-secondary\)'/)
  assert.match(source, /title: descriptionOf\(row, language\) \|\| t\('noDescription'\)/)
  assert.match(source, /title: row\.description \|\| t\('noDescription'\)/)
})

test('Hermes table omits Codex status while Codex rows show their Hermes relationship', () => {
  assert.match(source, /skill: '技能', category: '分类', source: '来源', type: '类型'/)
  assert.match(source, /function SourceCell/)
  assert.match(source, /function HermesSyncStatus/)
  assert.match(source, /function linkCodexToHermes/)
  assert.match(source, /hermesRows\.filter\(row => row\.codexInstalled\)/)
  assert.match(source, /children: t\('hermesSync\.title'\)/)
  assert.doesNotMatch(source, /codexStatus|CodexStatus|detailGroups\.codex/)
  assert.doesNotMatch(source, /children:\s*t\('table\.type'\)/)
  assert.match(source, /const rawSourceOf = row => row\.rawSource \|\| row\.source \|\| sourceOf\(row\)/)
})

test('search and filters wrap responsively and can be cleared', () => {
  assert.match(source, /className: 'space-y-3 rounded-md border[^\n]*p-3'/)
  assert.match(source, /className: 'flex flex-wrap items-center gap-2'/)
  assert.match(source, /className: 'min-w-\[16rem\] flex-1'/)
  assert.match(source, /clearFilters: '清除筛选'/)
  assert.match(source, /onClick: onClear/)
  assert.doesNotMatch(source, /const STATUSES/)
  assert.doesNotMatch(source, /filters\.status/)
  assert.doesNotMatch(source, /onChange\('status'/)
})

test('row actions are rendered as direct buttons without dropdown menus', () => {
  assert.match(source, /function ActionButtons/)
  assert.match(source, /children: actions\.map\(action => jsx\(Button/)
  assert.match(source, /onClick: \(\) => onAction\(row, action\)/)
  assert.match(source, /onClick: \(\) => onAction\(row, 'delete-codex'\)/)
  assert.match(source, /variant: 'destructive'/)
  assert.doesNotMatch(source, /ActionMenu|DropdownMenu|moreActions|resync/)
})

test('table headers and cells are vertically centered', () => {
  assert.match(source, /className: 'group align-middle hover:bg-\(--ui-bg-secondary\)'/)
  assert.match(source, /px-3 py-2 align-middle/)
  assert.doesNotMatch(source, /align-top/)
})

test('confirmation dialog can fill the exact skill name with one click', () => {
  assert.match(source, /confirmFill: '填入名称'/)
  assert.match(source, /onClick:\s*\(\) => setValue\(pending\.row\.name\)/)
})

test('desktop copy is bilingual and includes backend-mount guidance', () => {
  assert.match(source, /function CodexTable/)
  assert.match(source, /codexList:/)
  assert.match(source, /'sync-codex': 'Sync'/)
  assert.match(source, /'sync-codex': '同步'/)
  assert.match(source, /backendUnavailable:/)
  assert.match(source, /ctx\.i18n\.register\(MESSAGES\)/)
  assert.match(source, /language: 'en'/)
  assert.match(source, /language: 'zh'/)
  assert.match(source, /const language = t\('language'\) === 'zh' \? 'zh' : 'en'/)
  assert.doesNotMatch(source, /document\.documentElement\.lang|navigator\.language/)
})

test('Hermes and Codex are separate inventory views with correct result totals', () => {
  assert.match(source, /const VIEWS = \['hermes', 'codex'\]/)
  assert.match(source, /const SOURCES = \['all', 'builtin', 'hub-installed', 'local'\]/)
  assert.match(source, /jsx\(SegmentedControl/)
  assert.match(source, /const showingCodex = filters\.view === 'codex'/)
  assert.match(source, /const totalCount = showingCodex \? view\.codex\.length : view\.rows\.length/)
  assert.match(source, /showingCodex\s*\? jsx\(CodexTable/)
  assert.match(source, /showMissingBuiltin: '显示可恢复的内建技能'/)
  assert.doesNotMatch(source, /showDeleted/)
})

test('drawers and confirmation overlays support keyboard focus and copyable paths', () => {
  assert.match(source, /function useDialogA11y/)
  assert.match(source, /event\.key === 'Escape'/)
  assert.match(source, /event\.key !== 'Tab'/)
  assert.match(source, /previous\?\.focus\?\.\(\)/)
  assert.match(source, /'aria-labelledby': 'skill-detail-title'/)
  assert.match(source, /'aria-labelledby': 'skill-confirm-title'/)
  assert.match(source, /jsx\(CopyButton/)
  assert.doesNotMatch(source, /codexFields/)
})

test('desktop plugin avoids hard-coded color literals', () => {
  assert.doesNotMatch(source, /#[0-9a-f]{3,8}\b/i)
  assert.doesNotMatch(source, /\b(?:rgb|hsl)a?\s*\(/i)
})

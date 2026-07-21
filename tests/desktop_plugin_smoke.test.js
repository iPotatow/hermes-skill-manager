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
  assert.match(source, /onAction\(row, 'delete-codex'\)/)
  assert.doesNotMatch(source, /function SkillCard/)
  assert.doesNotMatch(source, /function SkillList/)
  assert.doesNotMatch(source, /codexList\.(?:system|user)/)
})

test('descriptions sit below skill names and stay on one line', () => {
  assert.doesNotMatch(source, /children:\s*t\('table\.description'\)/)
  assert.match(source, /min-w-\[68rem\] table-fixed/)
  assert.match(source, /min-w-\[46rem\] table-fixed/)
  for (const column of ['source', 'category', 'status', 'codex', 'actions']) {
    assert.match(source, new RegExp(`children: t\\('table\\.${column}'\\)`))
  }
  assert.match(source, /className: 'mt-0\.5 truncate text-xs text-\(--ui-text-secondary\)'/)
  assert.match(source, /title: descriptionOf\(row, language\) \|\| t\('noDescription'\)/)
  assert.match(source, /title: row\.description \|\| t\('noDescription'\)/)
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
})

test('Codex appears directly after Local as a source tab and swaps the main table', () => {
  assert.match(source, /const SOURCES = \['all', 'builtin', 'hub-installed', 'local', 'codex'\]/)
  assert.match(source, /local: '本地', codex: 'Codex'/)
  assert.match(source, /const showingCodex = filters\.source === 'codex'/)
  assert.match(source, /showingCodex\s*\? jsx\(CodexTable/)
  assert.doesNotMatch(source, /jsx\(CodexSkills/)
})

test('desktop plugin avoids hard-coded color literals', () => {
  assert.doesNotMatch(source, /#[0-9a-f]{3,8}\b/i)
  assert.doesNotMatch(source, /\b(?:rgb|hsl)a?\s*\(/i)
})

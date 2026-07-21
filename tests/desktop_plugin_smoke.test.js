const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const pluginPath = path.join(__dirname, '..', 'desktop-plugins', 'desktop-skill-manager', 'plugin.js')
const source = fs.readFileSync(pluginPath, 'utf8')

test('desktop plugin stays within the uncompiled runtime contract', () => {
  const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(match => match[1])
  assert.deepEqual([...new Set(imports)].sort(), ['@hermes/plugin-sdk', 'react', 'react/jsx-runtime'])
  assert.doesNotMatch(source, /<[A-Z][A-Za-z0-9]*[\s/>]/)
  assert.match(source, /const ID = 'desktop-skill-manager'/)
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

test('desktop action policy preserves every backend operation and confirmation boundary', () => {
  for (const action of ['delete', 'reset', 'restore', 'update', 'sync-codex']) {
    assert.match(source, new RegExp(action))
  }
  assert.match(source, /\['hub-installed', 'local'\]\.includes\(sourceOf\(row\)\)/)
  assert.match(source, /force:\s*action === 'sync-codex' && Boolean\(confirm\)/)
  assert.match(source, /CONFIRMED_ACTIONS = new Set\(\['delete', 'reset'\]\)/)
  assert.match(source, /payload\.status === 409/)
})

test('desktop copy is bilingual and includes backend-mount guidance', () => {
  assert.match(source, /function CodexSkills/)
  assert.match(source, /codexList:/)
  assert.match(source, /'sync-codex': 'Sync'/)
  assert.match(source, /'sync-codex': '同步'/)
  assert.match(source, /backendUnavailable:/)
  assert.match(source, /ctx\.i18n\.register\(MESSAGES\)/)
})

test('desktop plugin avoids hard-coded color literals', () => {
  assert.doesNotMatch(source, /#[0-9a-f]{3,8}\b/i)
  assert.doesNotMatch(source, /\b(?:rgb|hsl)a?\s*\(/i)
})

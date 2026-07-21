const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const pluginPath = path.join(__dirname, '..', 'desktop-plugins', 'desktop-skill-manager', 'plugin.js')
const source = fs.readFileSync(pluginPath, 'utf8')

test('desktop plugin uses only supported runtime imports', () => {
  const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(match => match[1])
  assert.deepEqual([...new Set(imports)].sort(), ['@hermes/plugin-sdk', 'react', 'react/jsx-runtime'])
  assert.equal(source.includes('<SkillManagePage'), false)
})

test('desktop plugin registers a route, navigation, palette, and backend calls', () => {
  assert.match(source, /area:\s*ROUTES_AREA/)
  assert.match(source, /area:\s*SIDEBAR_NAV_AREA/)
  assert.match(source, /area:\s*PALETTE_AREA/)
  assert.match(source, /pluginContext\.rest\('\/inventory'\)/)
  assert.match(source, /const ID = 'desktop-skill-manager'/)
  for (const action of ['delete', 'reset', 'restore', 'update', 'sync-codex']) assert.match(source, new RegExp(`${action}`))
  assert.match(source, /codexInstalled/)
  assert.match(source, /force: action === 'sync-codex'/)
  assert.match(source, /\['hub-installed', 'local'\]\.includes\(sourceOf\(row\)\)/)
  assert.match(source, /function CodexSkills/)
  assert.match(source, /data\.codexSkills/)
  assert.match(source, /'sync-codex': 'Sync'/)
  assert.match(source, /'sync-codex': '同步'/)
})

test('desktop plugin avoids hard-coded color literals', () => {
  assert.doesNotMatch(source, /#[0-9a-f]{3,8}\b/i)
  assert.doesNotMatch(source, /\b(?:rgb|hsl)a?\s*\(/i)
})

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const entry = fs.readFileSync(path.join(__dirname, '..', 'desktop', 'plugin.js'), 'utf8')

test('shipped single-file entry loads and registers both pages through the SDK', async () => {
  const modules = [...entry.matchAll(/import \{ ([^}]+) \} from '([^']+)'/g)]
  assert.deepEqual(modules.map(m => m[2]).sort(), ['@hermes/plugin-sdk', 'react', 'react/jsx-runtime'])
  assert.doesNotMatch(entry, /from ['"]\.\.?\//)
  const source = entry.replace(/import \{ ([^}]+) \} from '([^']+)'/g, (_whole, names) => {
    const mock = names.split(',').map(name => `export const ${name.trim()} = () => {};`).join('\n')
    return `import { ${names} } from '${'data:text/javascript;base64,' + Buffer.from(mock).toString('base64')}'`
  })
  const { default: plugin } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))
  const contributions = []
  let registeredMessages
  const ctx = {
    i18n: { register: messages => { registeredMessages = messages }, t: key => key },
    registerMany: rows => { contributions.push(...rows); return () => {} }
  }
  plugin.register(ctx)
  assert.equal(plugin.id, 'skill-manager')
  assert.ok(registeredMessages)
  assert.deepEqual(contributions.filter(row => row.data?.path).map(row => row.data.path).sort(), [
    '/skill-manager', '/skill-manager', '/skill-manager/links', '/skill-manager/links'
  ])
  assert.equal(new Set(contributions.map(row => row.id)).size, contributions.length)
})

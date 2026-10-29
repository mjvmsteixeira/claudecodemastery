import { test, expect, mock } from 'claude-code/testing'
import type { On } from 'claude-code'

const M = '[' + 'prumo:SEGREDO]'

function hooks(on: On) {
  mock.env(on, { HOME: '/h' })
  on('fs.read', () => ({ deny: 'ENOENT' }))
  on('fs.stat', () => ({ deny: 'ENOENT' }))
  on('tool.call', () => ({ result: 'ok', text: 'ok' }))
}

test('V kv patch com marcador é recusado', async ($, on) => {
  hooks(on)
  const r = await $.tool.call({ tool: 'Bash', command: `V kv patch secret/x api_key=${M}` })
  expect(r.deny).toBeDefined()
  expect(r.deny).not.toContain(M)
})

test('vault kv put com marcador num heredoc é recusado', async ($, on) => {
  hooks(on)
  const command = `vault kv put secret/x - <<'EOF'\n{"k":"${M}"}\nEOF`
  const r = await $.tool.call({ tool: 'Bash', command })
  expect(r.deny).toBeDefined()
})

test('curl POST a /v1/secret/ com marcador é recusado', async ($, on) => {
  hooks(on)
  const command = `curl -X POST http://127.0.0.1:8200/v1/secret/data/x -d '{"data":{"k":"${M}"}}'`
  const r = await $.tool.call({ tool: 'Bash', command })
  expect(r.deny).toBeDefined()
})

test('vault kv get passa', async ($, on) => {
  hooks(on)
  const r = await $.tool.call({ tool: 'Bash', command: 'vault kv get secret/x' })
  expect(r.deny).toBeUndefined()
})

test('grep por marcador sem escrita no Vault passa', async ($, on) => {
  hooks(on)
  const r = await $.tool.call({ tool: 'Bash', command: "grep -c '[" + "prumo:' f" })
  expect(r.deny).toBeUndefined()
})

test('vault kv patch sem marcador passa', async ($, on) => {
  hooks(on)
  const r = await $.tool.call({ tool: 'Bash', command: 'vault kv patch secret/x k=-' })
  expect(r.deny).toBeUndefined()
})

test('vault kv -mount=secret put com marcador é recusado', async ($, on) => {
  hooks(on)
  const r = await $.tool.call({ tool: 'Bash', command: `vault kv -mount=secret put x k=${M}` })
  expect(r.deny).toBeDefined()
})

test('vault write -mount=secret com marcador é recusado', async ($, on) => {
  hooks(on)
  const r = await $.tool.call({ tool: 'Bash', command: `vault write -mount=secret x k=${M}` })
  expect(r.deny).toBeDefined()
})

test('marcador por pipe para vault kv put é recusado', async ($, on) => {
  hooks(on)
  const r = await $.tool.call({ tool: 'Bash', command: `printf '%s' '${M}' | vault kv put x k=-` })
  expect(r.deny).toBeDefined()
})

test('wget --method=PUT --body-data a /v1/kv/data/ é recusado', async ($, on) => {
  hooks(on)
  const r = await $.tool.call({ tool: 'Bash', command: `wget --method=PUT --body-data='${M}' https://v/v1/kv/data/x` })
  expect(r.deny).toBeDefined()
})

test('vault kv get -mount=secret passa', async ($, on) => {
  hooks(on)
  const r = await $.tool.call({ tool: 'Bash', command: 'vault kv get -mount=secret x' })
  expect(r.deny).toBeUndefined()
})

test('com a redação desligada o Vault continua a recusar marcadores', async ($, on) => {
  mock.env(on, { HOME: '/h' })
  on('fs.read', (_$, e) => (e.path === '/h/.prumo/guard.json' ? { value: '{"redact":{"enabled":false}}' } : { deny: 'ENOENT' }))
  on('fs.exists', (_$, e) => ({ value: e.path === '/h/.prumo/guard.json' }))
  on('fs.stat', () => ({ deny: 'ENOENT' }))
  on('tool.call', () => ({ result: 'ok', text: 'ok' }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/h', surface: null, isInteractive: false })
  const r = await $.tool.call({ tool: 'Bash', command: `vault kv patch secret/x k=${M}` })
  expect(r.deny).toBeDefined()
})

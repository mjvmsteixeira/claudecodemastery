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

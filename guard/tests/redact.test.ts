import { test, expect, mock } from 'claude-code/testing'
import type { On } from 'claude-code'

const TOKEN = 'hvs.' + 'A'.repeat(24)

function toolRow(text: string, tool = 'Bash', agentId?: string) {
  return {
    door: 'tool-result' as const,
    origin: { kind: 'tool' as const, tool },
    uuid: 'u1',
    ...(agentId ? { agentId } : {}),
    message: { type: 'user' as const, role: 'user' as const, content: [{ type: 'tool_result' as const, tool_use_id: 't1', content: text }] },
  }
}

function baseHooks(on: On) {
  mock.env(on, { HOME: '/h' })
  on('fs.read', () => ({ deny: 'ENOENT' }))
  on('ui.toast', () => ({ value: undefined }))
}

test('resultado de Bash é redigido antes de ser guardado', async ($, on) => {
  baseHooks(on)
  const stored = await $.session.append(toolRow(`VAULT_TOKEN=${TOKEN}`) as never)
  expect(JSON.stringify(stored.message)).toContain('[prumo:VAULT-TOKEN]')
  expect(JSON.stringify(stored.message)).not.toContain(TOKEN)
})

test('linha de subagente e de tool MCP também', async ($, on) => {
  baseHooks(on)
  const sub = await $.session.append(toolRow(`t=${TOKEN}`, 'Bash', 'agent-1') as never)
  const mcp = await $.session.append(toolRow(`x ${TOKEN}`, 'mcp__wazuh__alerts') as never)
  expect(JSON.stringify(sub.message)).not.toContain(TOKEN)
  expect(JSON.stringify(mcp.message)).not.toContain(TOKEN)
})

test('Read não redige PII por omissão, mas redige segredos', async ($, on) => {
  baseHooks(on)
  const r = await $.session.append(toolRow(`a@b.pt ${TOKEN}`, 'Read') as never)
  const s = JSON.stringify(r.message)
  expect(s).toContain('a@b.pt')
  expect(s).not.toContain(TOKEN)
})

test('prompt da pessoa é redigido', async ($, on) => {
  baseHooks(on)
  on('prompt.submit', (_$, e) => ({ text: e.text }))
  const r = await $.prompt.submit({ text: `o token é ${TOKEN}` } as never)
  expect(r.text).toContain('[prumo:VAULT-TOKEN]')
})

test('Write que introduz marcadores num ficheiro existente é negado', async ($, on) => {
  mock.env(on, { HOME: '/h' })
  on('fs.read', (_$, e) => (e.path === '/p/config.yml' ? { value: 'email: real@x.pt\n' } : { deny: 'ENOENT' }))
  on('fs.stat', () => ({ deny: 'ENOENT' }))
  on('tool.call', () => ({ result: 'ok', text: 'ok' }))
  const r = await $.tool.call({ tool: 'Write', file_path: '/p/config.yml', content: 'email: [prumo:EMAIL]\n' })
  expect(r.deny).toBeDefined()
})

test('ficheiros do próprio plugin estão isentos do guarda de marcadores', async ($, on) => {
  mock.env(on, { HOME: '/h' })
  let calls = 0
  on('fs.stat', () => {
    calls += 1
    return { value: { kind: 'dir' as const, size: 0, mtimeMs: 0, isLink: false, realPath: calls === 1 ? '/real/plugin' : '/real/plugin/tests' } }
  })
  on('fs.read', () => ({ value: 'x [prumo:EMAIL]\n' }))
  on('tool.call', () => ({ result: 'ok', text: 'ok' }))
  const r = await $.tool.call({ tool: 'Edit', file_path: '/plugin/tests/x.test.ts', old_string: 'x', new_string: 'y [prumo:NIF]' })
  expect(r.deny).toBeUndefined()
})

test('Write de ficheiro novo com marcadores passa', async ($, on) => {
  mock.env(on, { HOME: '/h' })
  on('fs.read', () => ({ deny: 'ENOENT' }))
  on('fs.stat', () => ({ deny: 'ENOENT' }))
  on('tool.call', () => ({ result: 'ok', text: 'ok' }))
  const r = await $.tool.call({ tool: 'Write', file_path: '/p/README.md', content: 'marcador [prumo:EMAIL]' })
  expect(r.deny).toBeUndefined()
})

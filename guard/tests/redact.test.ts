import { test, expect, mock } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'
import { stubStart } from './start-stubs.ts'

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

// Os módulos guardam config e padrões em cache; session.start reinicia-os.
async function startWith($: Engine, on: On, files: Record<string, string>, setup?: (on: On) => void) {
  stubStart(on)
  setup?.(on)
  mock.env(on, { HOME: '/h' })
  on('fs.read', (_$, e) => (files[e.path] !== undefined ? { value: files[e.path] as string } : { deny: 'ENOENT' }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.status', () => ({ value: undefined }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/h', surface: null, isInteractive: false })
}

function writeEnv(on: On, existing: string) {
  mock.env(on, { HOME: '/h' })
  on('fs.read', () => ({ value: existing }))
  on('fs.stat', () => ({ deny: 'ENOENT' }))
  on('tool.call', () => ({ result: 'ok', text: 'ok' }))
}

test('fail-closed: se a redação falha, o resultado fica retido', async ($, on) => {
  baseHooks(on)
  const row = toolRow('x')
  ;(row.message.content[0] as { content: unknown }).content = [null, { type: 'text', text: TOKEN }]
  const stored = await $.session.append(row as never)
  const s = JSON.stringify(stored.message)
  expect(s).toContain('resultado retido')
  expect(s).not.toContain(TOKEN)
})

test('fail-closed: se a verificação de marcadores falha, a escrita é negada', async ($, on) => {
  writeEnv(on, 'a\n')
  const r = await $.tool.call({ tool: 'MultiEdit', file_path: '/p/a.md', edits: 'não é lista' } as never)
  expect(r.deny).toContain('verificação de marcadores falhou')
})

test('Write com tantos marcadores como o ficheiro existente passa', async ($, on) => {
  writeEnv(on, 'email: [prumo:EMAIL]\n')
  const r = await $.tool.call({ tool: 'Write', file_path: '/p/a.md', content: 'outro: [prumo:EMAIL]\n' })
  expect(r.deny).toBeUndefined()
})

test('Write com mais marcadores do que o ficheiro existente é negado', async ($, on) => {
  writeEnv(on, 'email: [prumo:EMAIL]\n')
  const r = await $.tool.call({ tool: 'Write', file_path: '/p/a.md', content: '[prumo:EMAIL] [prumo:NIF]\n' })
  expect(r.deny).toBeDefined()
})

test('Edit com marcador em new_string é negado', async ($, on) => {
  writeEnv(on, 'email: real@x.pt\n')
  const r = await $.tool.call({ tool: 'Edit', file_path: '/p/a.md', old_string: 'real@x.pt', new_string: '[prumo:EMAIL]' })
  expect(r.deny).toBeDefined()
})

test('MultiEdit com marcador em edits[].new_string é negado', async ($, on) => {
  writeEnv(on, 'email: real@x.pt\n')
  const r = await $.tool.call({
    tool: 'MultiEdit',
    file_path: '/p/a.md',
    edits: [{ old_string: 'a', new_string: 'b' }, { old_string: 'real@x.pt', new_string: '[prumo:EMAIL]' }],
  } as never)
  expect(r.deny).toBeDefined()
})

test('Edit sem marcador passa', async ($, on) => {
  writeEnv(on, 'email: [prumo:EMAIL]\n')
  const r = await $.tool.call({ tool: 'Edit', file_path: '/p/a.md', old_string: 'email', new_string: 'correio' })
  expect(r.deny).toBeUndefined()
})

test('redact.enabled=false no guard.json desliga a redação', async ($, on) => {
  await startWith($, on, { '/h/.prumo/guard.json': '{"redact":{"enabled":false}}' })
  const r = await $.session.append(toolRow(`VAULT_TOKEN=${TOKEN}`) as never)
  expect(JSON.stringify(r.message)).toContain(TOKEN)
})

test('redact.prompt=false deixa o prompt intacto', async ($, on) => {
  await startWith($, on, { '/h/.prumo/guard.json': '{"redact":{"prompt":false}}' }, o => o('prompt.submit', (_$, e) => ({ text: e.text })))
  const r = await $.prompt.submit({ text: `o token é ${TOKEN}` } as never)
  expect(r.text).toContain(TOKEN)
})

test('comandos e prompts meta não são redigidos', async ($, on) => {
  await startWith($, on, {}, o => o('prompt.submit', (_$, e) => ({ text: e.text })))
  const cmd = await $.prompt.submit({ text: `/x ${TOKEN}`, command: 'x' } as never)
  const meta = await $.prompt.submit({ text: `m ${TOKEN}`, isMeta: true } as never)
  expect(cmd.text).toContain(TOKEN)
  expect(meta.text).toContain(TOKEN)
})

test('door fora da lista passa sem redação', async ($, on) => {
  await startWith($, on, {})
  const row = { ...toolRow(`VAULT_TOKEN=${TOKEN}`), door: 'prompt' as const }
  const r = await $.session.append(row as never)
  expect(JSON.stringify(r.message)).toContain(TOKEN)
})

test('conteúdo tool_result em lista de blocos de texto é redigido', async ($, on) => {
  await startWith($, on, {})
  const row = toolRow('x')
  ;(row.message.content[0] as { content: unknown }).content = [{ type: 'text', text: `t=${TOKEN}` }]
  const r = await $.session.append(row as never)
  const s = JSON.stringify(r.message)
  expect(s).toContain('[prumo:VAULT-TOKEN]')
  expect(s).not.toContain(TOKEN)
})

test('resultado em string leva a NOTE e incrementa redactHits', async ($, on) => {
  const sets: unknown[] = []
  await startWith($, on, {}, o =>
    o('state.set', { plugin: 'prumo-guard', key: 'redactHits' }, (_$, e, next) => {
      sets.push((e as { value: unknown }).value)
      return next(e)
    }),
  )
  const r = await $.session.append(toolRow(`VAULT_TOKEN=${TOKEN}`) as never)
  expect(JSON.stringify(r.message)).toContain('[prumo-guard] 1 valor(es) redigido(s)')
  expect(sets).toContain(1)
})

test('padrões extra de redact.json aplicam-se e os inválidos geram toast', async ($, on) => {
  const toasts: string[] = []
  mock.env(on, { HOME: '/h' })
  on('fs.read', (_$, e) =>
    e.path === '/h/.prumo/redact.json'
      ? { value: '{"patterns":[{"name":"ORG","regex":"ORG-\\\\d{4}"},{"name":"mau","regex":"x"}]}' }
      : { deny: 'ENOENT' },
  )
  on('ui.toast', (_$, e) => {
    toasts.push((e as unknown as { text?: string; message?: string }).text ?? (e as unknown as { message?: string }).message ?? '')
    return { value: undefined }
  })
  on('ui.status', () => ({ value: undefined }))
  stubStart(on)
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/h', surface: null, isInteractive: false })
  const r = await $.session.append(toolRow(' ref ORG-1234') as never)
  expect(JSON.stringify(r.message)).toContain('[prumo:ORG]')
  expect(toasts.join(' ')).toContain('1 padrão(ões) inválido(s)')
})

async function startWithRedactJson($: Engine, on: On, text: string, toasts: string[]) {
  mock.env(on, { HOME: '/h' })
  on('fs.read', (_$, e) => (e.path === '/h/.prumo/redact.json' ? { value: text } : { deny: 'ENOENT' }))
  on('fs.exists', (_$, e) => ({ value: e.path === '/h/.prumo/redact.json' }))
  on('ui.toast', (_$, e) => { toasts.push(e.text); return { value: undefined } })
  on('ui.status', () => ({ value: undefined }))
  stubStart(on)
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/h', surface: null, isInteractive: false })
}

test('redact.json com JSON inválido avisa que os padrões da organização ficaram desligados', async ($, on) => {
  const toasts: string[] = []
  await startWithRedactJson($, on, '{"patterns":[{"name":"ORG","regex":"ORG-\\\\d{4}"}],}', toasts)
  const r = await $.session.append(toolRow(` ref ${TOKEN}`) as never)
  expect(JSON.stringify(r.message)).toContain('[prumo:VAULT-TOKEN]')
  expect(toasts.join(' ')).toContain('redact.json inválido — padrões da organização desligados')
})

test('redact.json sem lista em patterns também avisa', async ($, on) => {
  const toasts: string[] = []
  await startWithRedactJson($, on, '{"patterns":{"name":"ORG"}}', toasts)
  await $.session.append(toolRow('x') as never)
  expect(toasts.join(' ')).toContain('redact.json inválido')
})

test('redact.json ausente não avisa', async ($, on) => {
  const toasts: string[] = []
  mock.env(on, { HOME: '/h' })
  on('fs.read', () => ({ deny: 'ENOENT' }))
  on('fs.exists', () => ({ value: false }))
  on('ui.toast', (_$, e) => { toasts.push(e.text); return { value: undefined } })
  await $.session.append(toolRow('x') as never)
  expect(toasts).toEqual([])
})

test('session.append: um marcador com ref que nenhuma captura desta sessão emitiu é texto normal (o eco legítimo está em capture.test.ts)', async ($, on) => {
  baseHooks(on)
  const m = '[prumo:SEGREDO→secret/inbox/proj/20261029-162526-105#value]'
  const r = await $.session.append(toolRow('guardado em ' + m + ' ok', 'Bash') as never)
  expect(JSON.stringify(r.message)).not.toContain(m)
})

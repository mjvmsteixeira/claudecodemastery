import { test, expect, mock } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'
import { cmd } from './start-stubs.ts'

const TOKEN = 'hvs.' + 'A'.repeat(24)
const TOKEN2 = 'hvs.' + 'B'.repeat(24)
const WRITER = '/h/.claude/plugins/cache/prumo/prumo-base/1.1.0/lib/vault-write-field.sh'
const RAN = (exitCode: number) => ({ value: { exitCode, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })

type Opts = { files?: Record<string, string>; writer?: boolean; exit?: number | ((n: number) => number); broken?: true }

async function setup($: Engine, on: On, o: Opts = {}) {
  const st = { runs: [] as { argv: string[]; stdin?: string }[], toasts: [] as string[], args: '' }
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('tool.register', () => ({ value: { tool: 'x' } }))
  on('session.id', () => ({ value: 'sid-test' }))
  on('clock.every', () => ({ deny: 'sem relógio no teste' }))
  on('fs.write', () => ({ value: undefined }))
  mock.env(on, { HOME: '/h' })
  const files = o.files ?? {}
  on('fs.read', (_$, e) => (files[e.path] !== undefined ? { value: files[e.path] as string } : { deny: 'ENOENT' }))
  on('fs.list', () => ({ value: [{ name: '1.1.0', kind: 'dir' as const, size: 0, mtimeMs: 0, isLink: false }] }))
  on('fs.exists', (_$, e) => ({ value: e.path === WRITER && o.writer !== false }))
  on('clock.now', () => ({ value: 1_000_000 }))
  on('session.cwd', () => (o.broken ? { deny: 'boom' } : { value: '/p/meu projeto' }))
  on('ui.toast', (_$, e) => { st.toasts.push(e.text); return { value: undefined } })
  on('ui.status', () => ({ value: undefined }))
  on('process.run', (_$, e) => {
    if (e.argv[1] !== WRITER) return RAN(0)
    if (o.broken) return { deny: 'boom' }
    st.runs.push({ argv: [...e.argv], stdin: e.init?.stdin })
    const n = st.runs.length
    return RAN(typeof o.exit === 'function' ? o.exit(n) : (o.exit ?? 0))
  })
  on('prompt.submit', (_$, e) => ({ text: e.text, context: e.context }))
  on('command.run', (_$, e) => { st.args = e.args; return { text: 'ok' } })
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/h', surface: null, isInteractive: false })
  return st
}

const sub = (text: string) => ({ text }) as never

test('captura: grava por stdin, referência no texto, contexto, sem valor em argv/toast/contexto', async ($, on) => {
  const st = await setup($, on)
  const r = await $.prompt.submit(sub(`o token é ${TOKEN}`))
  expect(st.runs).toHaveLength(1)
  expect(st.runs[0]!.stdin).toBe(TOKEN)
  expect(st.runs[0]!.argv.join(' ')).not.toContain(TOKEN)
  expect(st.runs[0]!.argv.slice(0, 2)).toEqual(['bash', WRITER])
  expect(st.runs[0]!.argv[3]).toBe('value')
  expect(st.runs[0]!.argv[2]).toMatch(/^secret\/inbox\/meu-projeto\/[A-Za-z0-9._/-]+$/)
  expect(r.text).toContain('→secret/inbox/meu-projeto/')
  expect(r.text).toContain('#value]')
  expect(r.text).not.toContain(TOKEN)
  expect(r.context).toHaveLength(1)
  expect(r.context![0]).toContain('1 segredo(s)')
  expect(r.context![0]).not.toContain(TOKEN)
  expect(st.toasts).toEqual(['prumo-guard: 1 segredo(s) guardado(s) em secret/inbox/meu-projeto/ e redigido(s)'])
})

test('falha de gravação: marcador simples, toast de falha, contexto diz que não foi guardado', async ($, on) => {
  const st = await setup($, on, { exit: 1 })
  const r = await $.prompt.submit(sub(`o token é ${TOKEN}`))
  expect(r.text).toContain('[prumo:VAULT-TOKEN]')
  expect(r.text).not.toContain(TOKEN)
  expect(st.toasts.join('\n')).toContain('1 segredo(s) redigido(s) mas não guardado(s) no Vault (')
  expect(st.toasts.join('\n')).not.toContain(TOKEN)
  expect(r.context![0]).toContain('não foram guardados')
  expect(r.context![0]).toContain('vault kv patch')
})

test('escritor ausente: redação simples e toast uma só vez por sessão', async ($, on) => {
  const st = await setup($, on, { writer: false })
  const a = await $.prompt.submit(sub(`a ${TOKEN}`))
  await $.prompt.submit(sub(`b ${TOKEN2}`))
  expect(a.text).toContain('[prumo:VAULT-TOKEN]')
  expect(st.runs).toHaveLength(0)
  expect(st.toasts.filter(t => t.includes('instala o prumo-base 1.1.0 ou superior'))).toHaveLength(1)
})

test('o mesmo valor reaproveita a referência', async ($, on) => {
  const st = await setup($, on)
  const a = await $.prompt.submit(sub(`a ${TOKEN}`))
  const b = await $.prompt.submit(sub(`b ${TOKEN}`))
  expect(st.runs).toHaveLength(1)
  expect(a.text.match(/→([^\]]+)\]/)![1]).toBe(b.text.match(/→([^\]]+)\]/)![1])
})

test('no máximo 10 gravações por prompt; os seguintes ficam só redigidos', async ($, on) => {
  const st = await setup($, on)
  const toks = Array.from({ length: 12 }, (_, i) => 'hvs.' + String.fromCharCode(65 + i).repeat(24))
  const r = await $.prompt.submit(sub(toks.join(' ')))
  expect(st.runs).toHaveLength(10)
  expect(r.text.match(/→/g)).toHaveLength(10)
  expect(r.text.match(/\[prumo:VAULT-TOKEN\]/g)).toHaveLength(2)
  for (const t of toks) expect(r.text).not.toContain(t)
})

test('PII não é gravada', async ($, on) => {
  const st = await setup($, on)
  const r = await $.prompt.submit(sub('escreve a ana@exemplo.pt'))
  expect(st.runs).toHaveLength(0)
  expect(r.text).toContain('[prumo:EMAIL]')
  expect(r.context).toBeUndefined()
})

test('capture:false redige sem gravar', async ($, on) => {
  const st = await setup($, on, { files: { '/h/.prumo/guard.json': '{"redact":{"capture":false}}' } })
  const r = await $.prompt.submit(sub(`o token é ${TOKEN}`))
  expect(st.runs).toHaveLength(0)
  expect(r.text).toContain('[prumo:VAULT-TOKEN]')
  expect(r.context).toBeUndefined()
})

test('falha na redação do prompt: drop (fail-closed)', async ($, on) => {
  await setup($, on, { broken: true })
  const r = await $.prompt.submit(sub(`o token é ${TOKEN}`))
  expect(r.drop).toContain('o prompt não foi enviado')
})

test('command.run: segredo nos args é gravado e reescrito', async ($, on) => {
  const st = await setup($, on)
  await $.command.run(cmd('deploy', `--key ${TOKEN}`))
  expect(st.runs).toHaveLength(1)
  expect(st.runs[0]!.stdin).toBe(TOKEN)
  expect(st.args).toContain('→secret/inbox/meu-projeto/')
  expect(st.args).not.toContain(TOKEN)
})

test('command.run de prumo-guard não é tocado', async ($, on) => {
  const st = await setup($, on)
  await $.command.run(cmd('prumo-guard-mode', TOKEN))
  expect(st.runs).toHaveLength(0)
})

import { test, expect, mock } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'
import { cmd } from './start-stubs.ts'

const TOKEN = 'hvs.' + 'A'.repeat(24)
const TOKEN2 = 'hvs.' + 'B'.repeat(24)
const WRITER = '/h/.claude/plugins/cache/prumo/prumo-base/1.1.0/lib/vault-write-field.sh'
const RAN = (exitCode: number) => ({ value: { exitCode, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })

type Opts = { files?: Record<string, string>; writer?: boolean; exit?: number | ((n: number) => number); broken?: true; cwd?: string; tick?: number }

async function setup($: Engine, on: On, o: Opts = {}) {
  const st = { runs: [] as { argv: string[]; stdin?: string; timeoutMs?: number }[], elapsed: 0, toasts: [] as string[], args: '' }
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
  on('clock.now', () => ({ value: 1_000_000 + st.elapsed }))
  on('session.cwd', () => (o.broken ? { deny: 'boom' } : { value: o.cwd ?? '/p/meu projeto' }))
  on('ui.toast', (_$, e) => { st.toasts.push(e.text); return { value: undefined } })
  on('ui.status', () => ({ value: undefined }))
  on('process.run', (_$, e) => {
    if (e.argv[1] !== WRITER) return RAN(0)
    if (o.broken) return { deny: 'boom' }
    st.runs.push({ argv: [...e.argv], stdin: e.init?.stdin, timeoutMs: e.init?.timeoutMs })
    st.elapsed += o.tick ?? 0
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
  expect(st.runs[0]!.argv[2]).toMatch(/^secret\/inbox\/meu-projeto\/\d{8}-\d{6}-\d+$/)
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
  expect(st.toasts).toEqual(['prumo-guard: 1 segredo(s) guardado(s) em secret/inbox/meu-projeto/ e redigido(s)'])
})

test('command.run de prumo-guard não é tocado: nada gravado, args intactos, sem toast', async ($, on) => {
  const st = await setup($, on)
  await $.command.run(cmd('prumo-guard-mode', TOKEN))
  await $.command.run(cmd('prumo-guard-outro', TOKEN))
  expect(st.runs).toHaveLength(0)
  expect(st.args).toBe(TOKEN)
  expect(st.toasts).toEqual([])
})

const pathOf = (st: { runs: { argv: string[] }[] }, i: number) => st.runs[i]!.argv[2]!

test('projeto: maiúsculas, ponto e sublinhado viram -; vazio ou símbolos -> sessao; id com contador da sessão', async ($, on) => {
  const st = await setup($, on, { cwd: '/x/MyApp_v2.0' })
  await $.prompt.submit(sub(`a ${TOKEN}`))
  await $.prompt.submit(sub(`b ${TOKEN2}`))
  expect(pathOf(st, 0)).toMatch(/^secret\/inbox\/myapp-v2-0\/\d{8}-\d{6}-1$/)
  expect(pathOf(st, 1)).toMatch(/-2$/)
})

test('cwd só com símbolos usa sessao', async ($, on) => {
  const st = await setup($, on, { cwd: '/x/___' })
  await $.prompt.submit(sub(`a ${TOKEN}`))
  expect(pathOf(st, 0)).toMatch(/^secret\/inbox\/sessao\/\d{8}-\d{6}-1$/)
})

test('cwd vazio usa sessao', async ($, on) => {
  const st = await setup($, on, { cwd: '/' })
  await $.prompt.submit(sub(`a ${TOKEN}`))
  expect(pathOf(st, 0)).toMatch(/^secret\/inbox\/sessao\//)
})

test('sem escritor, o segundo prompt continua a dar o toast genérico de redação', async ($, on) => {
  const st = await setup($, on, { writer: false })
  await $.prompt.submit(sub(`a ${TOKEN}`))
  st.toasts.length = 0
  await $.prompt.submit(sub(`b ${TOKEN2}`))
  expect(st.toasts).toEqual(['prumo-guard: 1 valor(es) redigido(s) no prompt (VAULT-TOKEN)'])
})

test('PII ao lado de segredo gravado também dá toast', async ($, on) => {
  const st = await setup($, on)
  await $.prompt.submit(sub(`${TOKEN} e ana@exemplo.pt`))
  expect(st.toasts).toHaveLength(2)
  expect(st.toasts[0]).toContain('1 segredo(s) guardado(s)')
  expect(st.toasts[1]).toContain('1 valor(es) redigido(s) no prompt (EMAIL)')
})

test('misto: uma gravação OK e outra falhada no mesmo prompt', async ($, on) => {
  const st = await setup($, on, { exit: n => (n === 1 ? 0 : 1) })
  const r = await $.prompt.submit(sub(`a ${TOKEN} b ${TOKEN2}`))
  expect(r.text.match(/→/g)).toHaveLength(1)
  expect(r.text).toContain('[prumo:VAULT-TOKEN]')
  expect(st.toasts[0]).toContain('1 segredo(s) guardado(s)')
  expect(st.toasts[1]).toContain('1 segredo(s) redigido(s) mas não guardado(s)')
  expect(r.context![0]).toContain('1 segredo(s) não foram guardados')
})

test('acima do limite entra no toast; referência reaproveitada não conta como guardada', async ($, on) => {
  const st = await setup($, on)
  const toks = Array.from({ length: 12 }, (_, i) => 'hvs.' + String.fromCharCode(65 + i).repeat(24))
  await $.prompt.submit(sub(toks.join(' ')))
  expect(st.toasts).toContain('prumo-guard: 2 segredo(s) não guardado(s): limite de 10 por prompt')
  expect(st.toasts[0]).toContain('10 segredo(s) guardado(s)')
  st.toasts.length = 0
  await $.prompt.submit(sub(`outra vez ${toks[0]}`))
  expect(st.toasts[0]).toContain('0 segredo(s) guardado(s)')
  expect(st.toasts[0]).toContain('1 já guardado(s)')
})

const toksN = (n: number) => Array.from({ length: n }, (_, i) => 'hvs.' + String.fromCharCode(65 + i).repeat(24))

test('orçamento: cada gravação recebe o tempo que resta (mínimo 1 s) e esgotado o resto fica só redigido', async ($, on) => {
  const st = await setup($, on, { tick: 4000 })
  const toks = toksN(5)
  const r = await $.prompt.submit(sub(toks.join(' ')))
  expect(st.runs.map(x => x.timeoutMs)).toEqual([10000, 6000, 2000])
  expect(r.text.match(/→/g)).toHaveLength(3)
  expect(r.text.match(/\[prumo:VAULT-TOKEN\]/g)).toHaveLength(2)
  expect(st.toasts).toContain('prumo-guard: 2 segredo(s) redigido(s) mas não guardado(s) no Vault (orçamento de tempo esgotado)')
  expect(r.context![0]).toContain('2 segredo(s) não foram guardados')
  for (const t of toks) expect(r.text).not.toContain(t)
})

test('orçamento: timeout mínimo de 1 s quando resta menos', async ($, on) => {
  const st = await setup($, on, { tick: 9500 })
  await $.prompt.submit(sub(toksN(3).join(' ')))
  expect(st.runs.map(x => x.timeoutMs)).toEqual([10000, 1000])
})

test('primeira falha pára o ciclo: os restantes ficam redigidos sem referência e sem tentativa', async ($, on) => {
  const st = await setup($, on, { exit: 1 })
  const toks = toksN(4)
  const r = await $.prompt.submit(sub(toks.join(' ')))
  expect(st.runs).toHaveLength(1)
  expect(r.text).not.toContain('→')
  expect(r.text.match(/\[prumo:VAULT-TOKEN\]/g)).toHaveLength(4)
  expect(st.toasts.filter(t => t.includes('não guardado(s) no Vault (Vault inacessível'))).toEqual([
    'prumo-guard: 4 segredo(s) redigido(s) mas não guardado(s) no Vault (Vault inacessível ou sem permissão)',
  ])
  for (const t of toks) expect(r.text).not.toContain(t)
})

const OFF = 'prumo-guard: captura para o Vault desligada nesta sessão após 3 falhas seguidas; /prumo-guard mostra o estado'

test('3 prompts seguidos com falha desligam a captura (toast uma vez); a redação continua', async ($, on) => {
  const st = await setup($, on, { exit: 1 })
  const toks = toksN(6)
  for (let i = 0; i < 3; i++) await $.prompt.submit(sub(`a ${toks[i]}`))
  expect(st.runs).toHaveLength(3)
  expect(st.toasts.filter(t => t === OFF)).toHaveLength(1)
  const r = await $.prompt.submit(sub(`d ${toks[3]}`))
  expect(st.runs).toHaveLength(3)
  expect(r.text).toContain('[prumo:VAULT-TOKEN]')
  expect(r.text).not.toContain(toks[3]!)
  expect(r.context).toBeUndefined()
  expect(st.toasts.filter(t => t === OFF)).toHaveLength(1)
  const status = await $.command.run(cmd('prumo-guard'))
  expect(status.text).toContain('captura para o Vault: desligada nesta sessão')
})

test('um prompt com sucesso repõe a contagem de falhas', async ($, on) => {
  const st = await setup($, on, { exit: n => (n === 3 ? 0 : 1) })
  const toks = toksN(6)
  for (let i = 0; i < 5; i++) await $.prompt.submit(sub(`a ${toks[i]}`))
  expect(st.runs).toHaveLength(5)
  expect(st.toasts).not.toContain(OFF)
})

test('nova sessão repõe a captura', async ($, on) => {
  const st = await setup($, on, { exit: n => (n <= 3 ? 1 : 0) })
  const toks = toksN(6)
  for (let i = 0; i < 3; i++) await $.prompt.submit(sub(`a ${toks[i]}`))
  await $.session.start({ cwd: '/h', surface: null, isInteractive: false })
  const status = await $.command.run(cmd('prumo-guard'))
  expect(status.text).toContain('captura para o Vault: ligada')
  const r = await $.prompt.submit(sub(`e ${toks[4]}`))
  expect(r.text).toContain('→')
})

test('contexto: não manda pedir o valor nem usar run_with_secret; aponta para /vault-set', async ($, on) => {
  await setup($, on)
  const r = await $.prompt.submit(sub(`o token é ${TOKEN}`))
  expect(r.context![0]).not.toContain('run_with_secret')
  expect(r.context![0]).toContain('Não peças o valor')
  expect(r.context![0]).toContain('/vault-set')
})

// O session.append não passa `refs`: só reconhece as refs que o capture registou nesta sessão.
test('eco no session.append: a ref gravada fica intacta com PII ligada; noutra sessão volta a ser texto normal', async ($, on) => {
  const nif = '2' + '45678905'
  await setup($, on, { cwd: '/p/' + nif })
  const r = await $.prompt.submit(sub(`o token é ${TOKEN}`))
  const arrow = r.text.indexOf('→')
  const marker = r.text.slice(r.text.lastIndexOf('[', arrow), r.text.indexOf(']', arrow) + 1)
  expect(marker).toContain('/' + nif + '/')
  const row = (text: string) =>
    ({
      door: 'tool-result',
      origin: { kind: 'tool', tool: 'Bash' },
      uuid: 'u1',
      message: { type: 'user', role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: text }] },
    }) as never
  const echo = await $.session.append(row('eco ' + marker))
  expect(JSON.stringify(echo.message)).toContain(marker)
  await $.session.start({ cwd: '/h', surface: null, isInteractive: false })
  const later = await $.session.append(row('eco ' + marker))
  expect(JSON.stringify(later.message)).not.toContain(nif)
})

import { test, expect, mock } from 'claude-code/testing'
import { parseModeArg, parseOnOff } from '../hooks/commands.ts'
import type { On } from 'claude-code'
import { cmd, stubStart } from './start-stubs.ts'

function env(on: On, vars: Record<string, string> = { HOME: '/h' }) {
  mock.env(on, vars)
  on('fs.read', () => ({ deny: 'ENOENT' }))
  on('fs.stat', () => ({ deny: 'ENOENT' }))
}

test('mudar o modo exige a tecla Enter da pessoa', async ($, on) => {
  const writes: string[] = []
  env(on)
  on('fs.write', (_$, e) => { writes.push(e.path); return { value: undefined } })
  const r = await $.command.run(cmd('prumo-guard-mode', 'lab'))
  expect(r.text).toContain('só aceita')
  expect(writes.length).toBe(0)
})

test('/prumo-guard-redact off por um plugin é recusado e a redação não muda', async ($, on) => {
  const sets: string[] = []
  env(on)
  on('state.set', { plugin: 'prumo-guard', key: 'redactOn' }, (_$, e, next) => { sets.push(String(e.value)); return next(e) })
  const r = await $.command.run(cmd('prumo-guard-redact', 'off'))
  expect(r.text).toContain('só aceita')
  expect(sets.length).toBe(0)
})

test('pela pessoa, /prumo-guard-mode dev escreve o ficheiro de modo e atualiza o estado', async ($, on) => {
  const writes: Array<{ path: string; text: string }> = []
  let status = ''
  env(on)
  on('fs.write', (_$, e) => { writes.push({ path: e.path, text: e.text }); return { value: undefined } })
  on('process.run', () => ({ value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('ui.status', (_$, e) => { status = e.text ?? ''; return { value: undefined } })
  const r = await $.command.run(cmd('prumo-guard-mode', 'dev', { kind: 'composer' }))
  expect(r.text).toContain('Modo prumo: dev')
  expect(writes).toEqual([{ path: '/h/.prumo/mode', text: 'dev\n' }])
  expect(status).toContain('prumo prod')
})

test('pela pessoa, lab cria o marker', async ($, on) => {
  const writes: string[] = []
  env(on)
  on('fs.write', (_$, e) => { writes.push(e.path); return { value: undefined } })
  on('ui.status', () => ({ value: undefined }))
  await $.command.run(cmd('prumo-guard-mode', 'lab', { kind: 'composer' }))
  expect(writes).toEqual(['/h/.prumo/mode', '/h/.prumo/lab-mode'])
})

test('pela pessoa, /prumo-guard-redact off desliga a redação', async ($, on) => {
  const sets: unknown[] = []
  env(on)
  on('state.set', { plugin: 'prumo-guard', key: 'redactOn' }, (_$, e, next) => { sets.push(e.value); return next(e) })
  on('ui.status', () => ({ value: undefined }))
  const r = await $.command.run(cmd('prumo-guard-redact', 'off', { kind: 'composer' }))
  expect(r.text).toContain('RGPD off')
  expect(sets).toEqual([false])
})

test('argumentos dos comandos humanos', () => {
  expect(parseModeArg(' lab ')).toBe('lab')
  expect(parseModeArg('dev')).toBe('dev')
  expect(parseModeArg('root')).toBe(null)
  expect(parseModeArg('')).toBe(null)
  expect(parseOnOff('off')).toBe(false)
  expect(parseOnOff(' on')).toBe(true)
  expect(parseOnOff('talvez')).toBe(null)
})

test('/prumo-guard mostra modo, redação e configuração', async ($, on) => {
  env(on, { HOME: '/h', PRUMO_OPERATING_MODE: 'dev' })
  const r = await $.command.run(cmd('prumo-guard'))
  expect(r.text).toContain('modo: dev')
  expect(r.text).toContain('RGPD: on')
  expect(r.text).toContain('/h/.prumo/guard.json')
})

test('lab sem o marker degrada para prod', async ($, on) => {
  env(on, { HOME: '/h', PRUMO_OPERATING_MODE: 'lab' })
  const r = await $.command.run(cmd('prumo-guard'))
  expect(r.text).toContain('modo: prod')
})

test('lab com o marker é lab; o modo do ficheiro vale sem variável', async ($, on) => {
  mock.env(on, { HOME: '/h' })
  on('fs.read', (_$, e) => (e.path === '/h/.prumo/mode' ? { value: 'lab\n' } : { deny: 'ENOENT' }))
  on('fs.stat', (_$, e) => (e.path === '/h/.prumo/lab-mode' ? { value: { isFile: true } as never } : { deny: 'ENOENT' }))
  const r = await $.command.run(cmd('prumo-guard'))
  expect(r.text).toContain('modo: lab')
})

test('/prumo-guard-approvals abre o painel', async ($, on) => {
  const opened: string[] = []
  on('ui.open', (_$, e) => { opened.push(e.id); return { value: { isPlaced: true } } })
  const r = await $.command.run(cmd('prumo-guard-approvals'))
  expect(opened).toEqual(['prumo-guard-approval'])
  expect(r.text).toContain('aberto')
})

test('o arranque regista os comandos e a linha de estado inclui o modo e a redação', async ($, on) => {
  const seen = { commands: [] as string[] }
  let status = ''
  stubStart(on, seen)
  mock.env(on, { HOME: '/h' })
  on('fs.read', () => ({ deny: 'ENOENT' }))
  on('fs.stat', () => ({ deny: 'ENOENT' }))
  on('ui.status', (_$, e) => { status = e.text ?? ''; return { value: undefined } })
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/h', surface: null, isInteractive: false })
  expect(seen.commands).toContain('prumo-guard-mode')
  expect(seen.commands).toContain('prumo-guard-approvals')
  expect(status).toBe('prumo prod · RGPD on')
})

test('/prumo-guard mostra o aviso de um redact.json inválido', async ($, on) => {
  mock.env(on, { HOME: '/h' })
  on('fs.read', (_$, e) => (e.path === '/h/.prumo/redact.json' ? { value: '{"patterns":[],' } : { deny: 'ENOENT' }))
  on('fs.exists', (_$, e) => ({ value: e.path === '/h/.prumo/redact.json' }))
  on('fs.stat', () => ({ deny: 'ENOENT' }))
  on('ui.toast', () => ({ value: undefined }))
  const r = await $.command.run(cmd('prumo-guard'))
  expect(r.text).toContain('aviso: redact.json inválido — padrões da organização desligados')
})

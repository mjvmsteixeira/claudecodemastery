import { test, expect, mock } from 'claude-code/testing'
import type { On } from 'claude-code'
import { BRAKE_DENY_PREFIX, recordRalph } from '../hooks/brake.ts'
import { BRAKE_DEFAULT } from '../hooks/refs.ts'
import { cmd } from './start-stubs.ts'

const RALPH = '---\niteration: 3\nmax_iterations: 20\n---\nx'
const RALPH7 = '---\niteration: 7\nmax_iterations: 20\n---\nx'
const ACTIVE = '/p/.claude/ralph-loop.local.md'
const PAUSED = `${ACTIVE}.paused`
const CFG_USD = '{"brake":{"enabled":true,"usdBudget":1}}'
const BAND = { plugin: 'prumo-guard', surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 8, bodyColumns: 80, scroll: { offset: 0, bodyRows: 8 }, view: {} } } as const
const RAN = { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false }

type Seen = { brake: Array<{ paused: boolean; reason: string | null; loopStartUsd: number | null; tokens: number; ralph: 'suspended' | 'failed' | 'other' | 'none' | null }>; repeat: unknown[]; toasts: string[]; notified: string[]; aborted: string[]; status: string; runs: string[][] }

function base(on: On, files: Record<string, string> = {}, opts: { abortFails?: boolean; clockFails?: boolean; mvFails?: boolean; rmFails?: boolean; cwdFails?: boolean; idFails?: boolean } = {}): Seen {
  const abortFails = opts.abortFails ?? false
  const seen: Seen = { brake: [], repeat: [], toasts: [], notified: [], aborted: [], status: '', runs: [] }
  mock.env(on, { HOME: '/h' })
  on('session.cwd', () => (opts.cwdFails ? { deny: 'sem cwd' } : { value: '/p' }))
  on('clock.now', () => (opts.clockFails ? { deny: 'relógio indisponível' } : { value: 1_000 }))
  on('clock.every', () => ({ deny: 'sem relógio no teste' }))
  on('session.id', () => (opts.idFails ? { deny: 'sem id' } : { value: 's' }))
  on('fs.read', (_$, e) => (files[e.path] !== undefined ? { value: files[e.path] as string } : { deny: 'ENOENT' }))
  on('fs.stat', () => ({ deny: 'ENOENT' }))
  on('fs.list', (_$, e) => {
    const dir = `${e.path.replace(/\/$/, '')}/`
    return { value: Object.keys(files).filter(f => f.startsWith(dir) && !f.slice(dir.length).includes('/')).map(f => ({ name: f.slice(dir.length), kind: 'file' as const })) as never }
  })
  on('ui.status', (_$, e) => { seen.status = e.text ?? ''; return { value: undefined } })
  on('ui.toast', (_$, e) => { seen.toasts.push(e.text); return { value: undefined } })
  on('ui.notify', (_$, e) => { seen.notified.push(String(e.text)); return { value: { isSent: true, channel: 'terminal_bell' } } })
  on('turn.abort', (_$, e) => { if (abortFails) return { deny: 'reentrada' }; seen.aborted.push(e.turnId); return { value: undefined } })
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('process.run', (_$, e) => {
    seen.runs.push([...e.argv])
    const [cmdName, ...args] = e.argv
    if (cmdName === 'mv') {
      if (opts.mvFails) return { value: { ...RAN, exitCode: 1, stderr: 'Permission denied' } }
      const [src, dst] = args.filter(a => a !== '-n') as [string, string]
      if (files[src] !== undefined && files[dst] === undefined) { files[dst] = files[src] as string; delete files[src] }
    }
    if (cmdName === 'rm' && opts.rmFails) return { value: { ...RAN, exitCode: 1, stderr: 'Permission denied' } }
    if (cmdName === 'rm') for (const f of args.filter(a => a !== '-f')) delete files[f]
    return { value: RAN }
  })
  on('state.set', { plugin: 'prumo-guard', key: 'brake' }, (_$, e, next) => { seen.brake.push(e.value as Seen['brake'][number]); return next(e) })
  on('state.set', { plugin: 'prumo-guard', key: 'repeat' }, (_$, e, next) => { seen.repeat.push(e.value); return next(e) })
  return seen
}

const last = (s: Seen) => s.brake[s.brake.length - 1]
const measure = ($: { session: { measure: (e: never) => Promise<unknown> } }, usd: number) =>
  $.session.measure({ context: { window: 200000 }, rateLimits: [], cost: { usd }, changed: ['cost'] } as never)

test('passar 120% do orçamento em USD pausa, avisa e aborta o turno em curso', async ($, on) => {
  const seen = base(on, { '/h/.prumo/guard.json': '{"brake":{"enabled":true,"usdBudget":1}}' })
  await $.turn.start({ text: 'x', turnId: 't1' })
  await measure($, 1.5)
  expect(last(seen)?.paused).toBe(true)
  expect(last(seen)?.reason).toContain('orçamento')
  expect(seen.toasts.join(' ')).toContain('/prumo-guard-resume')
  expect(seen.notified.join(' ')).toContain('em pausa')
  expect(seen.aborted).toEqual(['t1'])
  expect(seen.status).toContain('pausa')
})

test('o orçamento conta desde o início do loop', async ($, on) => {
  const seen = base(on, { '/h/.prumo/guard.json': '{"brake":{"enabled":true,"usdBudget":5}}', '/p/.claude/ralph-loop.local.md': RALPH })
  await measure($, 3)
  await $.turn.start({ text: 'x', turnId: 't1' })
  expect(last(seen)?.loopStartUsd).toBe(3)
  await measure($, 7.9)
  expect(last(seen)?.paused).toBe(false)
  await measure($, 8.2)
  expect(last(seen)?.paused).toBe(true)
})

test('orçamento 0 desliga o travão de USD', async ($, on) => {
  const seen = base(on, { '/h/.prumo/guard.json': '{"brake":{"enabled":true,"usdBudget":0}}' })
  await measure($, 500)
  expect(seen.brake.some(b => b.paused)).toBe(false)
})

test('passar o orçamento de tokens pausa', async ($, on) => {
  const seen = base(on, { '/h/.prumo/guard.json': '{"brake":{"enabled":true,"tokenBudget":100}}' })
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer', usage: { model: 'm', input_tokens: 60, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } } as never)
  expect(last(seen)?.paused).toBe(true)
  expect(last(seen)?.reason).toContain('tokens')
})

test('a mesma chamada com o mesmo resultado pausa ao fim do limite', async ($, on) => {
  const seen = base(on, { '/h/.prumo/guard.json': '{"brake":{"enabled":true,"repeatLimit":3}}' })
  on('tool.call', () => ({ result: '', text: 'igual' }))
  for (let i = 0; i < 2; i++) await $.tool.call({ tool: 'Bash', command: 'ls' })
  expect(seen.brake.some(b => b.paused)).toBe(false)
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  expect(last(seen)?.paused).toBe(true)
  expect(last(seen)?.reason).toContain('3 vezes')
})

test('o mesmo teste a falhar pausa', async ($, on) => {
  const seen = base(on, { '/h/.prumo/guard.json': '{"brake":{"enabled":true,"repeatLimit":3}}' })
  let n = 0
  on('tool.call', () => ({ result: '', text: `run ${n++}\n3 examples, 1 failure\nFailure: boom` }))
  for (let i = 0; i < 3; i++) await $.tool.call({ tool: 'Bash', command: 'bundle exec rspec' })
  expect(last(seen)?.paused).toBe(true)
  expect(last(seen)?.reason).toContain('falhou')
})

test('edições que se desfazem pausam', async ($, on) => {
  const seen = base(on, { '/h/.prumo/guard.json': '{"brake":{"enabled":true}}' })
  on('tool.call', () => ({ result: '', text: 'ok' }))
  for (let i = 0; i < 3; i++) {
    await $.tool.call({ tool: 'Edit', file_path: '/p/a.rb', old_string: 'x', new_string: 'y' } as never)
    await $.tool.call({ tool: 'Edit', file_path: '/p/a.rb', old_string: 'y', new_string: 'x' } as never)
  }
  expect(last(seen)?.paused).toBe(true)
  expect(last(seen)?.reason).toContain('desfizeram')
})

test('se o motor recusar o abort a pausa fica na mesma', async ($, on) => {
  const seen = base(on, { '/h/.prumo/guard.json': '{"brake":{"enabled":true,"usdBudget":1}}' }, { abortFails: true })
  await $.turn.start({ text: 'x', turnId: 't1' })
  await measure($, 2)
  expect(last(seen)?.paused).toBe(true)
})

test('/prumo-guard-resume pela pessoa rearma o travão e recomeça a contagem', async ($, on) => {
  const seen = base(on, { '/h/.prumo/guard.json': '{"brake":{"enabled":true,"usdBudget":1}}' })
  await measure($, 1.5)
  const r = await $.command.run(cmd('prumo-guard-resume', '', { kind: 'composer' }))
  expect(r.text).toContain('rearmado')
  expect(last(seen)).toEqual({ paused: false, reason: null, loopStartUsd: 1.5, tokens: 0, ralph: null })
  expect(seen.repeat.length).toBeGreaterThan(0)
})

test('resume sem ralph: o turn.start seguinte não anula a base e o travão não volta a disparar', async ($, on) => {
  const seen = base(on, { '/h/.prumo/guard.json': '{"brake":{"enabled":true,"usdBudget":1}}' })
  await measure($, 1.5)
  await $.command.run(cmd('prumo-guard-resume', '', { kind: 'composer' }))
  await $.turn.start({ text: 'x', turnId: 't2' })
  expect(last(seen)?.loopStartUsd).toBe(1.5)
  await measure($, 1.6)
  expect(last(seen)?.paused).toBe(false)
})

test('/prumo-guard-resume por um plugin é recusado', async ($, on) => {
  const seen = base(on)
  const r = await $.command.run(cmd('prumo-guard-resume'))
  expect(r.text).toContain('só aceita')
  expect(seen.brake.length).toBe(0)
})

test('/prumo-guard-stop apaga o ficheiro e o .paused e não tira a pausa', async ($, on) => {
  const files: Record<string, string> = { '/h/.prumo/guard.json': CFG_USD, [ACTIVE]: RALPH, [PAUSED]: RALPH7 }
  const seen = base(on, files)
  await measure($, 1.5)
  const before = seen.brake.length
  const r = await $.command.run(cmd('prumo-guard-stop', '', { kind: 'composer' }))
  expect(files[ACTIVE]).toBeUndefined()
  expect(files[PAUSED]).toBeUndefined()
  expect(r.text).toContain('terminado')
  expect(seen.brake.length).toBe(before + 1)
  expect(last(seen)?.paused).toBe(true)
})

test('/prumo-guard-stop por um plugin é recusado', async ($, on) => {
  const seen = base(on)
  const r = await $.command.run(cmd('prumo-guard-stop'))
  expect(r.text).toContain('só aceita')
  expect(seen.runs.length).toBe(0)
})

test('a banda mostra a pausa e o motivo', async ($, on) => {
  base(on, { '/h/.prumo/guard.json': '{"brake":{"enabled":true,"usdBudget":1}}' })
  on('ui.render', { component: 'AbovePrompt' }, () => ({ type: 'Text', children: ['sem painel'] }))
  await measure($, 2)
  const ui = await $.ui.mount(BAND)
  expect(await ui.find({ text: /PAUSA  orçamento atingido \(.*\) · ferramentas recusadas/ })).toBeDefined()
  await ui.unmount()
})

// D6: a pausa só veta o re-prompt; o corte do turno é só acima de 120% do orçamento em USD.
test('entre 100% e 120% do orçamento pausa sem abortar o turno', async ($, on) => {
  const seen = base(on, { '/h/.prumo/guard.json': '{"brake":{"enabled":true,"usdBudget":1}}' })
  await $.turn.start({ text: 'x', turnId: 't1' })
  await measure($, 1.1)
  expect(last(seen)?.paused).toBe(true)
  expect(seen.aborted).toEqual([])
})

test('repetição pausa sem abortar o turno', async ($, on) => {
  const seen = base(on, { '/h/.prumo/guard.json': '{"brake":{"enabled":true,"repeatLimit":2}}' })
  on('tool.call', () => ({ result: '', text: 'igual' }))
  await $.turn.start({ text: 'x', turnId: 't1' })
  for (let i = 0; i < 2; i++) await $.tool.call({ tool: 'Bash', command: 'ls' })
  expect(last(seen)?.paused).toBe(true)
  expect(seen.aborted).toEqual([])
})

test('orçamento de tokens pausa sem abortar o turno', async ($, on) => {
  const seen = base(on, { '/h/.prumo/guard.json': '{"brake":{"enabled":true,"tokenBudget":100}}' })
  await $.turn.start({ text: 'x', turnId: 't1' })
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't0', agentId: 'sub', reason: 'answer', usage: { model: 'm', input_tokens: 60, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } } as never)
  expect(last(seen)?.paused).toBe(true)
  expect(seen.aborted).toEqual([])
})

test('já em pausa, passar 120% corta o turno corrente, uma vez', async ($, on) => {
  const seen = base(on, { '/h/.prumo/guard.json': '{"brake":{"enabled":true,"usdBudget":10}}' })
  await $.turn.start({ text: 'x', turnId: 't1' })
  await measure($, 10.5)
  expect(last(seen)?.paused).toBe(true)
  expect(seen.aborted).toEqual([])
  await $.turn.start({ text: 'y', turnId: 't2' })
  await measure($, 13)
  await measure($, 14)
  expect(seen.aborted).toEqual(['t2'])
})

test('loop_phase repetido não conta como repetição', async ($, on) => {
  const seen = base(on, { '/h/.prumo/guard.json': '{"brake":{"enabled":true,"repeatLimit":2}}' })
  for (let i = 0; i < 3; i++) await $.tool.call({ tool: 'mcp__prumo-guard__loop_phase', phase: 'testes' } as never)
  expect(seen.brake.some(b => b.paused)).toBe(false)
})

test('travão desligado por omissão: passar o orçamento não pausa nem corta o turno', async ($, on) => {
  const seen = base(on)
  await $.turn.start({ text: 'x', turnId: 't1' })
  await measure($, 41.44)
  expect(seen.brake.some(b => b.paused)).toBe(false)
  expect(seen.aborted).toEqual([])
  expect(seen.toasts.join(' ')).not.toContain('em pausa')
})

test('travão desligado por omissão: repetições e tokens não pausam', async ($, on) => {
  const seen = base(on, { '/h/.prumo/guard.json': '{"brake":{"repeatLimit":2,"tokenBudget":10}}' })
  on('tool.call', () => ({ result: '', text: 'igual' }))
  for (let i = 0; i < 5; i++) await $.tool.call({ tool: 'Bash', command: 'ls' })
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer', usage: { model: 'm', input_tokens: 60, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } } as never)
  expect(seen.brake.some(b => b.paused)).toBe(false)
})

test('enabled false explícito ignora o orçamento definido', async ($, on) => {
  const seen = base(on, { '/h/.prumo/guard.json': '{"brake":{"enabled":false,"usdBudget":1}}' })
  await $.turn.start({ text: 'x', turnId: 't1' })
  await measure($, 5)
  expect(seen.brake.some(b => b.paused)).toBe(false)
  expect(seen.aborted).toEqual([])
})

const PAUSE_CFG = '{"brake":{"enabled":true,"repeatLimit":2}}'

async function pauseByRepetition($: { tool: { call: (e: never) => Promise<unknown> } }, seen: Seen, calls: { n: number }): Promise<void> {
  for (let i = 0; i < 2; i++) await $.tool.call({ tool: 'Bash', command: 'ls' } as never)
  expect(last(seen)?.paused).toBe(true)
  calls.n = 0
}

test('em pausa, um Bash e um Read são recusados antes de correr', async ($, on) => {
  const seen = base(on, { '/h/.prumo/guard.json': PAUSE_CFG })
  const calls = { n: 0 }
  on('tool.call', () => { calls.n++; return { result: '', text: 'igual' } })
  await pauseByRepetition($, seen, calls)
  const reason = last(seen)?.reason as string
  const bash = await $.tool.call({ tool: 'Bash', command: 'ls' })
  const read = await $.tool.call({ tool: 'Read', file_path: '/p/x' } as never)
  for (const r of [bash, read]) {
    expect(r.deny).toBeDefined()
    expect(r.deny as string).toStartWith(BRAKE_DENY_PREFIX)
    expect(r.deny as string).toContain(reason)
  }
  expect(calls.n).toBe(0)
})

test('em pausa, loop_phase passa', async ($, on) => {
  const seen = base(on, { '/h/.prumo/guard.json': PAUSE_CFG })
  const calls = { n: 0 }
  on('tool.call', () => { calls.n++; return { result: '', text: 'igual' } })
  await pauseByRepetition($, seen, calls)
  const r = await $.tool.call({ tool: 'mcp__prumo-guard__loop_phase', phase: 'testes' } as never)
  expect(r.deny).toBeUndefined()
  expect(JSON.stringify(r)).not.toContain(BRAKE_DENY_PREFIX)
})

test('travão desligado não recusa mesmo com paused no estado', async ($, on) => {
  base(on, { '/h/.prumo/guard.json': '{"brake":{"enabled":false}}' })
  const calls = { n: 0 }
  on('tool.call', () => { calls.n++; return { result: '', text: 'ok' } })
  on('state.get', { plugin: 'prumo-guard', key: 'brake' }, () => ({ value: { value: { paused: true, reason: 'x', loopStartUsd: null, tokens: 0, ralph: null }, version: 1 } }))
  const r = await $.tool.call({ tool: 'Bash', command: 'ls' })
  expect(r.deny).toBeUndefined()
  expect(calls.n).toBe(1)
})

test('sem motivo, a recusa diz motivo não registado', async ($, on) => {
  base(on, { '/h/.prumo/guard.json': '{"brake":{"enabled":true}}' })
  on('tool.call', () => ({ result: '', text: 'ok' }))
  on('state.get', { plugin: 'prumo-guard', key: 'brake' }, () => ({ value: { value: { paused: true, reason: null, loopStartUsd: null, tokens: 0, ralph: null }, version: 1 } }))
  const r = await $.tool.call({ tool: 'Bash', command: 'ls' })
  expect(r.deny).toBe(`${BRAKE_DENY_PREFIX} (motivo não registado). Nenhuma ferramenta corre até a pessoa retomar com /prumo-guard-resume (ou terminar o loop com /prumo-guard-stop). Para já, explica em texto o que estavas a fazer e onde ficaste.`)
})

test('o disparo renomeia o ficheiro do ralph para .paused', async ($, on) => {
  const files: Record<string, string> = { '/h/.prumo/guard.json': CFG_USD, [ACTIVE]: RALPH7 }
  const seen = base(on, files)
  await measure($, 1.5)
  expect(files[ACTIVE]).toBeUndefined()
  expect(files[PAUSED]).toBe(RALPH7)
  expect(seen.toasts.join(' ')).toContain('loop do ralph suspenso')
  expect(seen.notified.join(' ')).toContain('loop do ralph suspenso')
})

test('o disparo sem ficheiro do ralph não diz que suspendeu nada', async ($, on) => {
  const seen = base(on, { '/h/.prumo/guard.json': CFG_USD })
  await measure($, 1.5)
  expect(seen.toasts.join(' ')).not.toContain('ralph')
  expect(seen.runs).toEqual([])
})

test('se o renomear falhar, a pausa fica e o toast diz que o loop não foi suspenso', async ($, on) => {
  const files: Record<string, string> = { '/h/.prumo/guard.json': CFG_USD, [ACTIVE]: RALPH7 }
  const seen = base(on, files, { mvFails: true })
  await measure($, 1.5)
  expect(last(seen)?.paused).toBe(true)
  expect(files[ACTIVE]).toBe(RALPH7)
  expect(seen.toasts.join(' ')).toContain('o loop do ralph não foi suspenso')
  expect(seen.toasts.join(' ')).not.toContain('loop do ralph suspenso')
})

test('/prumo-guard-resume retoma o ralph na iteração N e as ferramentas voltam a correr', async ($, on) => {
  const files: Record<string, string> = { '/h/.prumo/guard.json': PAUSE_CFG, [ACTIVE]: RALPH7 }
  const seen = base(on, files)
  const calls = { n: 0 }
  on('tool.call', () => { calls.n++; return { result: '', text: 'igual' } })
  await pauseByRepetition($, seen, calls)
  expect(files[PAUSED]).toBe(RALPH7)
  expect((await $.tool.call({ tool: 'Bash', command: 'ls' })).deny).toBeDefined()
  const r = await $.command.run(cmd('prumo-guard-resume', '', { kind: 'composer' }))
  expect(r.text).toContain('Loop do ralph retomado na iteração 7.')
  expect(files[ACTIVE]).toBe(RALPH7)
  expect(files[PAUSED]).toBeUndefined()
  const ok = await $.tool.call({ tool: 'Bash', command: 'pwd' })
  expect(ok.deny).toBeUndefined()
  expect(calls.n).toBe(1)
})

test('resume com .paused sem iteração legível', async ($, on) => {
  const files: Record<string, string> = { [PAUSED]: 'sem frontmatter' }
  base(on, files)
  const r = await $.command.run(cmd('prumo-guard-resume', '', { kind: 'composer' }))
  expect(r.text).toContain('Loop do ralph retomado.')
  expect(files[ACTIVE]).toBe('sem frontmatter')
})

test('resume sem .paused', async ($, on) => {
  base(on)
  const r = await $.command.run(cmd('prumo-guard-resume', '', { kind: 'composer' }))
  expect(r.text).toBe('Travão rearmado. Não havia loop do ralph suspenso.')
})

test('resume com o ficheiro ativo e sem .paused', async ($, on) => {
  const files: Record<string, string> = { [ACTIVE]: RALPH }
  const seen = base(on, files)
  const r = await $.command.run(cmd('prumo-guard-resume', '', { kind: 'composer' }))
  expect(r.text).toBe('Travão rearmado. O loop do ralph ativo continua.')
  expect(seen.runs).toEqual([])
})

test('resume com os dois ficheiros não toca em nenhum', async ($, on) => {
  const files: Record<string, string> = { [ACTIVE]: RALPH, [PAUSED]: RALPH7 }
  const seen = base(on, files)
  const r = await $.command.run(cmd('prumo-guard-resume', '', { kind: 'composer' }))
  expect(r.text).toContain('Travão rearmado.')
  expect(r.text).toContain('nenhum')
  expect(files[ACTIVE]).toBe(RALPH)
  expect(files[PAUSED]).toBe(RALPH7)
  expect(seen.runs).toEqual([])
})

test('no arranque, com .paused presente, aparece o toast do loop suspenso', async ($, on) => {
  const seen = base(on, { [PAUSED]: RALPH7 })
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('tool.register', () => ({ value: { tool: 'x' } }))
  on('fs.write', () => ({ value: undefined }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/p', surface: null, isInteractive: false })
  expect(seen.toasts).toContain('prumo-guard: há um loop do ralph suspenso; /prumo-guard-resume retoma-o, /prumo-guard-stop termina-o.')
})

const OWN = '---\nsession_id: s\niteration: 4\nmax_iterations: 20\n---\nx'
const OTHER = '---\nsession_id: outra\niteration: 4\nmax_iterations: 20\n---\nx'
const OTHER_TEXT = 'o loop do ralph é de outra sessão; não foi suspenso.'

test('I1: um loop com session_id igual é suspenso', async ($, on) => {
  const files: Record<string, string> = { '/h/.prumo/guard.json': CFG_USD, [ACTIVE]: OWN }
  base(on, files)
  await measure($, 1.5)
  expect(files[ACTIVE]).toBeUndefined()
  expect(files[PAUSED]).toBe(OWN)
})

test('I1: um loop com session_id diferente fica intacto e o toast e a notificação dizem porquê', async ($, on) => {
  const files: Record<string, string> = { '/h/.prumo/guard.json': CFG_USD, [ACTIVE]: OTHER }
  const seen = base(on, files)
  await measure($, 1.5)
  expect(last(seen)?.paused).toBe(true)
  expect(files[ACTIVE]).toBe(OTHER)
  expect(files[PAUSED]).toBeUndefined()
  expect(seen.toasts.join(' ')).toContain(OTHER_TEXT)
  expect(seen.notified.join(' ')).toContain(OTHER_TEXT)
  expect(seen.runs).toEqual([])
})

test('I1: um loop sem session_id é suspenso', async ($, on) => {
  const files: Record<string, string> = { '/h/.prumo/guard.json': CFG_USD, [ACTIVE]: RALPH7 }
  base(on, files)
  await measure($, 1.5)
  expect(files[PAUSED]).toBe(RALPH7)
})

test('I2: o resume de um .paused de outra sessão repõe-no e avisa', async ($, on) => {
  const files: Record<string, string> = { [PAUSED]: OTHER }
  base(on, files)
  const r = await $.command.run(cmd('prumo-guard-resume', '', { kind: 'composer' }))
  expect(r.text).toBe('Travão rearmado. Loop do ralph reposto, mas pertence à sessão outra: retoma-o lá (claude --resume outra) ou relança /ralph-loop aqui.')
  expect(files[ACTIVE]).toBe(OTHER)
  expect(files[PAUSED]).toBeUndefined()
})

test('I2: o resume de um .paused desta sessão mantém o texto', async ($, on) => {
  const files: Record<string, string> = { [PAUSED]: OWN }
  base(on, files)
  const r = await $.command.run(cmd('prumo-guard-resume', '', { kind: 'composer' }))
  expect(r.text).toBe('Travão rearmado. Loop do ralph retomado na iteração 4.')
})

test('I3: um .paused antigo é guardado à parte e o loop atual é suspenso', async ($, on) => {
  const files: Record<string, string> = { '/h/.prumo/guard.json': CFG_USD, [ACTIVE]: OWN, [PAUSED]: RALPH7 }
  const seen = base(on, files)
  await measure($, 1.5)
  expect(files[ACTIVE]).toBeUndefined()
  expect(files[PAUSED]).toBe(OWN)
  expect(files[`${PAUSED}.1000`]).toBe(RALPH7)
  expect(seen.toasts.join(' ')).toContain('(um loop suspenso antigo foi guardado em ralph-loop.local.md.paused.1000)')
  expect(seen.toasts.join(' ')).toContain('loop do ralph suspenso')
})

test('I3: se o guardar do antigo falhar, o loop atual não é suspenso', async ($, on) => {
  const files: Record<string, string> = { '/h/.prumo/guard.json': CFG_USD, [ACTIVE]: OWN, [PAUSED]: RALPH7 }
  const seen = base(on, files, { mvFails: true })
  await measure($, 1.5)
  expect(files[ACTIVE]).toBe(OWN)
  expect(files[PAUSED]).toBe(RALPH7)
  expect(seen.toasts.join(' ')).toContain('o loop do ralph não foi suspenso')
})

test('I3: um .paused antigo com um loop de outra sessão não é tocado', async ($, on) => {
  const files: Record<string, string> = { '/h/.prumo/guard.json': CFG_USD, [ACTIVE]: OTHER, [PAUSED]: RALPH7 }
  const seen = base(on, files)
  await measure($, 1.5)
  expect(files[PAUSED]).toBe(RALPH7)
  expect(seen.runs).toEqual([])
})

test('I3: o stop apaga também os .paused.<ts>', async ($, on) => {
  const files: Record<string, string> = { [ACTIVE]: RALPH, [PAUSED]: RALPH7, [`${PAUSED}.111`]: RALPH, [`${PAUSED}.222`]: RALPH, '/p/.claude/outro.md': 'fica' }
  base(on, files)
  const r = await $.command.run(cmd('prumo-guard-stop', '', { kind: 'composer' }))
  expect(Object.keys(files).sort()).toEqual(['/p/.claude/outro.md'])
  expect(r.text).toContain('terminado')
})

test('M1: a falha do stop nomeia também o .paused', async ($, on) => {
  base(on, { [ACTIVE]: RALPH }, { rmFails: true })
  const r = await $.command.run(cmd('prumo-guard-stop', '', { kind: 'composer' }))
  expect(r.text).toContain(ACTIVE)
  expect(r.text).toContain(PAUSED)
})

test('M4: o toast sem ficheiro do ralph não tem espaço duplo', async ($, on) => {
  const seen = base(on, { '/h/.prumo/guard.json': CFG_USD })
  await measure($, 1.5)
  const t = seen.toasts.find(x => x.includes('em pausa')) as string
  expect(t).not.toContain('  ')
  expect(seen.notified.join(' ')).not.toContain('  ')
})

test('M2: um Bash recusado em pausa não toca em approvals nem abre pedido', async ($, on) => {
  const files: Record<string, string> = { '/h/.prumo/guard.json': PAUSE_CFG, '/h/.prumo/approvals/abc': '{"id":"abc"}' }
  const seen = base(on, files)
  const writes: string[] = []
  on('fs.write', (_$, e) => { writes.push(e.path); return { value: undefined } })
  const calls = { n: 0 }
  on('tool.call', () => { calls.n++; return { result: '', text: 'igual' } })
  await pauseByRepetition($, seen, calls)
  const before = JSON.stringify(files)
  writes.length = 0
  const r = await $.tool.call({ tool: 'Bash', command: 'rm -rf /' })
  expect(r.deny as string).toStartWith(BRAKE_DENY_PREFIX)
  expect(JSON.stringify(files)).toBe(before)
  expect(writes).toEqual([])
  expect(seen.status).not.toContain('pendente')
})

test('M3: uma chamada de subagente também é recusada em pausa', async ($, on) => {
  const seen = base(on, { '/h/.prumo/guard.json': PAUSE_CFG })
  const calls = { n: 0 }
  on('tool.call', () => { calls.n++; return { result: '', text: 'igual' } })
  await pauseByRepetition($, seen, calls)
  const r = await $.tool.call({ tool: 'Bash', command: 'ls', agentId: 'sub1' } as never)
  expect(r.deny as string).toStartWith(BRAKE_DENY_PREFIX)
  expect(calls.n).toBe(0)
})

test('I4: o arranque com session.cwd a falhar regista os comandos e a linha de estado aparece', async ($, on) => {
  const seen = base(on, {}, { cwdFails: true })
  const names: string[] = []
  on('command.register', (_$, e) => { names.push(e.name); return { value: { command: e.name } } })
  on('tool.register', () => ({ value: { tool: 'x' } }))
  on('fs.write', () => ({ value: undefined }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/p', surface: null, isInteractive: false })
  expect(names).toContain('prumo-guard-resume')
  expect(names).toContain('prumo-guard-stop')
  expect(seen.status).not.toBe('')
})

const EMPTY_ID = '---\nactive: true\niteration: 5\nsession_id: \nmax_iterations: 20\ncompletion_promise: null\n---\nx'
const ABC_ID = '---\nactive: true\nsession_id: abc\nmax_iterations: 20\n---\nsession_id: no-corpo'
const NO_ID_IN_FM = '---\niteration: 2\n---\nsession_id: no-corpo'

test('R1: session_id vazio seguido de max_iterations suspende e o resume usa o texto normal', async ($, on) => {
  const files: Record<string, string> = { '/h/.prumo/guard.json': CFG_USD, [ACTIVE]: EMPTY_ID }
  base(on, files)
  await measure($, 1.5)
  expect(files[ACTIVE]).toBeUndefined()
  expect(files[PAUSED]).toBe(EMPTY_ID)
  const r = await $.command.run(cmd('prumo-guard-resume', '', { kind: 'composer' }))
  expect(r.text).toBe('Travão rearmado. Loop do ralph retomado na iteração 5.')
})

test('R1: session_id abc com outras chaves a seguir é lido como abc', async ($, on) => {
  const files: Record<string, string> = { '/h/.prumo/guard.json': CFG_USD, [ACTIVE]: ABC_ID }
  const seen = base(on, files)
  await measure($, 1.5)
  expect(files[ACTIVE]).toBe(ABC_ID)
  expect(seen.toasts.join(' ')).toContain('de outra sessão')
})

test('R1: um session_id no corpo fora do frontmatter é ignorado', async ($, on) => {
  const files: Record<string, string> = { '/h/.prumo/guard.json': CFG_USD, [ACTIVE]: NO_ID_IN_FM }
  base(on, files)
  await measure($, 1.5)
  expect(files[PAUSED]).toBe(NO_ID_IN_FM)
})

test('R2: se o relógio falhar ao guardar o antigo, a pausa completa e o toast diz que não suspendeu', async ($, on) => {
  const files: Record<string, string> = { '/h/.prumo/guard.json': CFG_USD, [ACTIVE]: OWN, [PAUSED]: RALPH7 }
  const seen = base(on, files, { clockFails: true })
  await measure($, 1.5)
  expect(last(seen)?.paused).toBe(true)
  expect(seen.toasts.join(' ')).toContain('o loop do ralph não foi suspenso')
  expect(seen.status).toContain('pausa')
})

test('R2: se session.id rejeitar, a pausa completa e o toast diz que não suspendeu', async ($, on) => {
  const files: Record<string, string> = { '/h/.prumo/guard.json': CFG_USD, [ACTIVE]: OWN }
  const seen = base(on, files, { idFails: true })
  await measure($, 1.5)
  expect(last(seen)?.paused).toBe(true)
  expect(seen.toasts.join(' ')).toContain('o loop do ralph não foi suspenso')
  expect(seen.status).toContain('pausa')
})

test('o disparo grava brake.ralph com o resultado da suspensão', async ($, on) => {
  const seen = base(on, { '/h/.prumo/guard.json': CFG_USD, [ACTIVE]: RALPH7 })
  await measure($, 1.5)
  expect(last(seen)?.ralph).toBe('suspended')
})

test('o disparo sem loop grava brake.ralph none', async ($, on) => {
  const seen = base(on, { '/h/.prumo/guard.json': CFG_USD })
  await measure($, 1.5)
  expect(last(seen)?.ralph).toBe('none')
})

test('o disparo com falha ao mover grava brake.ralph failed', async ($, on) => {
  const seen = base(on, { '/h/.prumo/guard.json': CFG_USD, [ACTIVE]: RALPH7 }, { mvFails: true })
  await measure($, 1.5)
  expect(last(seen)?.ralph).toBe('failed')
})

test('o resume limpa brake.ralph', async ($, on) => {
  const seen = base(on, { '/h/.prumo/guard.json': CFG_USD, [ACTIVE]: RALPH7 })
  await measure($, 1.5)
  expect(last(seen)?.ralph).toBe('suspended')
  await $.command.run(cmd('prumo-guard-resume', '', { kind: 'composer' }))
  expect(last(seen)?.ralph).toBeNull()
})

test('o stop limpa brake.ralph e mantém a pausa', async ($, on) => {
  const seen = base(on, { '/h/.prumo/guard.json': CFG_USD, [ACTIVE]: RALPH7 })
  await measure($, 1.5)
  expect(last(seen)?.ralph).toBe('suspended')
  await $.command.run(cmd('prumo-guard-stop', '', { kind: 'composer' }))
  expect(last(seen)?.ralph).toBeNull()
  expect(last(seen)?.paused).toBe(true)
})

test('recordRalph: com a pausa ainda de pé escreve o resultado', () => {
  const paused = { ...BRAKE_DEFAULT, paused: true, reason: 'x' }
  expect(recordRalph(paused, 'suspended', paused).ralph).toBe('suspended')
})

test('recordRalph: um resume entre os dois updates não deixa ralph com paused false', () => {
  const paused = { ...BRAKE_DEFAULT, paused: true, reason: 'x' }
  expect(recordRalph(BRAKE_DEFAULT, 'suspended', paused)).toEqual(BRAKE_DEFAULT)
  expect(recordRalph(undefined, 'suspended', paused)).toEqual(paused)
})

test('o disparo grava ralph null no primeiro update, antes do resultado', async ($, on) => {
  const seen = base(on, { '/h/.prumo/guard.json': CFG_USD, [ACTIVE]: RALPH7 })
  await measure($, 1.5)
  const first = seen.brake.find(b => b.paused)
  expect(first?.ralph).toBeNull()
})

test('o stop com o rm a falhar mantém brake.ralph', async ($, on) => {
  const seen = base(on, { '/h/.prumo/guard.json': CFG_USD, [ACTIVE]: RALPH7 }, { rmFails: true })
  await measure($, 1.5)
  expect(last(seen)?.ralph).toBe('suspended')
  await $.command.run(cmd('prumo-guard-stop', '', { kind: 'composer' }))
  expect(last(seen)?.ralph).toBe('suspended')
})

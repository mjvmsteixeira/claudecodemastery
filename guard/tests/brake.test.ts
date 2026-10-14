import { test, expect, mock } from 'claude-code/testing'
import type { On } from 'claude-code'
import { cmd } from './start-stubs.ts'

const RALPH = '---\niteration: 3\nmax_iterations: 20\n---\nx'
const BAND = { plugin: 'prumo-guard', surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 8, bodyColumns: 80, scroll: { offset: 0, bodyRows: 8 }, view: {} } } as const
const RAN = { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false }
const STOP = { stop_hook_active: false, session_id: 's', transcript_path: '', cwd: '/p' } as never

type Seen = { brake: Array<{ paused: boolean; reason: string | null; loopStartUsd: number | null; tokens: number }>; repeat: unknown[]; toasts: string[]; notified: string[]; aborted: string[]; status: string; runs: string[][] }

function base(on: On, files: Record<string, string> = {}, opts: { abortFails?: boolean; clockFails?: boolean } = {}): Seen {
  const abortFails = opts.abortFails ?? false
  const seen: Seen = { brake: [], repeat: [], toasts: [], notified: [], aborted: [], status: '', runs: [] }
  mock.env(on, { HOME: '/h' })
  on('session.cwd', () => ({ value: '/p' }))
  on('clock.now', () => (opts.clockFails ? { deny: 'relógio indisponível' } : { value: 1_000 }))
  on('clock.every', () => ({ deny: 'sem relógio no teste' }))
  on('session.id', () => ({ value: 's' }))
  on('fs.read', (_$, e) => (files[e.path] !== undefined ? { value: files[e.path] as string } : { deny: 'ENOENT' }))
  on('fs.stat', () => ({ deny: 'ENOENT' }))
  on('ui.status', (_$, e) => { seen.status = e.text ?? ''; return { value: undefined } })
  on('ui.toast', (_$, e) => { seen.toasts.push(e.text); return { value: undefined } })
  on('ui.notify', (_$, e) => { seen.notified.push(String(e.text)); return { value: { isSent: true, channel: 'terminal_bell' } } })
  on('turn.abort', (_$, e) => { if (abortFails) return { deny: 'reentrada' }; seen.aborted.push(e.turnId); return { value: undefined } })
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('process.run', (_$, e) => { seen.runs.push([...e.argv]); return { value: RAN } })
  on('state.set', { plugin: 'prumo-guard', key: 'brake' }, (_$, e, next) => { seen.brake.push(e.value as Seen['brake'][number]); return next(e) })
  on('state.set', { plugin: 'prumo-guard', key: 'repeat' }, (_$, e, next) => { seen.repeat.push(e.value); return next(e) })
  return seen
}

const last = (s: Seen) => s.brake[s.brake.length - 1]
const measure = ($: { session: { measure: (e: never) => Promise<unknown> } }, usd: number) =>
  $.session.measure({ context: { window: 200000 }, rateLimits: [], cost: { usd }, changed: ['cost'] } as never)

test('em pausa, o block do Stop (re-prompt do ralph) é anulado e os outros hooks correm', async ($, on) => {
  const seen = base(on, { '/h/.prumo/guard.json': '{"brake":{"usdBudget":1}}' })
  let ralphRan = false
  on('classic.Stop', () => { ralphRan = true; return { block: 'continua o loop' } })
  await measure($, 1.5)
  expect(last(seen)?.paused).toBe(true)
  const r = await $.classic.Stop(STOP)
  expect(ralphRan).toBe(true)
  expect(r.block).toBeUndefined()
})

test('sem pausa, o block passa', async ($, on) => {
  base(on)
  on('classic.Stop', () => ({ block: 'continua o loop' }))
  const r = await $.classic.Stop(STOP)
  expect(r.block).toBe('continua o loop')
})

test('passar 120% do orçamento em USD pausa, avisa e aborta o turno em curso', async ($, on) => {
  const seen = base(on, { '/h/.prumo/guard.json': '{"brake":{"usdBudget":1}}' })
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
  const seen = base(on, { '/h/.prumo/guard.json': '{"brake":{"usdBudget":5}}', '/p/.claude/ralph-loop.local.md': RALPH })
  await measure($, 3)
  await $.turn.start({ text: 'x', turnId: 't1' })
  expect(last(seen)?.loopStartUsd).toBe(3)
  await measure($, 7.9)
  expect(last(seen)?.paused).toBe(false)
  await measure($, 8.2)
  expect(last(seen)?.paused).toBe(true)
})

test('orçamento 0 desliga o travão de USD', async ($, on) => {
  const seen = base(on, { '/h/.prumo/guard.json': '{"brake":{"usdBudget":0}}' })
  await measure($, 500)
  expect(seen.brake.some(b => b.paused)).toBe(false)
})

test('passar o orçamento de tokens pausa', async ($, on) => {
  const seen = base(on, { '/h/.prumo/guard.json': '{"brake":{"tokenBudget":100}}' })
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer', usage: { model: 'm', input_tokens: 60, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } } as never)
  expect(last(seen)?.paused).toBe(true)
  expect(last(seen)?.reason).toContain('tokens')
})

test('a mesma chamada com o mesmo resultado pausa ao fim do limite', async ($, on) => {
  const seen = base(on, { '/h/.prumo/guard.json': '{"brake":{"repeatLimit":3}}' })
  on('tool.call', () => ({ result: '', text: 'igual' }))
  for (let i = 0; i < 2; i++) await $.tool.call({ tool: 'Bash', command: 'ls' })
  expect(seen.brake.some(b => b.paused)).toBe(false)
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  expect(last(seen)?.paused).toBe(true)
  expect(last(seen)?.reason).toContain('3 vezes')
})

test('o mesmo teste a falhar pausa', async ($, on) => {
  const seen = base(on, { '/h/.prumo/guard.json': '{"brake":{"repeatLimit":3}}' })
  let n = 0
  on('tool.call', () => ({ result: '', text: `run ${n++}\n3 examples, 1 failure\nFailure: boom` }))
  for (let i = 0; i < 3; i++) await $.tool.call({ tool: 'Bash', command: 'bundle exec rspec' })
  expect(last(seen)?.paused).toBe(true)
  expect(last(seen)?.reason).toContain('falhou')
})

test('edições que se desfazem pausam', async ($, on) => {
  const seen = base(on)
  on('tool.call', () => ({ result: '', text: 'ok' }))
  for (let i = 0; i < 3; i++) {
    await $.tool.call({ tool: 'Edit', file_path: '/p/a.rb', old_string: 'x', new_string: 'y' } as never)
    await $.tool.call({ tool: 'Edit', file_path: '/p/a.rb', old_string: 'y', new_string: 'x' } as never)
  }
  expect(last(seen)?.paused).toBe(true)
  expect(last(seen)?.reason).toContain('desfizeram')
})

test('se o motor recusar o abort a pausa fica na mesma', async ($, on) => {
  const seen = base(on, { '/h/.prumo/guard.json': '{"brake":{"usdBudget":1}}' }, { abortFails: true })
  await $.turn.start({ text: 'x', turnId: 't1' })
  await measure($, 2)
  expect(last(seen)?.paused).toBe(true)
})

test('/prumo-guard-resume pela pessoa rearma o travão e recomeça a contagem', async ($, on) => {
  const seen = base(on, { '/h/.prumo/guard.json': '{"brake":{"usdBudget":1}}' })
  await measure($, 1.5)
  const r = await $.command.run(cmd('prumo-guard-resume', '', { kind: 'composer' }))
  expect(r.text).toContain('rearmado')
  expect(last(seen)).toEqual({ paused: false, reason: null, loopStartUsd: 1.5, tokens: 0 })
  expect(seen.repeat.length).toBeGreaterThan(0)
})

test('resume sem ralph: o turn.start seguinte não anula a base e o travão não volta a disparar', async ($, on) => {
  const seen = base(on, { '/h/.prumo/guard.json': '{"brake":{"usdBudget":1}}' })
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

test('/prumo-guard-stop pela pessoa apaga o estado do ralph', async ($, on) => {
  const seen = base(on)
  const r = await $.command.run(cmd('prumo-guard-stop', '', { kind: 'composer' }))
  expect(seen.runs).toEqual([['rm', '-f', '/p/.claude/ralph-loop.local.md']])
  expect(r.text).toContain('terminado')
})

test('/prumo-guard-stop por um plugin é recusado', async ($, on) => {
  const seen = base(on)
  const r = await $.command.run(cmd('prumo-guard-stop'))
  expect(r.text).toContain('só aceita')
  expect(seen.runs.length).toBe(0)
})

test('a banda mostra a pausa e o motivo', async ($, on) => {
  base(on, { '/h/.prumo/guard.json': '{"brake":{"usdBudget":1}}' })
  on('ui.render', { component: 'AbovePrompt' }, () => ({ type: 'Text', children: ['sem painel'] }))
  await measure($, 2)
  const ui = await $.ui.mount(BAND)
  expect(await ui.find({ text: /\[pausa\] orçamento atingido/ })).toBeDefined()
  await ui.unmount()
})

// D6: a pausa só veta o re-prompt; o corte do turno é só acima de 120% do orçamento em USD.
test('entre 100% e 120% do orçamento pausa sem abortar o turno', async ($, on) => {
  const seen = base(on, { '/h/.prumo/guard.json': '{"brake":{"usdBudget":1}}' })
  await $.turn.start({ text: 'x', turnId: 't1' })
  await measure($, 1.1)
  expect(last(seen)?.paused).toBe(true)
  expect(seen.aborted).toEqual([])
})

test('repetição pausa sem abortar o turno', async ($, on) => {
  const seen = base(on, { '/h/.prumo/guard.json': '{"brake":{"repeatLimit":2}}' })
  on('tool.call', () => ({ result: '', text: 'igual' }))
  await $.turn.start({ text: 'x', turnId: 't1' })
  for (let i = 0; i < 2; i++) await $.tool.call({ tool: 'Bash', command: 'ls' })
  expect(last(seen)?.paused).toBe(true)
  expect(seen.aborted).toEqual([])
})

test('orçamento de tokens pausa sem abortar o turno', async ($, on) => {
  const seen = base(on, { '/h/.prumo/guard.json': '{"brake":{"tokenBudget":100}}' })
  await $.turn.start({ text: 'x', turnId: 't1' })
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't0', agentId: 'sub', reason: 'answer', usage: { model: 'm', input_tokens: 60, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } } as never)
  expect(last(seen)?.paused).toBe(true)
  expect(seen.aborted).toEqual([])
})

test('já em pausa, passar 120% corta o turno corrente, uma vez', async ($, on) => {
  const seen = base(on, { '/h/.prumo/guard.json': '{"brake":{"usdBudget":10}}' })
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
  const seen = base(on, { '/h/.prumo/guard.json': '{"brake":{"repeatLimit":2}}' })
  for (let i = 0; i < 3; i++) await $.tool.call({ tool: 'mcp__prumo-guard__loop_phase', phase: 'testes' } as never)
  expect(seen.brake.some(b => b.paused)).toBe(false)
})

test('com o friday ligado e o relógio a falhar, o Stop em pausa continua a anular o re-prompt', async ($, on) => {
  const seen = base(on, { '/h/.prumo/guard.json': '{"brake":{"usdBudget":1},"friday":{"enabled":true}}' }, { clockFails: true })
  on('classic.Stop', () => ({ block: 'continua o loop' }))
  await measure($, 1.5)
  expect(last(seen)?.paused).toBe(true)
  const r = await $.classic.Stop(STOP)
  expect(r.block).toBeUndefined()
})

test('se o Stop falhar depois de correr os hooks de baixo, o .catch aplica o veto da pausa', async ($, on) => {
  let failRead = false
  on('state.get', { plugin: 'prumo-guard', key: 'brake' }, (_$, e, next) => (failRead ? { deny: 'estado indisponível' } : next(e)))
  const seen = base(on, { '/h/.prumo/guard.json': '{"brake":{"usdBudget":1}}' })
  let ralphRan = 0
  on('classic.Stop', () => { ralphRan++; return { block: 'continua o loop' } })
  await measure($, 1.5)
  expect(last(seen)?.paused).toBe(true)
  failRead = true
  const r = await $.classic.Stop(STOP)
  expect(r.block).toBeUndefined()
  expect(ralphRan).toBe(1)
})

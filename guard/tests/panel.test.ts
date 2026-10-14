import { test, expect, mock } from 'claude-code/testing'
import type { On } from 'claude-code'

const BAND = { plugin: 'prumo-guard', surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 8, bodyColumns: 80, scroll: { offset: 0, bodyRows: 8 }, view: {} } } as const
const RALPH = '---\niteration: 7\nmax_iterations: 20\n---\nx'

type Seen = { status: string; sets: Record<string, unknown> }

function base(on: On, files: Record<string, string> = {}): Seen {
  const seen: Seen = { status: '', sets: {} }
  mock.env(on, { HOME: '/h' })
  on('session.cwd', () => ({ value: '/p' }))
  on('clock.now', () => ({ value: 10 * 60_000 }))
  on('fs.read', (_$, e) => (files[e.path] !== undefined ? { value: files[e.path] as string } : { deny: 'ENOENT' }))
  on('fs.stat', () => ({ deny: 'ENOENT' }))
  on('ui.status', (_$, e) => { seen.status = e.text ?? ''; return { value: undefined } })
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('state.set', { plugin: 'prumo-guard', key: 'phase' }, (_$, e, next) => { seen.sets.phase = e.value; return next(e) })
  on('state.set', { plugin: 'prumo-guard', key: 'tests' }, (_$, e, next) => { seen.sets.tests = e.value; return next(e) })
  on('state.set', { plugin: 'prumo-guard', key: 'agents' }, (_$, e, next) => { seen.sets.agents = e.value; return next(e) })
  on('state.set', { plugin: 'prumo-guard', key: 'usage' }, (_$, e, next) => { seen.sets.usage = e.value; return next(e) })
  on('state.set', { plugin: 'prumo-guard', key: 'loop' }, (_$, e, next) => { seen.sets.loop = e.value; return next(e) })
  on('ui.render', { component: 'AbovePrompt' }, () => ({ type: 'Text', children: ['sem painel'] }))
  return seen
}

test('tool loop_phase regista a fase e mostra-a no estado', async ($, on) => {
  const seen = base(on)
  const r = await $.tool.call({ tool: 'mcp__prumo-guard__loop_phase', phase: 'testes' } as never)
  expect(String(r.result)).toContain('testes')
  expect(seen.sets.phase).toBe('testes')
})

test('fase desconhecida cai em outro', async ($, on) => {
  const seen = base(on)
  await $.tool.call({ tool: 'mcp__prumo-guard__loop_phase', phase: 'dormir' } as never)
  expect(seen.sets.phase).toBe('outro')
})

test('resultado de testes fica no estado', async ($, on) => {
  const seen = base(on)
  on('tool.call', () => ({ result: {}, text: '43 examples, 2 failures' }))
  await $.tool.call({ tool: 'Bash', command: 'bundle exec rspec' })
  const t = seen.sets.tests as { failed: number; passed: number } | undefined
  expect(t?.failed).toBe(2)
  expect(t?.passed).toBe(41)
})

test('um comando que não é de testes não regista resultado', async ($, on) => {
  const seen = base(on)
  on('tool.call', () => ({ result: {}, text: '43 examples, 2 failures' }))
  await $.tool.call({ tool: 'Bash', command: 'echo olá' })
  expect(seen.sets.tests).toBeUndefined()
})

test('banda mostra a iteração do ralph', async ($, on) => {
  base(on, { '/p/.claude/ralph-loop.local.md': RALPH })
  await $.turn.start({ text: 'x', turnId: 't1' })
  const ui = await $.ui.mount(BAND)
  expect(await ui.find({ text: /ralph 7\/20/ })).toBeDefined()
  await ui.unmount()
})

test('a iteração do ralph aparece também no estado', async ($, on) => {
  const seen = base(on, { '/p/.claude/ralph-loop.local.md': RALPH })
  await $.turn.start({ text: 'x', turnId: 't1' })
  expect(seen.sets.loop).toEqual({ active: true, iteration: 7, maxIterations: 20 })
  expect(seen.status).toContain('ralph 7/20')
})

test('o turno de um subagente não relê o ralph', async ($, on) => {
  const seen = base(on, { '/p/.claude/ralph-loop.local.md': RALPH })
  await $.turn.start({ text: 'x', turnId: 't2', agentId: 'a1' })
  expect(seen.sets.loop).toBeUndefined()
})

test('sem nada ativo a banda não desenha', async ($, on) => {
  base(on)
  await $.turn.start({ text: 'x', turnId: 't1' })
  const ui = await $.ui.mount(BAND)
  expect(await ui.find({ text: 'sem painel' })).toBeDefined()
  await ui.unmount()
})

test('session.measure alimenta contexto, custo e limites na banda', async ($, on) => {
  const seen = base(on, { '/p/.claude/ralph-loop.local.md': RALPH })
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  await $.turn.start({ text: 'x', turnId: 't1' })
  await $.session.measure({ context: { window: 200000, percent: 41.2 }, rateLimits: [{ kind: 'five_hour', percentUsed: 62.4 }], cost: { usd: 1.5 }, changed: ['cost'] })
  expect(seen.sets.usage).toEqual({ contextPercent: 41.2, usd: 1.5, rate: 'five_hour 62%' })
  const ui = await $.ui.mount(BAND)
  expect(await ui.find({ text: /ctx 41%/ })).toBeDefined()
  expect(await ui.find({ text: /1,50 USD/ })).toBeDefined()
  await ui.unmount()
})

test('subagentes ativos entram na banda e saem no fim do turno', async ($, on) => {
  const seen = base(on)
  on('agent.spawn', () => ({ model: 'm', agentId: 'ag-1' }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  await $.agent.spawn({ prompt: 'p', description: 'd', subagentType: 'superpowers:code-reviewer', tool_use_id: 'tu1' } as never)
  expect((seen.sets.agents as { id: string; type: string }[])[0]?.id).toBe('ag-1')
  const ui = await $.ui.mount(BAND)
  expect(await ui.find({ text: /subagentes: code-reviewer 0m/ })).toBeDefined()
  await ui.unmount()
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't9', agentId: 'ag-1', reason: 'answer' } as never)
  expect(seen.sets.agents).toEqual([])
})

test('o arranque regista a tool loop_phase', async ($, on) => {
  const tools: string[] = []
  base(on)
  on('tool.register', (_$, e) => { tools.push(e.name); return { value: { tool: e.name } } })
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('session.id', () => ({ value: 's' }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: 'h', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('fs.write', () => ({ value: undefined }))
  on('clock.every', () => ({ value: undefined }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/p', surface: null, isInteractive: false })
  expect(tools).toContain('loop_phase')
})

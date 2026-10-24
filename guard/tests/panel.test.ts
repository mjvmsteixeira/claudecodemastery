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
  await $.session.measure({ context: { window: 200000, percent: 41.2 }, rateLimits: [{ kind: 'five_hour', percentUsed: 62.4, resetsAt: '2026-10-24T18:00:00Z' }], cost: { usd: 1.5 }, changed: ['cost'] })
  expect(seen.sets.usage).toEqual({ contextPercent: 41.2, usd: 1.5, windows: [{ kind: 'five_hour', percent: 62.4, resetsAt: '2026-10-24T18:00:00Z' }] })
  const ui = await $.ui.mount(BAND)
  expect(await ui.find({ text: /ctx 41%/ })).toBeDefined()
  expect(await ui.find({ text: /1,50 USD/ })).toBeDefined()
  expect(await ui.find({ text: /5h 62%/ })).toBeDefined()
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
  on('clock.every', () => ({ deny: 'sem relógio no teste' }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/p', surface: null, isInteractive: false })
  expect(tools).toContain('loop_phase')
})

// --- Fase 2: a band com consumo a cores ---
const NOW = 10 * 60_000
const WIDE = { ...BAND, props: { ...BAND.props, bodyColumns: 140 } } as const
const at = (ms: number) => new Date(NOW + ms).toISOString()
const H = 3600_000
const M = 60_000
type BandState = { usage?: unknown; phase?: string | null; brake?: Partial<{ paused: boolean; reason: string | null; ralph: 'suspended' | 'failed' | 'other' | 'none' | null }>; config?: string }

function seed(on: On, s: BandState): void {
  base(on, s.config ? { '/h/.prumo/guard.json': s.config } : {})
  if (s.usage !== undefined) on('state.get', { plugin: 'prumo-guard', key: 'usage' }, () => ({ value: { value: s.usage as never, version: 1 } }))
  on('state.get', { plugin: 'prumo-guard', key: 'phase' }, () => ({ value: { value: s.phase === undefined ? 'revisão' : s.phase, version: 1 } }))
  if (s.brake) on('state.get', { plugin: 'prumo-guard', key: 'brake' }, () => ({ value: { value: { paused: false, reason: null, loopStartUsd: null, tokens: 0, ralph: null, ...s.brake }, version: 1 } }))
}

type Found = { text: string; props: Record<string, unknown> }
type UI = { findAll: (q: { type?: string; text?: string | RegExp }) => Promise<Found[]> }
// O Text não leva key na API: procura-se o Text mais interior com o texto exato (ou que casa a RegExp).
async function leaf(ui: UI, t: string | RegExp): Promise<Found | undefined> {
  const all = await ui.findAll({ type: 'Text' })
  return all.filter(f => (typeof t === 'string' ? f.text === t : t.test(f.text))).pop()
}

const TYPICAL = { contextPercent: 24, usd: 20.44, windows: [{ kind: 'five_hour', percent: 15, resetsAt: at(2 * H + 10 * M + 30_000) }, { kind: 'seven_day', percent: 56, resetsAt: at(4 * 24 * H) }] }
const BRAKE_ON = '{"brake":{"enabled":true,"usdBudget":50}}'

test('linha larga: barras de 8 células com a cor do nível e o reset', async ($, on) => {
  seed(on, { usage: TYPICAL })
  const ui = await $.ui.mount(WIDE)
  expect((await leaf(ui, '◆ revisão'))?.props.color).toBe('claude')
  expect((await leaf(ui, 'ctx ██░░░░░░ 24%'))).toBeDefined()
  expect((await leaf(ui, '24%'))?.props.color).toBe('success')
  expect((await leaf(ui, /^5h █░{7} 15% ↻ 2h10$/))).toBeDefined()
  expect((await leaf(ui, '15%'))?.props.color).toBe('success')
  expect((await leaf(ui, '56%'))?.props.color).toBe('warning')
  expect((await leaf(ui, '██'))?.props.color).toBe('success')
  expect((await leaf(ui, '░░░░░░'))?.props.color).toBe('subtle')
  expect((await leaf(ui, '████'))?.props.color).toBe('warning')
  const reset = await leaf(ui, ' ↻ 2h10')
  expect(reset?.props.color).toBe('subtle')
  expect((await leaf(ui, /^ ↻ \S+ \d\d:\d\d$/))?.props.color).toBe('subtle')
  expect((await ui.find({ key: 'linha' }))?.props.columnGap).toBe(3)
  expect(await ui.find({ text: /NaN/ })).toBeUndefined()
  await ui.unmount()
})

test('linha larga: 50 dá warning e 80 dá error a negrito', async ($, on) => {
  seed(on, { usage: { contextPercent: 50, usd: null, windows: [{ kind: 'five_hour', percent: 80 }] } })
  const ui = await $.ui.mount(WIDE)
  const ctx = await leaf(ui, '50%')
  expect(ctx?.props.color).toBe('warning')
  expect(ctx?.props.bold).toBeFalsy()
  const five = await leaf(ui, '80%')
  expect(five?.props.color).toBe('error')
  expect(five?.props.bold).toBe(true)
  expect(await ui.find({ text: /↻/ })).toBeUndefined()
  await ui.unmount()
})

test('os limiares do painel vêm do guard.json', async ($, on) => {
  seed(on, { usage: { contextPercent: 30, usd: null, windows: [] }, config: '{"panel":{"warn":20,"crit":30}}' })
  const ui = await $.ui.mount(WIDE)
  expect((await leaf(ui, '30%'))?.props.color).toBe('error')
  await ui.unmount()
})

test('custo com o travão ligado mostra a fração do orçamento a cores', async ($, on) => {
  seed(on, { usage: TYPICAL, config: BRAKE_ON })
  const ui = await $.ui.mount(WIDE)
  expect(await leaf(ui, '20,44/50 USD')).toBeDefined()
  expect((await leaf(ui, '20,44'))?.props.color).toBe('success')
  await ui.unmount()
})

test('custo sem travão mostra só os USD em subtle', async ($, on) => {
  seed(on, { usage: TYPICAL })
  const ui = await $.ui.mount(WIDE)
  expect((await leaf(ui, '20,44 USD'))?.props.color).toBe('subtle')
  expect(await ui.find({ text: /\/50 USD/ })).toBeUndefined()
  await ui.unmount()
})

test('travão ligado com usdBudget 0: custo sem orçamento e sem alerta', async ($, on) => {
  seed(on, { usage: { ...TYPICAL, usd: 999 }, config: '{"brake":{"enabled":true,"usdBudget":0}}' })
  const ui = await $.ui.mount(WIDE)
  expect((await leaf(ui, '999,00 USD'))?.props.color).toBe('subtle')
  expect(await ui.find({ text: /orçamento a/ })).toBeUndefined()
  await ui.unmount()
})

test('linha estreita com bodyColumns 80: sem barras, números a cores e ↻ só abaixo de 24 h', async ($, on) => {
  seed(on, { usage: TYPICAL, config: BRAKE_ON })
  const ui = await $.ui.mount(BAND)
  expect(JSON.stringify(await ui.drawn())).not.toContain('█')
  expect(await leaf(ui, '◆ revisão · ctx 24% · 5h 15% ↻2h10 · 7d 56% · 20,44/50 USD')).toBeDefined()
  expect((await leaf(ui, '56%'))?.props.color).toBe('warning')
  expect((await leaf(ui, '24%'))?.props.color).toBe('success')
  expect((await leaf(ui, '20,44'))?.props.color).toBe('success')
  await ui.unmount()
})

test('linha estreita sem travão: custo em subtle', async ($, on) => {
  seed(on, { usage: TYPICAL })
  const ui = await $.ui.mount(BAND)
  expect((await leaf(ui, '20,44 USD'))?.props.color).toBe('subtle')
  expect(await leaf(ui, /^◆ revisão · .* · 20,44 USD$/)).toBeDefined()
  await ui.unmount()
})

test('a partir de crit há linha de alerta para o 5h', async ($, on) => {
  seed(on, { usage: { contextPercent: 10, usd: null, windows: [{ kind: 'five_hour', percent: 91, resetsAt: at(25 * M + 10_000) }] } })
  const ui = await $.ui.mount(WIDE)
  expect((await leaf(ui, '▲ limite de 5 horas a 91% — reinicia em 0h25'))?.props.color).toBe('error')
  await ui.unmount()
})

test('a 79% não há alerta', async ($, on) => {
  seed(on, { usage: { contextPercent: 10, usd: null, windows: [{ kind: 'five_hour', percent: 79, resetsAt: at(25 * M) }] } })
  const ui = await $.ui.mount(WIDE)
  expect(await ui.find({ text: /▲/ })).toBeUndefined()
  await ui.unmount()
})

test('alertas de contexto, 7 dias e orçamento; sem reset não há "reinicia"', async ($, on) => {
  seed(on, { usage: { contextPercent: 86, usd: 46, windows: [{ kind: 'five_hour', percent: 95 }, { kind: 'seven_day', percent: 85, resetsAt: at(3 * 24 * H) }] }, config: BRAKE_ON })
  const ui = await $.ui.mount(WIDE)
  expect((await leaf(ui, '▲ contexto a 86% — compacta em breve (/compact)'))?.props.color).toBe('error')
  expect(await leaf(ui, '▲ limite de 5 horas a 95%')).toBeDefined()
  expect(await leaf(ui, /^▲ limite de 7 dias a 85% — reinicia \S+ \d\d:\d\d$/)).toBeDefined()
  expect((await leaf(ui, '▲ orçamento a 92% (46,00/50 USD)'))?.props.color).toBe('error')
  await ui.unmount()
})

test('um kind desconhecido entra com o próprio nome e não gera alerta', async ($, on) => {
  seed(on, { usage: { contextPercent: 10, usd: null, windows: [{ kind: 'opus_weekly', percent: 95 }] } })
  const ui = await $.ui.mount(WIDE)
  expect(await leaf(ui, 'opus_weekly ████████ 95%')).toBeDefined()
  expect(await ui.find({ text: /▲/ })).toBeUndefined()
  await ui.unmount()
})

test('sem dados de consumo a band mostra só a fase, sem barras nem NaN', async ($, on) => {
  seed(on, {})
  const ui = await $.ui.mount(WIDE)
  const s = JSON.stringify(await ui.drawn())
  expect(await leaf(ui, '◆ revisão')).toBeDefined()
  expect(s).not.toContain('░')
  expect(s).not.toContain('NaN')
  expect(s).not.toContain('USD')
  await ui.unmount()
})

test('percentagens não finitas ficam de fora', async ($, on) => {
  seed(on, { usage: { contextPercent: Number.NaN, usd: null, windows: [{ kind: 'five_hour', percent: Number.NaN }] } })
  const ui = await $.ui.mount(BAND)
  expect(JSON.stringify(await ui.drawn())).not.toContain('NaN')
  expect(await ui.find({ text: /ctx|5h/ })).toBeUndefined()
  expect(await leaf(ui, '◆ revisão')).toBeDefined()
  await ui.unmount()
})

test('um usage antigo sem windows (estado do 1.2.0) desenha na mesma', async ($, on) => {
  seed(on, { usage: { contextPercent: 30, usd: 1 } })
  const ui = await $.ui.mount(WIDE)
  expect(await leaf(ui, 'ctx ██░░░░░░ 30%')).toBeDefined()
  expect(await leaf(ui, '1,00 USD')).toBeDefined()
  await ui.unmount()
})

test('com o ralph ativo o bloco da fase leva o prefixo', async ($, on) => {
  base(on, { '/p/.claude/ralph-loop.local.md': RALPH })
  on('state.get', { plugin: 'prumo-guard', key: 'phase' }, () => ({ value: { value: 'revisão', version: 1 } }))
  await $.turn.start({ text: 'x', turnId: 't1' })
  const ui = await $.ui.mount(WIDE)
  expect((await leaf(ui, '◆ ralph 7/20 · revisão'))?.props.color).toBe('claude')
  await ui.unmount()
})

test('pausa: rótulo invertido, motivo e o ralph suspenso', async ($, on) => {
  seed(on, { usage: TYPICAL, brake: { paused: true, reason: 'orçamento atingido', ralph: 'suspended' } })
  const ui = await $.ui.mount(WIDE)
  const label = await leaf(ui, ' PAUSA ')
  expect(label?.props.backgroundColor).toBe('error')
  expect(label?.props.color).toBe('inverseText')
  expect(label?.props.bold).toBe(true)
  const t = await leaf(ui, ' orçamento atingido · ferramentas recusadas · loop do ralph suspenso · /prumo-guard-resume')
  expect(t?.props.color).toBe('error')
  expect(t?.props.bold).toBeFalsy()
  await ui.unmount()
})

test('pausa com o ralph de outra sessão', async ($, on) => {
  seed(on, { brake: { paused: true, reason: 'x', ralph: 'other' } })
  const ui = await $.ui.mount(WIDE)
  expect(await leaf(ui, ' x · ferramentas recusadas · loop do ralph de outra sessão (não tocado) · /prumo-guard-resume')).toBeDefined()
  await ui.unmount()
})

test('pausa com o ralph que não foi suspenso', async ($, on) => {
  seed(on, { brake: { paused: true, reason: 'x', ralph: 'failed' } })
  const ui = await $.ui.mount(WIDE)
  expect(await leaf(ui, ' x · ferramentas recusadas · loop do ralph não foi suspenso · /prumo-guard-resume')).toBeDefined()
  await ui.unmount()
})

test('pausa sem resultado do ralph e sem motivo', async ($, on) => {
  seed(on, { phase: null, brake: { paused: true, reason: null, ralph: null } })
  const ui = await $.ui.mount(WIDE)
  expect(await leaf(ui, ' travão acionado · ferramentas recusadas · /prumo-guard-resume')).toBeDefined()
  expect(await ui.find({ text: /ralph/ })).toBeUndefined()
  await ui.unmount()
})

test('pausa e alertas aparecem também com bodyColumns estreito', async ($, on) => {
  seed(on, { usage: { contextPercent: 10, usd: null, windows: [{ kind: 'five_hour', percent: 91, resetsAt: at(25 * M) }] }, brake: { paused: true, reason: 'x', ralph: 'none' } })
  const ui = await $.ui.mount(BAND)
  expect((await leaf(ui, ' PAUSA '))?.props.backgroundColor).toBe('error')
  expect(await leaf(ui, ' x · ferramentas recusadas · /prumo-guard-resume')).toBeDefined()
  expect(await leaf(ui, '▲ limite de 5 horas a 91% — reinicia em 0h25')).toBeDefined()
  await ui.unmount()
})

test('com um inquérito aberto a band cede', async ($, on) => {
  seed(on, { usage: TYPICAL, brake: { paused: true, reason: 'x' } })
  const ui = await $.ui.mount({ ...WIDE, props: { ...WIDE.props, hasSurvey: true } })
  expect(await ui.find({ text: 'sem painel' })).toBeDefined()
  await ui.unmount()
})

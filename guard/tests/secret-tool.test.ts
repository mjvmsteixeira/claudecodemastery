import { test, expect, mock } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { PrumoGuardPending } from '../types'

const GATE_DENIAL = `[prumo-secops/approval-gate] Operação N2 detectada:\n  x\n\napproval-id: ${'d'.repeat(64)}\n`
const TOOL = 'mcp__prumo-guard__run_with_secret'

const res = (exitCode: number, stdout = '', stderr = '') => ({
  value: { exitCode, stdout, stderr, isStdoutTruncated: false, isStderrTruncated: false },
})

function stubs(on: On, gateExit = 0, opts: { versions?: string[]; stderr?: string } = {}) {
  const state = { pending: [] as PrumoGuardPending[], runs: [] as string[], envs: [] as Array<Record<string, string> | undefined> }
  on('state.set', { plugin: 'prumo-guard', key: 'pending' }, (_$, e, next) => {
    state.pending = e.value as PrumoGuardPending[]
    return next(e)
  })
  mock.env(on, { HOME: '/h' })
  on('clock.now', () => ({ value: 1_000_000 }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.notify', () => ({ value: { isSent: true, channel: 'terminal_bell' } }))
  on('fs.read', () => ({ deny: 'ENOENT' }))
  on('fs.list', () => ({
    value: (opts.versions ?? ['0.14.0']).map(name => ({ name, kind: 'dir', size: 0, mtimeMs: 0, isLink: false })),
  }))
  on('process.run', (_$, e) => {
    const a = e.argv.join(' ')
    state.runs.push(a)
    if (a.includes('pre-tool-approval-gate.sh')) return res(gateExit, '', gateExit === 2 ? GATE_DENIAL : '')
    if (a.includes('vault-read-field.sh')) return res(0, 'p4ssw0rd')
    state.envs.push(e.init?.env)
    return res(0, 'ligado com p4ssw0rd', opts.stderr ?? '')
  })
  return state
}

test('executa com o segredo no env e mascara o output', async ($, on) => {
  const s = stubs(on)
  const r = await $.tool.call({ tool: TOOL, argv: ['psql', '-c', 'select 1'], secrets: { PGPASSWORD: 'secret/projects/x#db_password' } } as never)
  expect(String(r.result)).toContain('[SEGREDO:PGPASSWORD]')
  expect(String(r.result)).not.toContain('p4ssw0rd')
  expect(s.envs[0]).toEqual({ PGPASSWORD: 'p4ssw0rd' })
})

test('shell recusado sem tocar no Vault', async ($, on) => {
  const s = stubs(on)
  const r = await $.tool.call({ tool: TOOL, argv: ['bash', '-c', 'echo $X'], secrets: { X: 'secret/a#b' } } as never)
  expect(String(r.result ?? r.deny)).toContain('interpretador')
  expect(s.runs).toEqual([])
})

test('approval-gate bloqueia: pedido pendente, nada corre', async ($, on) => {
  const s = stubs(on, 2)
  const r = await $.tool.call({ tool: TOOL, argv: ['psql', '-c', 'select 1'], secrets: {} } as never)
  expect(String(r.result ?? r.deny)).toContain('aprovação')
  expect(s.pending.length).toBe(1)
  expect(s.runs.length).toBe(1)
})

test('mascara o segredo também no stderr', async ($, on) => {
  stubs(on, 0, { stderr: 'erro: password p4ssw0rd rejeitada' })
  const r = await $.tool.call({ tool: TOOL, argv: ['psql'], secrets: { PGPASSWORD: 'secret/x#y' } } as never)
  expect(String(r.result)).toContain('stderr:\nerro: password [SEGREDO:PGPASSWORD] rejeitada')
})

test('latestPluginDir escolhe a versão mais alta numericamente', async ($, on) => {
  const s = stubs(on, 0, { versions: ['0.9.3', '0.12.0', '0.2.0'] })
  await $.tool.call({ tool: TOOL, argv: ['psql'], secrets: { PGPASSWORD: 'secret/x#y' } } as never)
  expect(s.runs.some(r => r.includes('/prumo-base/0.12.0/lib/vault-read-field.sh'))).toBe(true)
})

test('caminho em argv[0] recusado sem tocar no Vault', async ($, on) => {
  const s = stubs(on)
  const r = await $.tool.call({ tool: TOOL, argv: ['./psql'], secrets: { X: 'secret/a#b' } } as never)
  expect(String(r.result ?? r.deny)).toContain('caminho')
  expect(s.runs).toEqual([])
})

test('session.start regista a tool run_with_secret', async ($, on) => {
  mock.env(on, { HOME: '/h' })
  const regs: Array<{ name: string; isDeferred?: boolean; inputSchema: { required?: string[] } }> = []
  on('tool.register', (_$, e) => {
    regs.push(e as never)
    return { value: undefined } as never
  })
  on('fs.read', () => ({ deny: 'ENOENT' }))
  on('ui.status', () => ({ value: undefined }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/h', surface: null, isInteractive: false })
  const r = regs.find(x => x.name === 'run_with_secret')
  expect(r).toBeTruthy()
  expect(r?.isDeferred).toBe(false)
  expect(r?.inputSchema.required).toEqual(['argv', 'secrets'])
})

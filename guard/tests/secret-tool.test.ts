import { test, expect, mock } from 'claude-code/testing'
import type { On } from 'claude-code'
import { stubStart } from './start-stubs.ts'
import type { PrumoGuardPending } from '../types'
import { approvalIdOf } from '../hooks/approval-parse.ts'

const gateDenial = (id: string) => `[prumo-secops/approval-gate] Operação N2 detectada:\n  x\n\napproval-id: ${id}\n`
const TOOL = 'mcp__prumo-guard__run_with_secret'

const res = (exitCode: number, stdout = '', stderr = '') => ({
  value: { exitCode, stdout, stderr, isStdoutTruncated: false, isStderrTruncated: false },
})

type Opts = { versions?: string[]; stderr?: string; files?: Record<string, string>; guards?: Record<string, { exit: number; stderr?: string }>; gateId?: string }

function stubs(on: On, gateExit = 0, opts: Opts = {}) {
  const state = {
    pending: [] as PrumoGuardPending[],
    runs: [] as string[],
    envs: [] as Array<Record<string, string> | undefined>,
    payloads: [] as string[],
    toasts: [] as string[],
  }
  on('state.set', { plugin: 'prumo-guard', key: 'pending' }, (_$, e, next) => {
    state.pending = e.value as PrumoGuardPending[]
    return next(e)
  })
  mock.env(on, { HOME: '/h' })
  on('clock.now', () => ({ value: 1_000_000 }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.notify', () => ({ value: { isSent: true, channel: 'terminal_bell' } }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', (_$, e) => { state.toasts.push(e.text); return { value: undefined } })
  on('session.cwd', () => ({ value: '/p' }))
  const files = opts.files ?? {}
  on('fs.read', (_$, e) => (files[e.path] !== undefined ? { value: files[e.path] as string } : { deny: 'ENOENT' }))
  on('fs.exists', (_$, e) => ({ value: files[e.path] !== undefined }))
  on('fs.list', () => ({
    value: (opts.versions ?? ['0.14.0']).map(name => ({ name, kind: 'dir', size: 0, mtimeMs: 0, isLink: false })),
  }))
  on('process.run', async (_$, e) => {
    const a = e.argv.join(' ')
    state.runs.push(a)
    if (a.includes('pre-tool-approval-gate.sh')) {
      state.payloads.push(e.init?.stdin ?? '')
      const id = opts.gateId ?? (await approvalIdOf(JSON.parse(e.init?.stdin ?? '{}').tool_input.command))
      return res(gateExit, '', gateExit === 2 ? gateDenial(id) : '')
    }
    const guard = Object.keys(opts.guards ?? {}).find(g => a.endsWith(g))
    if (a.includes('/hooks/pre-tool-')) {
      state.payloads.push(e.init?.stdin ?? '')
      const g = guard ? opts.guards?.[guard] : undefined
      return res(g?.exit ?? 0, '', g?.stderr ?? '')
    }
    if (a.includes('vault-read-field.sh')) return res(0, 'p4ssw0rd')
    state.envs.push(e.init?.env)
    return res(0, 'ligado com p4ssw0rd', opts.stderr ?? '')
  })
  return state
}

const ran = (s: { runs: string[] }) => s.runs.filter(r => !r.startsWith('bash '))

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
  expect(r.deny).toContain('interpretador')
  expect(s.runs).toEqual([])
})

test('approval-gate bloqueia: pedido pendente com o id do comando mostrado, nada corre', async ($, on) => {
  const s = stubs(on, 2)
  const r = await $.tool.call({ tool: TOOL, argv: ['psql', '-c', 'select 1'], secrets: { PGPASSWORD: 'secret/x#y' } } as never)
  expect(r.deny).toContain('aprovação')
  expect(s.pending.length).toBe(1)
  expect(s.pending[0]?.id).toBe(await approvalIdOf("psql -c 'select 1'"))
  expect(s.pending[0]?.command).toBe("psql -c 'select 1'")
  expect(s.runs.some(r => r.includes('vault-read-field.sh'))).toBe(false)
  expect(ran(s)).toEqual([])
})

test('recusa do gate com o id de outro comando não abre pedido', async ($, on) => {
  const s = stubs(on, 2, { gateId: 'e'.repeat(64) })
  const r = await $.tool.call({ tool: TOOL, argv: ['psql', '-c', 'select 1'], secrets: {} } as never)
  expect(r.deny).toContain('approval-gate')
  expect(s.pending.length).toBe(0)
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
  expect(r.deny).toContain('caminho')
  expect(s.runs).toEqual([])
})

test('session.start regista a tool run_with_secret', async ($, on) => {
  mock.env(on, { HOME: '/h' })
  const regs: Array<{ name: string; isDeferred?: boolean; inputSchema: { required?: string[] } }> = []
  stubStart(on, { commands: [], tools: regs })
  on('fs.read', () => ({ deny: 'ENOENT' }))
  on('ui.status', () => ({ value: undefined }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/h', surface: null, isInteractive: false })
  const r = regs.find(x => x.name === 'run_with_secret')
  expect(r).toBeTruthy()
  expect(r?.isDeferred).toBe(false)
  expect(r?.inputSchema.required).toEqual(['argv', 'secrets'])
})

test('secret-exec.json com JSON inválido recusa em vez de cair na allowlist por omissão, e avisa uma vez', async ($, on) => {
  const s = stubs(on, 0, { files: { '/h/.prumo/secret-exec.json': '{"allow":["psql"],}' } })
  const r = await $.tool.call({ tool: TOOL, argv: ['kubectl', 'get', 'pods'], secrets: { T: 'secret/k#t' } } as never)
  expect(r.deny).toContain('secret-exec.json inválido')
  await $.tool.call({ tool: TOOL, argv: ['kubectl', 'get', 'pods'], secrets: { T: 'secret/k#t' } } as never)
  expect(s.toasts.filter(t => t.includes('secret-exec.json')).length).toBe(1)
  expect(s.runs).toEqual([])
})

test('secret-exec.json com allow que não é uma lista recusa', async ($, on) => {
  const s = stubs(on, 0, { files: { '/h/.prumo/secret-exec.json': '{"allow":"psql"}' } })
  const r = await $.tool.call({ tool: TOOL, argv: ['docker', 'ps'], secrets: {} } as never)
  expect(r.deny).toContain('secret-exec.json inválido')
  expect(s.runs).toEqual([])
})

test('secret-exec.json válido e restrito continua a recusar o que não lista', async ($, on) => {
  const s = stubs(on, 0, { files: { '/h/.prumo/secret-exec.json': '{"allow":["psql"]}' } })
  const r = await $.tool.call({ tool: TOOL, argv: ['kubectl', 'get', 'pods'], secrets: {} } as never)
  expect(r.deny).toContain('allowlist')
  expect(s.runs).toEqual([])
})

test('formas conhecidas de correr código com um cliente da allowlist são recusadas', async ($, on) => {
  const s = stubs(on)
  for (const argv of [
    ['git', '-c', 'alias.x=!printf %s "$DBPASS" | base64', 'x'],
    ['git', 'config', 'alias.x', '!sh'],
    ['docker', 'run', '--rm', '-v', '/:/host', 'img', 'sh'],
    ['kubectl', 'exec', 'pod', '--', 'sh'],
    ['curl', '-K', 'agent.conf', 'https://x'],
  ]) {
    const r = await $.tool.call({ tool: TOOL, argv, secrets: { DBPASS: 'secret/x#y' } } as never)
    expect(r.deny).toContain('correr código')
  }
  expect(s.runs).toEqual([])
})

test('argumentos ou cwd em ~/.prumo e nos settings do Claude Code são recusados', async ($, on) => {
  const s = stubs(on)
  on('fs.stat', () => ({ value: { kind: 'dir' as const, size: 0, mtimeMs: 0, isLink: false, realPath: '/h/.prumo' } }))
  const a = await $.tool.call({ tool: TOOL, argv: ['curl', '-s', '-o', '/h/.prumo/mode', 'file:///tmp/x'], secrets: {} } as never)
  expect(a.deny).toContain('/h/.prumo/mode')
  const b = await $.tool.call({ tool: TOOL, argv: ['curl', '--output=/h/.prumo/approvals/abc', 'file:///tmp/x'], secrets: {} } as never)
  expect(b.deny).toContain('só a pessoa muda')
  const c = await $.tool.call({ tool: TOOL, argv: ['curl', '-o', '/p/.claude/settings.local.json', 'file:///tmp/x'], secrets: {} } as never)
  expect(c.deny).toContain('settings')
  const d = await $.tool.call({ tool: TOOL, argv: ['curl', '-o', 'mode', 'file:///tmp/x'], secrets: {}, cwd: '/p/ligacao' } as never)
  expect(d.deny).toContain('diretório protegido')
  expect(s.runs).toEqual([])
})

test('variáveis que mudam o que o processo carrega não recebem segredos', async ($, on) => {
  const s = stubs(on)
  for (const name of ['PATH', 'LD_PRELOAD', 'DYLD_INSERT_LIBRARIES', 'BASH_ENV', 'GIT_SSH_COMMAND', 'PRUMO_APPROVE']) {
    const r = await $.tool.call({ tool: TOOL, argv: ['psql'], secrets: { [name]: 'secret/x#y' } } as never)
    expect(r.deny).toContain(name)
  }
  expect(s.runs).toEqual([])
})

test('os guards do Bash correm com o payload sintético; um bloqueio recusa antes do gate e do Vault', async ($, on) => {
  const s = stubs(on, 0, { guards: { 'pre-tool-self-guard.sh': { exit: 2, stderr: '[prumo-base/self-guard] Bloqueado: comando que escreve\nmais' } } })
  const r = await $.tool.call({ tool: TOOL, argv: ['psql', '-c', 'select 1'], secrets: { PGPASSWORD: 'secret/x#y' } } as never)
  expect(r.deny).toContain('[prumo-base/self-guard] Bloqueado: comando que escreve')
  expect(s.runs.some(x => x.includes('pre-tool-approval-gate.sh') || x.includes('vault-read-field.sh'))).toBe(false)
  expect(JSON.parse(s.payloads[0] ?? '{}')).toEqual({ tool_name: 'Bash', tool_input: { command: "psql -c 'select 1'" }, cwd: '/p' })
  expect(ran(s)).toEqual([])
})

test('sem bloqueio, os quatro guards e o gate correm por esta ordem', async ($, on) => {
  const s = stubs(on)
  await $.tool.call({ tool: TOOL, argv: ['psql'], secrets: { PGPASSWORD: 'secret/x#y' } } as never)
  const hooks = s.runs.filter(x => x.includes('/hooks/')).map(x => x.split('/').pop())
  expect(hooks).toEqual(['pre-tool-self-guard.sh', 'pre-tool-secret-read.sh', 'pre-tool-workspace.sh', 'pre-tool-agent-readonly.sh', 'pre-tool-approval-gate.sh'])
})

test('um subagente leva o seu tipo ao agent-readonly; tipo desconhecido recusa', async ($, on) => {
  const s = stubs(on)
  on('state.get', { plugin: 'prumo-guard', key: 'agents' }, () => ({ value: { value: [{ id: 'ag1', type: 'prumo-secops:prumo-monitor-01', startedAt: 0 }], version: 1 } }))
  await $.tool.call({ tool: TOOL, argv: ['psql'], secrets: {}, agentId: 'ag1' } as never)
  expect(JSON.parse(s.payloads[0] ?? '{}').agent_type).toBe('prumo-secops:prumo-monitor-01')
  const r = await $.tool.call({ tool: TOOL, argv: ['psql'], secrets: {}, agentId: 'ag2' } as never)
  expect(r.deny).toContain('tipo desconhecido')
})

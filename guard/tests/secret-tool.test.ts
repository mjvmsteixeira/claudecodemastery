import { test, expect, mock } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'
import { stubStart } from './start-stubs.ts'
import type { PrumoGuardPending } from '../types'
import { approvalIdOf } from '../hooks/approval-parse.ts'

const gateDenial = (id: string) => `[prumo-secops/approval-gate] Operação N2 detectada:\n  x\n\napproval-id: ${id}\n`
const TOOL = 'mcp__prumo-guard__run_with_secret'
const GUARD = '/h/.prumo/guard.json'
const EXEC = '/h/.prumo/secret-exec.json'
const APPROVALS = '/h/.prumo/approvals/'
const ON = '{"secretExec":{"enabled":true}}'
// clock.now é 1_000_000 ms: agora = 1000 s; serve um expires em (1000, 1600].
const ONCE = 'level=N2\nexpires=1300\nscope=once\n'
const TTL = 'level=N2\nexpires=1500\nscope=ttl\n'

const res = (exitCode: number, stdout = '', stderr = '') => ({
  value: { exitCode, stdout, stderr, isStdoutTruncated: false, isStderrTruncated: false },
})

// O id da aprovação por chamada, calculado aqui sem passar pelo mod: sha256 de
// "run_with_secret\n" + JSON {argv, secrets ordenados por nome, cwd}.
async function callId(argv: string[], secrets: Array<[string, string]>, cwd: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`run_with_secret\n${JSON.stringify({ argv, secrets, cwd })}`))
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
}

type Opts = {
  versions?: string[]
  stderr?: string
  files?: Record<string, string>
  guards?: Record<string, { exit: number; stderr?: string }>
  gateId?: string
  // guard.json: por omissão liga o run_with_secret; null tira o ficheiro.
  guardJson?: string | null
  // Conteúdo de qualquer approvals/<id> sem entrada em `files`; null = não existe.
  approval?: string | null
}

function stubs(on: On, gateExit = 0, opts: Opts = {}) {
  const state = {
    pending: [] as PrumoGuardPending[],
    runs: [] as string[],
    envs: [] as Array<Record<string, string> | undefined>,
    cwds: [] as Array<string | undefined>,
    payloads: [] as string[],
    toasts: [] as string[],
    approvalReads: [] as string[],
    removed: [] as string[],
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
  if (opts.guardJson !== null && files[GUARD] === undefined) files[GUARD] = opts.guardJson ?? ON
  const approval = opts.approval === undefined ? ONCE : opts.approval
  const gone = new Set<string>()
  const approvalAt = (path: string): string | undefined => (gone.has(path) ? undefined : files[path] ?? approval ?? undefined)
  on('fs.read', (_$, e) => {
    if (e.path.startsWith(APPROVALS)) {
      state.approvalReads.push(e.path)
      const text = approvalAt(e.path)
      return text !== undefined ? { value: text } : { deny: 'ENOENT' }
    }
    return files[e.path] !== undefined ? { value: files[e.path] as string } : { deny: 'ENOENT' }
  })
  on('fs.exists', (_$, e) => ({ value: files[e.path] !== undefined }))
  on('fs.list', () => ({
    value: (opts.versions ?? ['0.14.0']).map(name => ({ name, kind: 'dir', size: 0, mtimeMs: 0, isLink: false })),
  }))
  on('process.run', async (_$, e) => {
    const a = e.argv.join(' ')
    if (e.argv[0] === 'rm') {
      const path = e.argv[e.argv.length - 1] as string
      const existed = approvalAt(path) !== undefined
      gone.add(path)
      state.removed.push(a)
      return res(existed || e.argv.includes('-f') ? 0 : 1)
    }
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
    state.cwds.push(e.init?.cwd)
    return res(0, 'ligado com p4ssw0rd', opts.stderr ?? '')
  })
  return state
}

const ran = (s: { runs: string[] }) => s.runs.filter(r => !r.startsWith('bash '))
const call = (argv: string[], secrets: Record<string, string> = {}, extra: Record<string, unknown> = {}) =>
  ({ tool: TOOL, argv, secrets, ...extra }) as never

// --- 1. desligado por omissão ---

async function registered($: Engine, on: On, guardJson: string | null): Promise<string[]> {
  mock.env(on, { HOME: '/h' })
  const regs: Array<{ name: string }> = []
  stubStart(on, { commands: [], tools: regs })
  on('fs.read', (_$, e) => (e.path === GUARD && guardJson !== null ? { value: guardJson } : { deny: 'ENOENT' }))
  on('ui.status', () => ({ value: undefined }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/h', surface: null, isInteractive: false })
  return regs.map(r => r.name)
}

test('sem guard.json o run_with_secret fica desligado: a tool não é registada', async ($, on) => {
  expect(await registered($, on, null)).not.toContain('run_with_secret')
})

test('secretExec.enabled false ou que não seja true não regista a tool', async ($, on) => {
  expect(await registered($, on, '{"secretExec":{"enabled":"true"}}')).not.toContain('run_with_secret')
})

test('secretExec.enabled true regista a tool run_with_secret', async ($, on) => {
  mock.env(on, { HOME: '/h' })
  const regs: Array<{ name: string; isDeferred?: boolean; inputSchema: { required?: string[] } }> = []
  stubStart(on, { commands: [], tools: regs })
  on('fs.read', (_$, e) => (e.path === GUARD ? { value: ON } : { deny: 'ENOENT' }))
  on('ui.status', () => ({ value: undefined }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/h', surface: null, isInteractive: false })
  const r = regs.find(x => x.name === 'run_with_secret')
  expect(r).toBeTruthy()
  expect(r?.isDeferred).toBe(false)
  expect(r?.inputSchema.required).toEqual(['argv', 'secrets'])
})

test('desligado, uma chamada é recusada sem tocar no Vault nem correr nada', async ($, on) => {
  const s = stubs(on, 0, { guardJson: null })
  const r = await $.tool.call(call(['psql', '-c', 'select 1'], { PGPASSWORD: 'secret/x#y' }))
  expect(r.deny).toContain('desligado')
  expect(r.deny).toContain('secretExec.enabled')
  expect(s.runs).toEqual([])
  expect(s.pending).toEqual([])
})

// --- 2. aprovação humana por chamada ---

test('sem aprovação, a chamada abre um pedido N2 com o id da chamada e recusa; nada corre', async ($, on) => {
  const s = stubs(on, 0, { approval: null })
  const r = await $.tool.call(call(['psql', '-c', 'select 1'], { PGPASSWORD: 'secret/projects/x#db_password' }))
  const id = await callId(['psql', '-c', 'select 1'], [['PGPASSWORD', 'secret/projects/x#db_password']], '/p')
  expect(r.deny).toContain('aprovação')
  expect(r.deny).toContain('exatamente a mesma chamada')
  expect(s.approvalReads).toEqual([`${APPROVALS}${id}`])
  expect(s.pending.length).toBe(1)
  expect(s.pending[0]?.id).toBe(id)
  expect(s.pending[0]?.level).toBe('N2')
  expect(s.runs.some(x => x.includes('vault-read-field.sh') || x.includes('pre-tool-approval-gate.sh'))).toBe(false)
  expect(ran(s)).toEqual([])
})

test('o pedido mostra o argv inteiro, as referências e o cwd, nunca valores', async ($, on) => {
  const s = stubs(on, 0, { approval: null })
  await $.tool.call(call(['psql', '-c', 'select 1;\nselect 2'], { PGPASSWORD: 'secret/x#y', A_TOKEN: 'secret/a#t' }))
  const line = s.pending[0]?.command ?? ''
  expect(line).toBe('run_with_secret ["psql","-c","select 1;\\nselect 2"] · segredos {"A_TOKEN":"secret/a#t","PGPASSWORD":"secret/x#y"} · cwd "/p"')
  expect(line).not.toContain('p4ssw0rd')
})

test('a ordem das referências não muda o id; outro cwd muda', async ($, on) => {
  const s = stubs(on, 0, { approval: null })
  on('fs.stat', () => ({ value: { kind: 'dir' as const, size: 0, mtimeMs: 0, isLink: false, realPath: '/p/sub' } }))
  await $.tool.call(call(['psql'], { B: 'secret/b#x', A: 'secret/a#x' }))
  await $.tool.call(call(['psql'], { A: 'secret/a#x', B: 'secret/b#x' }))
  expect(s.pending.length).toBe(1)
  await $.tool.call(call(['psql'], { A: 'secret/a#x', B: 'secret/b#x' }, { cwd: '/p/sub' }))
  expect(s.pending.length).toBe(2)
  expect(s.pending[1]?.id).toBe(await callId(['psql'], [['A', 'secret/a#x'], ['B', 'secret/b#x']], '/p/sub'))
})

test('aprovação "só esta": corre no cwd aprovado, apaga o ficheiro, e a chamada seguinte pede outra', async ($, on) => {
  const s = stubs(on)
  const r = await $.tool.call(call(['psql', '-c', 'select 1'], { PGPASSWORD: 'secret/projects/x#db_password' }))
  const id = await callId(['psql', '-c', 'select 1'], [['PGPASSWORD', 'secret/projects/x#db_password']], '/p')
  expect(String(r.result)).toContain('[SEGREDO:PGPASSWORD]')
  expect(String(r.result)).not.toContain('p4ssw0rd')
  expect(s.envs[0]).toEqual({ PGPASSWORD: 'p4ssw0rd' })
  expect(s.cwds[0]).toBe('/p')
  expect(s.removed).toEqual([`rm ${APPROVALS}${id}`])
  const again = await $.tool.call(call(['psql', '-c', 'select 1'], { PGPASSWORD: 'secret/projects/x#db_password' }))
  expect(again.deny).toContain('aprovação')
  expect(s.pending[0]?.id).toBe(id)
  expect(ran(s).length).toBe(1)
})

test('aprovação de 10 minutos: a mesma chamada corre outra vez sem apagar o ficheiro', async ($, on) => {
  const s = stubs(on, 0, { approval: TTL })
  await $.tool.call(call(['psql'], { PGPASSWORD: 'secret/x#y' }))
  await $.tool.call(call(['psql'], { PGPASSWORD: 'secret/x#y' }))
  expect(ran(s).length).toBe(2)
  expect(s.removed).toEqual([])
})

for (const [why, text] of [
  ['expirada', 'level=N2\nexpires=999\nscope=once\n'],
  ['de outro nível', 'level=N1\nexpires=1300\nscope=once\n'],
  ['para lá de 10 minutos', 'level=N2\nexpires=1601\nscope=ttl\n'],
  ['com scope estranho', 'level=N2\nexpires=1300\nscope=sempre\n'],
  ['com expires que não é um inteiro', 'level=N2\nexpires=13e2\nscope=once\n'],
] as const) {
  test(`aprovação ${why} é apagada e não serve`, async ($, on) => {
    const s = stubs(on, 0, { approval: text })
    const r = await $.tool.call(call(['psql'], { PGPASSWORD: 'secret/x#y' }))
    const id = await callId(['psql'], [['PGPASSWORD', 'secret/x#y']], '/p')
    expect(r.deny).toContain('aprovação')
    expect(s.removed).toEqual([`rm -f ${APPROVALS}${id}`])
    expect(s.pending[0]?.id).toBe(id)
    expect(ran(s)).toEqual([])
  })
}

test('o pedido aprovado pela pessoa (ficheiro com esse id) deixa correr a repetição', async ($, on) => {
  const files: Record<string, string> = {}
  const s = stubs(on, 0, { approval: null, files })
  await $.tool.call(call(['curl', '-s', 'https://api.x/v1'], { TOKEN: 'secret/api#token' }))
  files[`${APPROVALS}${s.pending[0]?.id}`] = ONCE
  const r = await $.tool.call(call(['curl', '-s', 'https://api.x/v1'], { TOKEN: 'secret/api#token' }))
  expect(String(r.result)).toContain('exit 0')
  expect(ran(s)).toEqual(['curl -s https://api.x/v1'])
})

test('approval-gate bloqueia depois da aprovação por chamada: pedido do gate, a aprovação da chamada fica', async ($, on) => {
  const s = stubs(on, 2)
  const r = await $.tool.call(call(['psql', '-c', 'select 1'], { PGPASSWORD: 'secret/x#y' }))
  expect(r.deny).toContain('aprovação')
  expect(s.pending.length).toBe(1)
  expect(s.pending[0]?.id).toBe(await approvalIdOf("psql -c 'select 1'"))
  expect(s.pending[0]?.command).toBe("psql -c 'select 1'")
  expect(s.removed).toEqual([])
  expect(s.runs.some(r => r.includes('vault-read-field.sh'))).toBe(false)
  expect(ran(s)).toEqual([])
})

test('uma chamada que não cabe no painel de aprovação é recusada sem pedido', async ($, on) => {
  const s = stubs(on, 0, { approval: null })
  const r = await $.tool.call(call(['psql', '-c', `select '${'x'.repeat(400)}'`], { PGPASSWORD: 'secret/x#y' }))
  expect(r.deny).toContain('painel')
  expect(s.pending).toEqual([])
  expect(s.runs).toEqual([])
})

test('o pedido de um subagente leva o agentId', async ($, on) => {
  const s = stubs(on, 0, { approval: null })
  on('state.get', { plugin: 'prumo-guard', key: 'agents' }, () => ({ value: { value: [{ id: 'ag1', type: 'general-purpose', startedAt: 0 }], version: 1 } }))
  await $.tool.call(call(['psql'], {}, { agentId: 'ag1' }))
  expect(s.pending[0]?.agentId).toBe('ag1')
})

test('uma referência inválida recusa antes de pedir aprovação', async ($, on) => {
  const s = stubs(on, 0, { approval: null })
  const r = await $.tool.call(call(['psql'], { PGPASSWORD: 'sem-campo' }))
  expect(r.deny).toContain('referência inválida')
  expect(s.pending).toEqual([])
  expect(s.runs).toEqual([])
})

// --- 3. allowlist por omissão e clientes de risco ---

test('por omissão só psql, mysql, curl e gh', async ($, on) => {
  const s = stubs(on)
  for (const argv of [['git', 'status'], ['docker', 'ps'], ['kubectl', 'get', 'pods'], ['redis-cli', 'ping'], ['mongosh', '--eval', 'process.env']]) {
    const r = await $.tool.call(call(argv, { T: 'secret/x#y' }))
    expect(r.deny).toContain('allowlist')
  }
  for (const argv of [['psql'], ['mysql'], ['curl', 'https://x'], ['gh', 'api', 'user']]) {
    const r = await $.tool.call(call(argv, { T: 'secret/x#y' }))
    expect(String(r.result)).toContain('exit 0')
  }
  expect(ran(s)).toEqual(['psql', 'mysql', 'curl https://x', 'gh api user'])
})

test('git, docker, kubectl e mongosh listados no allow só correm com allowRisky', async ($, on) => {
  const s = stubs(on, 0, { files: { [EXEC]: '{"allow":["git","mongosh","docker","kubectl"]}' } })
  for (const argv of [['git', 'status'], ['mongosh', 'db'], ['docker', 'ps'], ['kubectl', 'get', 'pods']]) {
    const r = await $.tool.call(call(argv))
    expect(r.deny).toContain('allowRisky')
  }
  expect(s.runs).toEqual([])
})

test('com allowRisky true um cliente de risco listado corre', async ($, on) => {
  const s = stubs(on, 0, { files: { [EXEC]: '{"allow":["git"],"allowRisky":true}' } })
  const r = await $.tool.call(call(['git', 'status']))
  expect(String(r.result)).toContain('exit 0')
  expect(ran(s)).toEqual(['git status'])
})

test('allowRisky que não é booleano torna o secret-exec.json inválido', async ($, on) => {
  const s = stubs(on, 0, { files: { [EXEC]: '{"allow":["git"],"allowRisky":"sim"}' } })
  const r = await $.tool.call(call(['git', 'status']))
  expect(r.deny).toContain('secret-exec.json inválido')
  expect(s.runs).toEqual([])
})

test('psql e mysql: qualquer \\! e o meta-comando system recusam', async ($, on) => {
  const s = stubs(on)
  for (const argv of [['mysql', '-e', 'do 1\\!id'], ['psql', '-c', 'system id'], ['mysql', '-e', 'select 1;system id']]) {
    const r = await $.tool.call(call(argv, { P: 'secret/x#y' }))
    expect(r.deny).toContain('correr código')
  }
  expect(s.runs).toEqual([])
})

// --- o resto do caminho ---

test('shell recusado sem tocar no Vault', async ($, on) => {
  const s = stubs(on)
  const r = await $.tool.call(call(['bash', '-c', 'echo $X'], { X: 'secret/a#b' }))
  expect(r.deny).toContain('interpretador')
  expect(s.runs).toEqual([])
})

test('recusa do gate com o id de outro comando não abre pedido', async ($, on) => {
  const s = stubs(on, 2, { gateId: 'e'.repeat(64) })
  const r = await $.tool.call(call(['psql', '-c', 'select 1']))
  expect(r.deny).toContain('approval-gate')
  expect(s.pending.length).toBe(0)
})

test('mascara o segredo também no stderr', async ($, on) => {
  stubs(on, 0, { stderr: 'erro: password p4ssw0rd rejeitada' })
  const r = await $.tool.call(call(['psql'], { PGPASSWORD: 'secret/x#y' }))
  expect(String(r.result)).toContain('stderr:\nerro: password [SEGREDO:PGPASSWORD] rejeitada')
})

test('latestPluginDir escolhe a versão mais alta numericamente', async ($, on) => {
  const s = stubs(on, 0, { versions: ['0.9.3', '0.12.0', '0.2.0'] })
  await $.tool.call(call(['psql'], { PGPASSWORD: 'secret/x#y' }))
  expect(s.runs.some(r => r.includes('/prumo-base/0.12.0/lib/vault-read-field.sh'))).toBe(true)
})

test('caminho em argv[0] recusado sem tocar no Vault', async ($, on) => {
  const s = stubs(on)
  const r = await $.tool.call(call(['./psql'], { X: 'secret/a#b' }))
  expect(r.deny).toContain('caminho')
  expect(s.runs).toEqual([])
})

test('secret-exec.json com JSON inválido recusa em vez de cair na allowlist por omissão, e avisa uma vez', async ($, on) => {
  const s = stubs(on, 0, { files: { [EXEC]: '{"allow":["psql"],}' } })
  const r = await $.tool.call(call(['curl', 'https://x'], { T: 'secret/k#t' }))
  expect(r.deny).toContain('secret-exec.json inválido')
  await $.tool.call(call(['curl', 'https://x'], { T: 'secret/k#t' }))
  expect(s.toasts.filter(t => t.includes('secret-exec.json')).length).toBe(1)
  expect(s.runs).toEqual([])
})

test('secret-exec.json com allow que não é uma lista recusa', async ($, on) => {
  const s = stubs(on, 0, { files: { [EXEC]: '{"allow":"psql"}' } })
  const r = await $.tool.call(call(['curl', 'https://x']))
  expect(r.deny).toContain('secret-exec.json inválido')
  expect(s.runs).toEqual([])
})

test('secret-exec.json válido e restrito continua a recusar o que não lista', async ($, on) => {
  const s = stubs(on, 0, { files: { [EXEC]: '{"allow":["psql"]}' } })
  const r = await $.tool.call(call(['curl', 'https://x']))
  expect(r.deny).toContain('allowlist')
  expect(s.runs).toEqual([])
})

test('formas conhecidas de correr código com um cliente listado são recusadas, mesmo com allowRisky', async ($, on) => {
  const s = stubs(on, 0, { files: { [EXEC]: '{"allow":["git","docker","kubectl","curl"],"allowRisky":true}' } })
  for (const argv of [
    ['git', '-c', 'alias.x=!printf %s "$DBPASS" | base64', 'x'],
    ['git', 'config', 'alias.x', '!sh'],
    ['docker', 'run', '--rm', '-v', '/:/host', 'img', 'sh'],
    ['kubectl', 'exec', 'pod', '--', 'sh'],
    ['curl', '-K', 'agent.conf', 'https://x'],
  ]) {
    const r = await $.tool.call(call(argv, { DBPASS: 'secret/x#y' }))
    expect(r.deny).toContain('correr código')
  }
  expect(s.runs).toEqual([])
})

test('argumentos ou cwd em ~/.prumo e nos settings do Claude Code são recusados', async ($, on) => {
  const s = stubs(on)
  on('fs.stat', () => ({ value: { kind: 'dir' as const, size: 0, mtimeMs: 0, isLink: false, realPath: '/h/.prumo' } }))
  const a = await $.tool.call(call(['curl', '-s', '-o', '/h/.prumo/mode', 'file:///tmp/x']))
  expect(a.deny).toContain('/h/.prumo/mode')
  const b = await $.tool.call(call(['curl', '--output=/h/.prumo/approvals/abc', 'file:///tmp/x']))
  expect(b.deny).toContain('só a pessoa muda')
  const c = await $.tool.call(call(['curl', '-o', '/p/.claude/settings.local.json', 'file:///tmp/x']))
  expect(c.deny).toContain('settings')
  const d = await $.tool.call(call(['curl', '-o', 'mode', 'file:///tmp/x'], {}, { cwd: '/p/ligacao' }))
  expect(d.deny).toContain('diretório protegido')
  expect(s.runs).toEqual([])
})

test('variáveis que mudam o que o processo carrega não recebem segredos', async ($, on) => {
  const s = stubs(on)
  for (const name of ['PATH', 'LD_PRELOAD', 'DYLD_INSERT_LIBRARIES', 'BASH_ENV', 'GIT_SSH_COMMAND', 'PRUMO_APPROVE']) {
    const r = await $.tool.call(call(['psql'], { [name]: 'secret/x#y' }))
    expect(r.deny).toContain(name)
  }
  expect(s.runs).toEqual([])
})

test('os guards do Bash correm com o payload sintético; um bloqueio recusa antes da aprovação, do gate e do Vault', async ($, on) => {
  const s = stubs(on, 0, { approval: null, guards: { 'pre-tool-self-guard.sh': { exit: 2, stderr: '[prumo-base/self-guard] Bloqueado: comando que escreve\nmais' } } })
  const r = await $.tool.call(call(['psql', '-c', 'select 1'], { PGPASSWORD: 'secret/x#y' }))
  expect(r.deny).toContain('[prumo-base/self-guard] Bloqueado: comando que escreve')
  expect(s.runs.some(x => x.includes('pre-tool-approval-gate.sh') || x.includes('vault-read-field.sh'))).toBe(false)
  expect(s.pending).toEqual([])
  expect(JSON.parse(s.payloads[0] ?? '{}')).toEqual({ tool_name: 'Bash', tool_input: { command: "psql -c 'select 1'" }, cwd: '/p' })
  expect(ran(s)).toEqual([])
})

test('sem bloqueio, os quatro guards e o gate correm por esta ordem', async ($, on) => {
  const s = stubs(on)
  await $.tool.call(call(['psql'], { PGPASSWORD: 'secret/x#y' }))
  const hooks = s.runs.filter(x => x.includes('/hooks/')).map(x => x.split('/').pop())
  expect(hooks).toEqual(['pre-tool-self-guard.sh', 'pre-tool-secret-read.sh', 'pre-tool-workspace.sh', 'pre-tool-agent-readonly.sh', 'pre-tool-approval-gate.sh'])
})

test('um subagente leva o seu tipo ao agent-readonly; tipo desconhecido recusa', async ($, on) => {
  const s = stubs(on)
  on('state.get', { plugin: 'prumo-guard', key: 'agents' }, () => ({ value: { value: [{ id: 'ag1', type: 'prumo-secops:prumo-monitor-01', startedAt: 0 }], version: 1 } }))
  await $.tool.call(call(['psql'], {}, { agentId: 'ag1' }))
  expect(JSON.parse(s.payloads[0] ?? '{}').agent_type).toBe('prumo-secops:prumo-monitor-01')
  const r = await $.tool.call(call(['psql'], {}, { agentId: 'ag2' }))
  expect(r.deny).toContain('tipo desconhecido')
})

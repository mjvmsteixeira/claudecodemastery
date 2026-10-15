import { test, expect, mock } from 'claude-code/testing'
import type { On } from 'claude-code'
import { approvalIdOf, sha256Hex } from '../hooks/approval-parse.ts'
import { cmd } from './start-stubs.ts'
import type { PrumoGuardApproval } from '../types'
import { parseRulesFile } from '../hooks/rules.tsx'

const H = 'a'.repeat(64)
const LEVEL = { id: 'r-0123456789ab', kind: 'level', level: 'N1', createdAt: '2026-10-15T15:00:00.000Z' }
const COMMAND = { id: 'r-ba9876543210', kind: 'command', level: 'N1', commandId: H, command: 'git push -f', createdAt: '2026-10-15T15:01:00.000Z' }
const file = (rules: unknown[], project = '/p') => JSON.stringify({ project, rules })

test('parseRulesFile aceita regras level e command do projeto certo', () => {
  expect(parseRulesFile(file([LEVEL, COMMAND]), '/p')).toEqual([LEVEL, COMMAND])
  expect(parseRulesFile(file([]), '/p')).toEqual([])
})

test('parseRulesFile recusa o ficheiro inteiro quando algo não bate', () => {
  expect(parseRulesFile('{', '/p')).toBeNull()
  expect(parseRulesFile(file([LEVEL], '/outro'), '/p')).toBeNull()
  expect(parseRulesFile(file([{ ...LEVEL, level: 'N2' }]), '/p')).toBeNull()
  expect(parseRulesFile(file([{ ...COMMAND, commandId: 'abc' }]), '/p')).toBeNull()
  expect(parseRulesFile(file([{ ...LEVEL, id: 'x' }]), '/p')).toBeNull()
  expect(parseRulesFile(file([{ ...LEVEL, kind: 'path' }]), '/p')).toBeNull()
  expect(parseRulesFile(JSON.stringify({ project: '/p', rules: 'x' }), '/p')).toBeNull()
})

const PROJECT = '/p'
const GATE = '/h/.claude/plugins/cache/prumo/prumo-secops/1.0.1/hooks/pre-tool-approval-gate.sh'
const BAND = { plugin: 'prumo-guard', surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 12, bodyColumns: 80, scroll: { offset: 0, bodyRows: 12 }, view: {} } } as const
const PANE = { plugin: 'prumo-guard', surface: 'terminal', component: 'Pane', props: { title: 'prumo · regras do projeto', isFocused: true, bodyColumns: 80, placement: 'inline', scroll: { offset: 0, bodyRows: 12 }, view: {} }, requestId: 'prumo-guard-rules' } as const
const N1 = 'git push --force origin feature'
const N1B = 'git push --force origin outra'
const N2 = 'psql -c "DROP TABLE x"'
const banner = (level: string, id: string) => `[prumo-secops/approval-gate] Operação ${level} detectada:\n  x\n\napproval-id: ${id}\n`
const res = (exitCode: number, stdout = '', stderr = '') => ({ value: { exitCode, stdout, stderr, isStdoutTruncated: false, isStderrTruncated: false } })

type World = {
  files: Record<string, string>
  levels: Record<string, string>
  gateRuns: number
  reached: number
  toasts: string[]
  status: string
  opened: Array<{ id: string; focus?: boolean }>
  gateMissing?: boolean
  gateExit?: number
  mkdirFails?: boolean
  writeFails?: boolean
  denyCommand?: string
  failCommand?: string
}

async function rulesFileOf(project = PROJECT): Promise<string> {
  return `/h/.prumo/rules/${await sha256Hex(project)}.json`
}

// O motor, o approval-gate e a execução. O gate (tool.call de baixo e o `bash <gate>` da
// classificação) dá o nível de `levels`; um comando fora de `levels` passa. Com um
// approvals/<id> do nível certo, o tool.call passa e apaga o ficheiro, como o gate faz.
function world(on: On, w: Partial<World> = {}): World {
  const s: World = { files: {}, levels: {}, gateRuns: 0, reached: 0, toasts: [], status: '', opened: [], ...w }
  mock.env(on, { HOME: '/h' })
  on('clock.now', () => ({ value: 1_000_000 }))
  on('clock.every', () => ({ deny: 'sem relógio no teste' }))
  on('session.cwd', () => ({ value: PROJECT }))
  on('session.id', () => ({ value: 'sid-test' }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('tool.register', () => ({ value: { tool: 'x' } }))
  on('fs.list', () => ({ value: s.gateMissing ? [] : [{ name: '1.0.1', kind: 'dir', size: 0, mtimeMs: 0, isLink: false }] }))
  on('fs.read', (_$, e) => (s.files[e.path] !== undefined ? { value: s.files[e.path] as string } : { deny: 'ENOENT' }))
  on('fs.stat', (_$, e) => (s.files[e.path] !== undefined ? { value: { kind: 'file' as const, size: 1, mtimeMs: 0, isLink: false } } : { deny: 'ENOENT' }))
  on('fs.exists', (_$, e) => ({ value: s.files[e.path] !== undefined }))
  on('fs.write', (_$, e) => { if (s.writeFails && e.path.includes('/approvals/')) return { deny: 'EIO' }; s.files[e.path] = e.text; return { value: undefined } })
  on('process.run', async (_$, e) => {
    const [bin, ...rest] = e.argv
    if (bin === 'sh') return res(0, `${PROJECT}\n`)
    if (bin === 'mkdir') return s.mkdirFails ? res(1, '', 'mkdir: falhou') : res(0)
    if (bin === 'rm') { delete s.files[rest[rest.length - 1] as string]; return res(0) }
    if (bin === 'bash' && rest[0] === GATE) {
      s.gateRuns++
      if (s.gateExit !== undefined) return res(s.gateExit)
      const command = JSON.parse(String(e.init?.stdin)).tool_input.command as string
      const level = s.levels[command]
      const af = `/h/.prumo/approvals/${await approvalIdOf(command)}`
      if (level && s.files[af]?.includes(`level=${level}`)) {
        if (s.files[af]?.includes('scope=once')) delete s.files[af]
        return res(0)
      }
      return level ? res(2, '', banner(level, await approvalIdOf(command))) : res(0)
    }
    return res(0, 'host')
  })
  on('ui.toast', (_$, e) => { s.toasts.push(e.text); return { value: undefined } })
  on('ui.notify', () => ({ value: { isSent: true, channel: 'terminal_bell' } }))
  on('ui.status', (_$, e) => { s.status = e.text ?? ''; return { value: undefined } })
  on('ui.open', (_$, e) => { s.opened.push({ id: e.id, focus: e.focus }); return { value: { isPlaced: true } } })
  on('ui.close', () => ({ value: undefined }))
  on('session.append', (_$, e, next) => next(e))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('ui.render', { component: 'AbovePrompt' }, () => ({ type: 'Text', children: ['sem painel'] }))
  on('tool.call', async (_$, e) => {
    s.reached++
    const command = (e as unknown as { command: string }).command
    if (s.denyCommand === command) return { deny: 'x' }
    if (s.failCommand === command) return { result: '', text: 'erro', isError: true }
    const id = await approvalIdOf(command)
    const file = `/h/.prumo/approvals/${id}`
    const level = s.levels[command]
    if (!level) return { result: 'feito', text: 'feito' }
    if (s.files[file]?.includes(`level=${level}`)) { delete s.files[file]; return { result: 'feito', text: 'feito' } }
    return { result: '', text: banner(level, id), isError: true }
  })
  return s
}

const start = ($: { session: { start: (i: { cwd: string; surface: null; isInteractive: boolean }) => Promise<unknown> } }) =>
  $.session.start({ cwd: PROJECT, surface: null, isInteractive: false })

test('o arranque oferece as regras do ficheiro na band e não as ativa', async ($, on) => {
  const s = world(on, { levels: { [N1]: 'N1' } })
  s.files[await rulesFileOf()] = JSON.stringify({ project: PROJECT, rules: [LEVEL] })
  await start($)
  const band = await $.ui.mount(BAND)
  expect(await band.find({ text: /regra do projeto/ })).toBeDefined()
  expect(await band.find({ text: /todos os N1 neste projeto/ })).toBeDefined()
  expect(await band.find({ text: /sem Enter/ })).toBeDefined()
  await band.unmount()
  const r = await $.tool.call({ tool: 'Bash', command: N1 })
  expect(r.isError).toBe(true)
  expect(s.gateRuns).toBe(0)
})

test('1 ativa a regra oferecida e a linha de estado conta-a', async ($, on) => {
  const s = world(on)
  s.files[await rulesFileOf()] = JSON.stringify({ project: PROJECT, rules: [LEVEL] })
  await start($)
  const band = await $.ui.mount(BAND)
  await band.press({ key: 'rule-activate' })
  expect(s.status).toContain('regras N1: 1 ativa(s)')
  expect(await band.find({ text: /sem painel/ })).toBeDefined()
  await band.unmount()
})

test('2 deixa a regra no ficheiro; 3 apaga-a', async ($, on) => {
  const s = world(on)
  const path = await rulesFileOf()
  s.files[path] = JSON.stringify({ project: PROJECT, rules: [LEVEL, COMMAND] })
  await start($)
  const band = await $.ui.mount(BAND)
  await band.press({ key: 'rule-later' })
  expect(parseRulesFile(s.files[path] as string, PROJECT)).toHaveLength(2)
  await band.press({ key: 'rule-revoke' })
  expect(parseRulesFile(s.files[path] as string, PROJECT)).toEqual([LEVEL])
  expect(s.status).not.toContain('regras N1')
  await band.unmount()
})

test('um ficheiro de regras inválido é ignorado com aviso', async ($, on) => {
  const s = world(on)
  s.files[await rulesFileOf()] = '{"project":"/p","rules":[{"id":"x"}]}'
  await start($)
  expect(s.toasts.some(t => t.includes('inválido'))).toBe(true)
  const band = await $.ui.mount(BAND)
  expect(await band.find({ text: /sem painel/ })).toBeDefined()
  await band.unmount()
})

const rulesIn = async (s: World) => parseRulesFile(s.files[await rulesFileOf()] as string, PROJECT) ?? []

test('em N1 a band mostra as opções 4 e 5', async ($, on) => {
  world(on, { levels: { [N1]: 'N1' } })
  await $.tool.call({ tool: 'Bash', command: N1 })
  const band = await $.ui.mount(BAND)
  expect(await band.findAll({ type: 'Button' })).toHaveLength(5)
  expect(await band.find({ text: /Todos os N1 neste projeto/ })).toBeDefined()
  await band.unmount()
})

test('em N2 não há opções 4 e 5', async ($, on) => {
  world(on, { levels: { [N2]: 'N2' } })
  await $.tool.call({ tool: 'Bash', command: N2 })
  const band = await $.ui.mount(BAND)
  expect(await band.findAll({ type: 'Button' })).toHaveLength(3)
  await band.unmount()
})

test('5 grava a regra level, ativa-a e aprova o comando atual uma vez', async ($, on) => {
  const s = world(on, { levels: { [N1]: 'N1' } })
  await $.tool.call({ tool: 'Bash', command: N1 })
  const band = await $.ui.mount(BAND)
  await band.press({ key: 'rule-level' })
  await band.unmount()
  const rules = await rulesIn(s)
  expect(rules).toHaveLength(1)
  expect(rules[0]?.kind).toBe('level')
  expect(s.files[`/h/.prumo/approvals/${await approvalIdOf(N1)}`]).toContain('scope=once')
  expect(s.status).toContain('regras N1: 1 ativa(s)')
})

test('4 grava a regra command com o id do pedido', async ($, on) => {
  const s = world(on, { levels: { [N1]: 'N1' } })
  await $.tool.call({ tool: 'Bash', command: N1 })
  const band = await $.ui.mount(BAND)
  await band.press({ key: 'rule-command' })
  await band.unmount()
  const rules = await rulesIn(s)
  expect(rules[0]).toMatchObject({ kind: 'command', commandId: await approvalIdOf(N1), command: N1 })
})

test('com um pedido e uma regra por decidir, a band mostra o pedido', async ($, on) => {
  const s = world(on, { levels: { [N1]: 'N1' } })
  s.files[await rulesFileOf()] = JSON.stringify({ project: PROJECT, rules: [LEVEL] })
  await start($)
  await $.tool.call({ tool: 'Bash', command: N1 })
  const band = await $.ui.mount(BAND)
  expect(await band.find({ text: /aprovação N1/ })).toBeDefined()
  expect(await band.find({ text: /regra do projeto/ })).toBeUndefined()
  await band.press({ key: 'deny' })
  expect(await band.find({ text: /regra do projeto/ })).toBeDefined()
  await band.unmount()
})

// Cria uma regra pela opção 4 ou 5 no primeiro pedido de `command`.
// `$` como any: o kit não exporta o tipo do `$` dos testes.
async function createRule($: any, command: string, key: 'rule-level' | 'rule-command') { // eslint-disable-line @typescript-eslint/no-explicit-any
  await $.tool.call({ tool: 'Bash', command })
  const band = await $.ui.mount(BAND)
  await band.press({ key })
  await band.unmount()
}

test('com uma regra level ativa, um N1 novo corre sem pedido e com nota', async ($, on) => {
  const s = world(on, { levels: { [N1]: 'N1', [N1B]: 'N1' } })
  await createRule($, N1, 'rule-level')
  const r = await $.tool.call({ tool: 'Bash', command: N1B })
  expect(r.isError).toBeUndefined()
  expect(String(r.context ?? '')).toContain('regra do projeto')
  expect(s.status).not.toContain('pendente')
})

test('um N2 não é aprovado por uma regra level', async ($, on) => {
  const s = world(on, { levels: { [N1]: 'N1', [N2]: 'N2' } })
  await createRule($, N1, 'rule-level')
  const r = await $.tool.call({ tool: 'Bash', command: N2 })
  expect(r.isError).toBe(true)
  expect(s.status).toContain('1 aprovação(ões) pendente(s)')
})

test('uma regra command só aprova o mesmo comando', async ($, on) => {
  world(on, { levels: { [N1]: 'N1', [N1B]: 'N1' } })
  await createRule($, N1, 'rule-command')
  expect((await $.tool.call({ tool: 'Bash', command: N1 })).isError).toBeUndefined() // gasta a aprovação humana de createRule
  expect((await $.tool.call({ tool: 'Bash', command: N1B })).isError).toBe(true)
  const r = await $.tool.call({ tool: 'Bash', command: N1 })
  expect(r.isError).toBeUndefined()
  expect(String(r.context ?? '')).toContain('regra do projeto')
})

test('sem regras ativas o gate não corre a mais', async ($, on) => {
  const s = world(on, { levels: { [N1]: 'N1' } })
  await $.tool.call({ tool: 'Bash', command: N1 })
  expect(s.gateRuns).toBe(0)
})

test('um comando que o gate deixa passar não escreve aprovação nem nota', async ($, on) => {
  const s = world(on, { levels: { [N1]: 'N1' } })
  await createRule($, N1, 'rule-level')
  const before = Object.keys(s.files).filter(k => k.includes('/approvals/')).length
  const r = await $.tool.call({ tool: 'Bash', command: 'ls -la' })
  expect(String(r.context ?? '')).not.toContain('regra do projeto')
  expect(Object.keys(s.files).filter(k => k.includes('/approvals/')).length).toBe(before)
})

test('com o gate a sair 1 ou em falta, abre-se o pedido normal', async ($, on) => {
  const s = world(on, { levels: { [N1]: 'N1', [N1B]: 'N1' } })
  await createRule($, N1, 'rule-level')
  s.gateExit = 1
  expect((await $.tool.call({ tool: 'Bash', command: N1B })).isError).toBe(true)
  s.gateExit = undefined
  s.gateMissing = true
  expect((await $.tool.call({ tool: 'Bash', command: N1B })).isError).toBe(true)
})

test('um ficheiro alterado depois da ativação não muda a regra ativa', async ($, on) => {
  const s = world(on, { levels: { [N1]: 'N1', [N1B]: 'N1' } })
  const path = await rulesFileOf()
  const only = { ...COMMAND, commandId: await approvalIdOf(N1), command: N1 }
  s.files[path] = JSON.stringify({ project: PROJECT, rules: [only] })
  await start($)
  const band = await $.ui.mount(BAND)
  await band.press({ key: 'rule-activate' })
  await band.unmount()
  s.files[path] = JSON.stringify({ project: PROJECT, rules: [LEVEL] })
  expect((await $.tool.call({ tool: 'Bash', command: N1B })).isError).toBe(true)
  expect((await $.tool.call({ tool: 'Bash', command: N1 })).isError).toBeUndefined()
})

test('se a escrita de rules/ falhar, a regra vale nesta sessão', async ($, on) => {
  const s = world(on, { levels: { [N1]: 'N1', [N1B]: 'N1' }, mkdirFails: true })
  await createRule($, N1, 'rule-level')
  expect(s.toasts.some(t => t.includes('só nesta sessão'))).toBe(true)
  expect((await $.tool.call({ tool: 'Bash', command: N1B })).isError).toBeUndefined()
})

test('a aprovação da regra fica gasta no registo', async ($, on) => {
  let records: PrumoGuardApproval[] = []
  on('state.set', { plugin: 'prumo-guard', key: 'approvals' }, (_$, e, next) => {
    records = e.value as PrumoGuardApproval[]
    return next(e)
  })
  world(on, { levels: { [N1]: 'N1', [N1B]: 'N1' } })
  await createRule($, N1, 'rule-level')
  await $.tool.call({ tool: 'Bash', command: N1 })
  await $.tool.call({ tool: 'Bash', command: N1B })
  const id = await approvalIdOf(N1B)
  expect(records.find(r => r.id === id)?.used).toBe(true)
})

test('depois de uma aprovação por regra que o gate nega, não sobra ficheiro', async ($, on) => {
  const s = world(on, { levels: { [N1]: 'N1', [N1B]: 'N1' } })
  await createRule($, N1, 'rule-level')
  s.denyCommand = N1B
  await $.tool.call({ tool: 'Bash', command: N1B })
  expect(s.files[`/h/.prumo/approvals/${await approvalIdOf(N1B)}`]).toBeUndefined()
})

test('se a escrita da aprovação falhar, o pedido humano abre-se como hoje', async ($, on) => {
  let records: PrumoGuardApproval[] = []
  on('state.set', { plugin: 'prumo-guard', key: 'approvals' }, (_$, e, next) => {
    records = e.value as PrumoGuardApproval[]
    return next(e)
  })
  const idOfB = await approvalIdOf(N1B)
  const s = world(on, { levels: { [N1]: 'N1', [N1B]: 'N1' } })
  await createRule($, N1, 'rule-level')
  s.writeFails = true
  const reached = s.reached
  const r = await $.tool.call({ tool: 'Bash', command: N1B })
  expect(r.deny).toBeUndefined()
  expect(r.isError).toBe(true)
  expect(s.reached).toBe(reached + 1)
  expect(s.status).toContain('pendente')
  const usable = records.filter(r => r.id === idOfB && r.scope === 'once' && !r.used)
  expect(usable).toEqual([])
})

test('depois de uma aprovação por regra que dá erro, não sobra ficheiro', async ($, on) => {
  const s = world(on, { levels: { [N1]: 'N1', [N1B]: 'N1' } })
  await createRule($, N1, 'rule-level')
  s.failCommand = N1B
  const r = await $.tool.call({ tool: 'Bash', command: N1B })
  expect(r.isError).toBe(true)
  expect(s.files[`/h/.prumo/approvals/${await approvalIdOf(N1B)}`]).toBeUndefined()
})

test('com uma regra ativa, a aprovação humana de uma vez de um N2 continua a servir', async ($, on) => {
  const s = world(on, { levels: { [N1]: 'N1', [N2]: 'N2' } })
  await createRule($, N1, 'rule-level')
  expect((await $.tool.call({ tool: 'Bash', command: N2 })).isError).toBe(true)
  const band = await $.ui.mount(BAND)
  await band.press({ key: 'once' })
  await band.unmount()
  expect(s.files[`/h/.prumo/approvals/${await approvalIdOf(N2)}`]).toContain('scope=once')
  expect((await $.tool.call({ tool: 'Bash', command: N2 })).isError).toBeUndefined()
})

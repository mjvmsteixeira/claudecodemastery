import { test, expect, mock } from 'claude-code/testing'
import type { On } from 'claude-code'
import { approvalIdOf, sha256Hex } from '../hooks/approval-parse.ts'
import { cmd } from './start-stubs.ts'
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
  on('fs.write', (_$, e) => { s.files[e.path] = e.text; return { value: undefined } })
  on('process.run', async (_$, e) => {
    const [bin, ...rest] = e.argv
    if (bin === 'sh') return res(0, `${PROJECT}\n`)
    if (bin === 'mkdir') return s.mkdirFails ? res(1, '', 'mkdir: falhou') : res(0)
    if (bin === 'rm') { delete s.files[rest[rest.length - 1] as string]; return res(0) }
    if (bin === 'bash' && rest[0] === GATE) {
      s.gateRuns++
      if (s.gateExit !== undefined) return res(s.gateExit)
      const command = JSON.parse(String(e.stdin)).tool_input.command as string
      const level = s.levels[command]
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

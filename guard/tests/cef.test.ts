import { test, expect, mock } from 'claude-code/testing'
import type { On } from 'claude-code'
import { cefLine, verdictOf } from '../hooks/cef.ts'
import { cmd } from './start-stubs.ts'

test('veredictos', () => {
  expect(verdictOf({ text: 'ok' })).toEqual({ verdict: 'allow', hook: '' })
  expect(verdictOf({ deny: 'x' })).toEqual({ verdict: 'deny', hook: 'plugin' })
  expect(verdictOf({ isError: true, text: 'hook error: [prumo-secops/approval-gate] Operação N1' })).toEqual({ verdict: 'blocked', hook: 'prumo-secops/approval-gate' })
  expect(verdictOf({ isError: true, text: '[pretool-bash-guard] Comando bloqueado' })).toEqual({ verdict: 'blocked', hook: 'pretool-bash-guard' })
  expect(verdictOf({ isError: false, text: 'Bash ran, and a plugin withheld its result: x' })).toEqual({ verdict: 'withheld', hook: 'plugin' })
})

test('um erro sem etiqueta de hook continua a ser allow', () => {
  expect(verdictOf({ isError: true, text: 'ENOENT: no such file' })).toEqual({ verdict: 'allow', hook: '' })
})

test('linha CEF escapada e com os campos novos', () => {
  const line = cefLine({ host: 'h', user: 'u', tool: 'Bash', agent: 'main', session: 's|1', inputHash: 'ab', verdict: 'blocked', hook: 'prumo-secops/approval-gate', iteration: 7 })
  expect(line.startsWith('CEF:0|prumo|SecOps-Agents|1.0|toolcall|Claude Code tool call|6|')).toBe(true)
  expect(line).toContain('cs3=s\\|1')
  expect(line).toContain('cs5Label=Verdict cs5=blocked')
  expect(line).toContain('cn2Label=LoopIteration cn2=7')
})

test('sem iteração não há campo de iteração; igual e barra são escapados', () => {
  const line = cefLine({ host: 'h', user: 'a=b', tool: 'Bash', agent: 'x\\y', session: 's', inputHash: 'ab', verdict: 'allow', hook: '', iteration: null })
  expect(line).not.toContain('LoopIteration')
  expect(line).toContain('suser=a\\=b')
  expect(line).toContain('cs2=x\\\\y')
  expect(line).toContain('|3|')
})

// --- trilho: o que o mod escreve, observado nas chamadas ao motor ---
const RAN = { exitCode: 0, stdout: 'maquina', stderr: '', isStdoutTruncated: false, isStderrTruncated: false }
const RALPH = '---\niteration: 4\nmax_iterations: 9\n---\nx'

type Seen = { runs: Array<{ argv: readonly string[]; stdin?: string }>; writes: Array<{ path: string; text: string }> }

function base(on: On, guardJson: string | null, env: Record<string, string> = {}, files: Record<string, string> = {}, sid: () => string = () => 'sess-1'): Seen {
  const seen: Seen = { runs: [], writes: [] }
  mock.env(on, { HOME: '/h', USER: 'ana', ...env })
  on('session.cwd', () => ({ value: '/p' }))
  on('session.id', () => ({ value: sid() }))
  on('clock.now', () => ({ value: Date.UTC(2026, 9, 14, 12, 0, 0) }))
  on('clock.every', () => ({ deny: 'sem relógio no teste' }))
  on('fs.read', (_$, e) => {
    if (e.path === '/h/.prumo/guard.json' && guardJson !== null) return { value: guardJson }
    return files[e.path] !== undefined ? { value: files[e.path] as string } : { deny: 'ENOENT' }
  })
  on('fs.stat', () => ({ deny: 'ENOENT' }))
  on('fs.write', (_$, e) => { seen.writes.push({ path: e.path, text: e.text }); return { value: undefined } })
  on('process.run', (_$, e) => {
    seen.runs.push({ argv: e.argv, stdin: e.init?.stdin })
    return { value: e.argv[0] === 'hostname' ? RAN : { ...RAN, stdout: '' } }
  })
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('tool.register', (_$, e) => ({ value: { tool: e.name } }))
  on('ui.status', () => ({ value: undefined }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('session.end', (_$, e) => ({ sessionId: e.sessionId }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  return seen
}

const START = { cwd: '/p', surface: null, isInteractive: false } as const
const END = { reason: 'other', sessionId: 'sess-1', resume: { id: 'sess-1' } } as const
const logged = (s: Seen) => s.runs.filter(r => r.argv[0] === 'sh' && r.argv.at(-1) === '/h/.prumo/log/cef.log').map(r => r.stdin ?? '').join('')

test('com o trilho ligado o arranque escreve o marker da sessão', async ($, on) => {
  const seen = base(on, null)
  await $.session.start(START)
  expect(seen.writes.map(w => w.path)).toContain('/h/.prumo/run/cef-mod.sess-1')
})

test('cef.enabled false não escreve marker nem linhas', async ($, on) => {
  const seen = base(on, '{"cef":{"enabled":false}}')
  on('tool.call', () => ({ result: '', text: 'ok' }))
  await $.session.start(START)
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  await $.session.end(END)
  expect(seen.writes.length).toBe(0)
  expect(logged(seen)).toBe('')
})

test('cada chamada vira uma linha CEF com o veredicto, escrita ao fim da sessão', async ($, on) => {
  const seen = base(on, null)
  let n = 0
  on('tool.call', () => (n++ === 0 ? { result: '', text: 'ok' } : { result: '', isError: true, text: '[prumo-secops/approval-gate] Operação N1 detectada' }))
  await $.session.start(START)
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  await $.tool.call({ tool: 'Bash', command: 'git push --force' })
  await $.session.end(END)
  const out = logged(seen).trim().split('\n')
  expect(out.length).toBe(2)
  expect(out[0]).toContain('2026-10-14T12:00:00Z CEF:0|prumo|SecOps-Agents|1.0|toolcall|Claude Code tool call|3|')
  expect(out[0]).toContain('src=maquina suser=ana cs1Label=Tool cs1=Bash cs2Label=Agent cs2=main cs3Label=Session cs3=sess-1')
  expect(out[0]).toContain('cs5Label=Verdict cs5=allow')
  expect(out[1]).toContain('|6|')
  expect(out[1]).toContain('cs5=blocked cs6Label=Hook cs6=prumo-secops/approval-gate')
  expect(out[0]).toMatch(/cs4=[0-9a-f]{64} /)
  expect(out[0]).not.toContain('ls')
})

test('o marker sai ao fim da sessão', async ($, on) => {
  const seen = base(on, null)
  await $.session.start(START)
  await $.session.end(END)
  expect(seen.runs.some(r => r.argv.join(' ') === 'rm -f /h/.prumo/run/cef-mod.sess-1')).toBe(true)
})

test('a iteração do ralph acompanha a linha', async ($, on) => {
  const seen = base(on, null, {}, { '/p/.claude/ralph-loop.local.md': RALPH })
  on('tool.call', () => ({ result: '', text: 'ok' }))
  await $.session.start(START)
  await $.turn.start({ text: 'x', turnId: 't1' })
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  await $.session.end(END)
  expect(logged(seen)).toContain('cn2Label=LoopIteration cn2=4')
})

test('com colector nomeado envia cada linha por UDP', async ($, on) => {
  const seen = base(on, null, { PRUMO_WAZUH_HOST: 'siem.exemplo', WAZUH_PORT: '1514' })
  on('tool.call', () => ({ result: '', text: 'ok' }))
  await $.session.start(START)
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  await $.session.end(END)
  const nc = seen.runs.filter(r => r.argv[0] === 'nc')
  expect(nc.length).toBe(1)
  expect(nc[0]?.argv.slice(1)).toEqual(['-u', '-w', '1', 'siem.exemplo', '1514'])
  expect(nc[0]?.stdin).toContain('CEF:0|prumo|')
})

test('sem colector não há envio por rede', async ($, on) => {
  const seen = base(on, null)
  on('tool.call', () => ({ result: '', text: 'ok' }))
  await $.session.start(START)
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  await $.session.end(END)
  expect(seen.runs.some(r => r.argv[0] === 'nc')).toBe(false)
})

test('uma recusa do próprio prumo-guard (guarda de marcadores) fica no trilho como deny', async ($, on) => {
  const seen = base(on, null, {}, { '/p/config.yml': 'email: real@x.pt\n' })
  on('tool.call', () => ({ result: '', text: 'ok' }))
  await $.session.start(START)
  const r = await $.tool.call({ tool: 'Write', file_path: '/p/config.yml', content: 'email: [prumo:EMAIL]\n' })
  expect(r.deny).toBeDefined()
  await $.session.end(END)
  const out = logged(seen)
  expect(out).toContain('cs1=Write')
  expect(out).toContain('|5|')
  expect(out).toContain('cs5=deny cs6Label=Hook cs6=plugin')
})

test('uma recusa do run_with_secret fica no trilho como deny', async ($, on) => {
  const seen = base(on, null)
  await $.session.start(START)
  const r = await $.tool.call({ tool: 'mcp__prumo-guard__run_with_secret', argv: ['bash', '-c', 'x'], secrets: {} } as never)
  expect(r.deny).toContain('interpretador')
  await $.session.end(END)
  const out = logged(seen)
  expect(out).toContain('cs1=mcp__prumo-guard__run_with_secret')
  expect(out).toContain('cs5=deny')
})

test('depois de um /clear o trilho passa para o id novo: marker novo e cs3 novo', async ($, on) => {
  let sid = 'sess-1'
  const seen = base(on, null, {}, {}, () => sid)
  on('tool.call', () => ({ result: '', text: 'ok' }))
  await $.session.start(START)
  await $.session.end({ reason: 'clear', sessionId: 'sess-1', resume: { id: 'sess-1' } })
  sid = 'sess-2'
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  await $.session.end({ reason: 'other', sessionId: 'sess-2', resume: { id: 'sess-2' } })
  expect(seen.writes.map(w => w.path)).toEqual(['/h/.prumo/run/cef-mod.sess-1', '/h/.prumo/run/cef-mod.sess-2'])
  const rms = seen.runs.filter(r => r.argv[0] === 'rm').map(r => r.argv.join(' '))
  expect(rms).toEqual(['rm -f /h/.prumo/run/cef-mod.sess-1', 'rm -f /h/.prumo/run/cef-mod.sess-2'])
  expect(logged(seen)).toContain('cs3Label=Session cs3=sess-2')
  expect(logged(seen)).not.toContain('cs3=sess-1')
})

declare function setTimeout(fn: () => void, ms: number): unknown

test('o session.end espera pelo flush periódico em voo antes de escrever o resto e tirar o marker', async ($, on) => {
  const done: string[] = []
  let tick: () => void = () => {}
  const ticked = new Promise<void>(r => { tick = r })
  let releaseWrite: () => void = () => {}
  const writeGate = new Promise<void>(r => { releaseWrite = r })
  let firstWrite = true
  mock.env(on, { HOME: '/h', USER: 'ana' })
  on('session.cwd', () => ({ value: '/p' }))
  on('session.id', () => ({ value: 'sess-1' }))
  on('clock.now', () => ({ value: Date.UTC(2026, 9, 14, 12, 0, 0) }))
  let periods = 0
  on('clock.every', async () => {
    if (periods++ > 0) return { deny: 'só um período' }
    await ticked
    return { value: undefined }
  })
  on('fs.read', () => ({ deny: 'ENOENT' }))
  on('fs.stat', () => ({ deny: 'ENOENT' }))
  on('fs.write', () => ({ value: undefined }))
  on('process.run', async (_$, e) => {
    if (e.argv[0] === 'sh' && firstWrite) {
      firstWrite = false
      await writeGate
    }
    done.push(e.argv[0] === 'sh' ? `sh:${(e.init?.stdin ?? '').trim().split('\n').length}` : String(e.argv[0]))
    return { value: { ...RAN, stdout: e.argv[0] === 'hostname' ? 'maquina' : '' } }
  })
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('tool.register', (_$, e) => ({ value: { tool: e.name } }))
  on('ui.status', () => ({ value: undefined }))
  on('tool.call', () => ({ result: '', text: 'ok' }))
  on('session.end', (_$, e) => ({ sessionId: e.sessionId }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  await $.session.start(START)
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  tick()
  for (let i = 0; i < 50 && firstWrite; i++) await new Promise<void>(r => setTimeout(r, 2))
  expect(firstWrite).toBe(false)
  await $.tool.call({ tool: 'Bash', command: 'pwd' })
  const ending = $.session.end(END)
  await new Promise<void>(r => setTimeout(r, 20))
  releaseWrite()
  await ending
  expect(done.filter(x => x !== 'hostname')).toEqual(['sh:1', 'sh:1', 'rm'])
})

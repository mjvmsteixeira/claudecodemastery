import { test, expect, mock } from 'claude-code/testing'

// Estado de módulo (`ready`) é por carregamento do plugin; cada teste corre num plugin novo.
test('com friday.enabled o writer acrescenta a linha ao <sid>.jsonl ao terminar a sessão', async ($, on) => {
  mock.env(on, { HOME: '/h' })
  on('classic.PostToolUse', () => ({}))
  on('session.end', (_$, e) => ({ sessionId: e.sessionId }))
  on('fs.read', () => ({ value: '{"friday":{"enabled":true}}' }))
  on('clock.now', () => ({ value: 42 }))
  on('clock.every', () => ({ deny: 'sem relógio no teste' }))
  on('session.id', () => ({ value: 'sid-1' }))
  const runs: Array<{ argv: readonly string[]; stdin?: string }> = []
  on('process.run', (_$, e) => {
    runs.push({ argv: e.argv, stdin: e.init?.stdin })
    return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  await $.classic.PostToolUse({ tool_name: 'Bash', tool_input: {}, tool_response: '', tool_use_id: 't1', session_id: 'sid-1' })
  await $.session.end({ reason: 'other', sessionId: 'sid-1', resume: { id: 'sid-1' } })
  expect(runs.length).toBe(1)
  expect(runs[0]?.argv.at(-1)).toBe('/h/.claude/friday-state/sid-1.jsonl')
  expect(runs[0]?.stdin).toBe('{"t":42,"e":"PostToolUse","p":null,"tool":"Bash","ag":null,"at":null,"nt":null}\n')
})

test('por omissão (desligado) não escreve nada', async ($, on) => {
  mock.env(on, { HOME: '/h' })
  on('classic.PostToolUse', () => ({}))
  on('session.end', (_$, e) => ({ sessionId: e.sessionId }))
  on('fs.read', () => ({ deny: 'ENOENT' }))
  on('clock.now', () => ({ value: 42 }))
  let ran = 0
  on('process.run', () => { ran++; return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } } })
  await $.classic.PostToolUse({ tool_name: 'Bash', tool_input: {}, tool_response: '', tool_use_id: 't1', session_id: 'sid-1' })
  await $.session.end({ reason: 'other', sessionId: 'sid-1', resume: { id: 'sid-1' } })
  expect(ran).toBe(0)
})

declare function setTimeout(fn: () => void, ms: number): unknown

const OK = { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false }

test('tool.call regista PreToolUse; umask 077; sid inválido do hook cai no session.id(); flush periódico', async ($, on) => {
  mock.env(on, { HOME: '/h' })
  on('tool.call', () => ({ result: '', text: '', isError: true }))
  on('fs.read', () => ({ value: '{"friday":{"enabled":true}}' }))
  on('clock.now', () => ({ value: 7 }))
  let ticks = 0
  let release: () => void = () => {}
  const gate = new Promise<void>(r => { release = r })
  on('clock.every', async () => { ticks++; await gate; return { value: undefined } })
  on('session.id', () => ({ value: 'fallback' }))
  const runs: Array<{ argv: readonly string[]; stdin?: string }> = []
  on('process.run', (_$, e) => { runs.push({ argv: e.argv, stdin: e.init?.stdin }); return { value: OK } })
  await $.tool.call({ tool: 'Bash', agentId: 'ag1' } as never)
  release()
  for (let i = 0; i < 200 && runs.length === 0; i++) await new Promise<void>(r => setTimeout(r, 5))
  expect(ticks).toBeGreaterThan(0)
  expect(runs.length).toBe(1)
  expect(runs[0]?.argv[2]).toContain('umask 077')
  expect(runs[0]?.argv.at(-1)).toBe('/h/.claude/friday-state/fallback.jsonl')
  expect(runs[0]?.stdin).toBe('{"t":7,"e":"PreToolUse","p":null,"tool":"Bash","ag":"ag1","at":null,"nt":null}\n')
})

test('sid inválido no payload do hook usa session.id()', async ($, on) => {
  mock.env(on, { HOME: '/h' })
  on('classic.Notification', () => ({}))
  on('session.end', (_$, e) => ({ sessionId: e.sessionId }))
  on('fs.read', () => ({ value: '{"friday":{"enabled":true}}' }))
  on('clock.now', () => ({ value: 1 }))
  on('clock.every', () => ({ deny: 'sem relógio no teste' }))
  on('session.id', () => ({ value: 'fb' }))
  const runs: Array<{ argv: readonly string[]; stdin?: string }> = []
  on('process.run', (_$, e) => { runs.push({ argv: e.argv, stdin: e.init?.stdin }); return { value: OK } })
  await $.classic.Notification({ session_id: '../x', notification_type: 'idle', prompt_id: 'p1', agent_id: 'a', agent_type: 't' } as never)
  await $.session.end({ reason: 'other', sessionId: 'fb', resume: { id: 'fb' } })
  expect(runs[0]?.argv.at(-1)).toBe('/h/.claude/friday-state/fb.jsonl')
  expect(runs[0]?.stdin).toBe('{"t":1,"e":"Notification","p":"p1","tool":null,"ag":"a","at":"t","nt":"idle"}\n')
})

test('sid válido do hook tem prioridade sobre session.id()', async ($, on) => {
  mock.env(on, { HOME: '/h' })
  on('classic.Stop', () => ({}))
  on('session.end', (_$, e) => ({ sessionId: e.sessionId }))
  on('fs.read', () => ({ value: '{"friday":{"enabled":true}}' }))
  on('clock.now', () => ({ value: 1 }))
  on('clock.every', () => ({ deny: 'sem relógio no teste' }))
  on('session.id', () => ({ value: 'outro' }))
  const runs: Array<readonly string[]> = []
  on('process.run', (_$, e) => { runs.push(e.argv); return { value: OK } })
  await $.classic.Stop({ session_id: 'do-hook' } as never)
  await $.session.end({ reason: 'other', sessionId: 'x', resume: { id: 'x' } })
  expect(runs[0]?.at(-1)).toBe('/h/.claude/friday-state/do-hook.jsonl')
})

test('depois de um /clear as linhas vão para o ficheiro do id novo', async ($, on) => {
  mock.env(on, { HOME: '/h' })
  on('classic.PostToolUse', () => ({}))
  on('session.end', (_$, e) => ({ sessionId: e.sessionId }))
  on('fs.read', () => ({ value: '{"friday":{"enabled":true}}' }))
  on('clock.now', () => ({ value: 3 }))
  on('clock.every', () => ({ deny: 'sem relógio no teste' }))
  let sid = 's-1'
  on('session.id', () => ({ value: sid }))
  const runs: Array<readonly string[]> = []
  on('process.run', (_$, e) => { runs.push(e.argv); return { value: OK } })
  await $.classic.PostToolUse({ tool_name: 'Bash', tool_input: {}, tool_response: '', tool_use_id: 't1', session_id: 's-1' })
  await $.session.end({ reason: 'clear', sessionId: 's-1', resume: { id: 's-1' } })
  sid = 's-2'
  await $.tool.call({ tool: 'Read', file_path: '/p/x' } as never).catch(() => undefined)
  await $.session.end({ reason: 'other', sessionId: 's-2', resume: { id: 's-2' } })
  expect(runs.map(r => r.at(-1))).toEqual(['/h/.claude/friday-state/s-1.jsonl', '/h/.claude/friday-state/s-2.jsonl'])
})

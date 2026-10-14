import { test, expect, mock } from 'claude-code/testing'

// Estado de módulo (`ready`) é por carregamento do plugin; cada teste corre num plugin novo.
test('com friday.enabled o writer acrescenta a linha ao <sid>.jsonl ao terminar a sessão', async ($, on) => {
  mock.env(on, { HOME: '/h' })
  on('classic.PostToolUse', () => ({}))
  on('session.end', (_$, e) => ({ sessionId: e.sessionId }))
  on('fs.read', () => ({ value: '{"friday":{"enabled":true}}' }))
  on('clock.now', () => ({ value: 42 }))
  on('clock.every', () => ({ value: undefined }))
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

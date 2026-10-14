import { test, expect } from 'claude-code/testing'
import { fridayLine, validSessionId } from '../hooks/friday-line.ts'

test('mesma forma e ordem de chaves que o friday-state.sh', () => {
  expect(fridayLine({ t: 1, e: 'PostToolUse', tool: 'Bash' })).toBe('{"t":1,"e":"PostToolUse","p":null,"tool":"Bash","ag":null,"at":null,"nt":null}')
})

test('corta a 64 caracteres', () => {
  const line = JSON.parse(fridayLine({ t: 1, e: 'x'.repeat(100) }))
  expect(line.e.length).toBe(64)
})

test('session id inválido', () => {
  expect(validSessionId('../x')).toBe(null)
  expect(validSessionId('abc-123')).toBe('abc-123')
})

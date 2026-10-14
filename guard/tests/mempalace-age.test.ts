import { test, expect, mock } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'
import { ageNote, MEMPALACE_SEARCH } from '../hooks/mempalace-age.ts'

const NOW = Date.parse('2026-10-14T12:00:00Z')

test('idade por resultado e marca de antigo', () => {
  const json = JSON.stringify({ results: [
    { drawer_id: 'd1', created_at: '2026-10-10T12:00:00' },
    { drawer_id: 'd2', created_at: '2026-05-01T12:00:00' },
  ] })
  const note = ageNote(json, NOW, 90)
  expect(note).toContain('#1 há 4 dias')
  expect(note).toContain('#2 há 166 dias (antigo')
})

test('não-JSON ou sem datas devolve null', () => {
  expect(ageNote('erro do servidor', NOW, 90)).toBe(null)
  expect(ageNote('{"results":[{"drawer_id":"x"}]}', NOW, 90)).toBe(null)
})

async function appendWith(origin: string, body: string, $: Engine, on: On): Promise<string> {
  mock.env(on, { HOME: '/h' })
  on('fs.read', () => ({ deny: 'ENOENT' }))
  on('clock.now', () => ({ value: NOW }))
  let stored = ''
  on('session.append', (_$, e, next) => {
    stored = JSON.stringify(e.message.content)
    return next(e)
  })
  await $.session.append({
    door: 'tool-result',
    origin: { kind: 'tool', tool: origin },
    uuid: 'u1',
    message: { type: 'user', role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: body }] },
  })
  return stored
}

test('acrescenta a nota ao resultado do mempalace_search', async ($, on) => {
  const stored = await appendWith(MEMPALACE_SEARCH, '{"results":[{"created_at":"2026-10-10T12:00:00"}]}', $, on)
  expect(stored).toContain('[prumo-guard] idade das memórias: #1 há 4 dias')
})

test('outras tools passam intactas', async ($, on) => {
  const stored = await appendWith('Bash', '{"results":[{"created_at":"2026-10-10T12:00:00"}]}', $, on)
  expect(stored).not.toContain('prumo-guard')
})

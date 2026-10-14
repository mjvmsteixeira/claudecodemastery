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

async function appendRaw(
  $: Engine,
  on: On,
  opts: { door?: string; content: unknown; config?: string },
): Promise<string> {
  mock.env(on, { HOME: '/h' })
  on('fs.read', () => (opts.config ? { value: opts.config } : { deny: 'ENOENT' }))
  on('clock.now', () => ({ value: NOW }))
  let stored = ''
  on('session.append', (_$, e, next) => {
    stored = JSON.stringify(e.message.content)
    return next(e)
  })
  await $.session.append({
    door: (opts.door ?? 'tool-result') as 'tool-result',
    origin: { kind: 'tool', tool: MEMPALACE_SEARCH },
    uuid: 'u1',
    message: { type: 'user', role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: opts.content }] },
  } as never)
  return stored
}

const OLD = '{"results":[{"created_at":"2026-09-01T12:00:00"}]}'

test('staleDays da configuração decide a marca de antigo no hook', async ($, on) => {
  const stored = await appendRaw($, on, { content: OLD, config: '{"mempalace":{"staleDays":30}}' })
  expect(stored).toContain('(antigo')
})

test('com a configuração por omissão (90 dias) 43 dias não é antigo', async ($, on) => {
  const stored = await appendRaw($, on, { content: OLD })
  expect(stored).toContain('#1 há 43 dias')
  expect(stored).not.toContain('(antigo')
})

test('conteúdo em blocos de texto recebe um bloco de texto com a nota', async ($, on) => {
  const stored = await appendRaw($, on, { content: [{ type: 'text', text: OLD }] })
  const blocks = JSON.parse(stored)[0].content as Array<{ type: string; text: string }>
  expect(blocks.length).toBe(2)
  expect(blocks[1]?.type).toBe('text')
  expect(blocks[1]?.text).toContain('[prumo-guard] idade das memórias: #1 há 43 dias')
})

test('porta que não é tool-result passa intacta', async ($, on) => {
  const stored = await appendRaw($, on, { door: 'user', content: OLD })
  expect(stored).not.toContain('prumo-guard')
})

import { test, expect, mock } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

// `$.env`/`$.fs` só se chamam a partir do módulo do plugin (regra do host), por
// isso `loadConfig` testa-se pelo que o `session.start` do mod expõe no status.
const START = { cwd: '/h', surface: null, isInteractive: false } as const

async function statusWith(
  $: Engine,
  on: On,
  env: Record<string, string>,
  read: (path: string) => { value: string } | { deny: string },
): Promise<string> {
  mock.env(on, env)
  on('fs.read', (_$, e) => read(e.path))
  let status = ''
  on('ui.status', (_$, e) => { status = e.text ?? ''; return { value: undefined } })
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  await $.session.start(START)
  return status
}

const DEFAULT_STATUS = 'prumo-guard · orçamento 20 USD · repetição 4 · ips internos off'

test('guard.json ausente dá os defaults', async ($, on) => {
  const s = await statusWith($, on, { HOME: '/h' }, () => ({ deny: 'ENOENT' }))
  expect(s).toBe(DEFAULT_STATUS)
})

test('guard.json parcial funde com os defaults', async ($, on) => {
  const s = await statusWith($, on, { HOME: '/h' }, () => ({ value: '{"brake":{"usdBudget":5}}' }))
  expect(s).toBe('prumo-guard · orçamento 5 USD · repetição 4 · ips internos off')
})

test('guard.json com override noutra secção mantém os defaults da primeira', async ($, on) => {
  const s = await statusWith($, on, { HOME: '/h' }, () => ({ value: '{"redact":{"internalIps":true}}' }))
  expect(s).toBe('prumo-guard · orçamento 20 USD · repetição 4 · ips internos on')
})

test('guard.json com JSON inválido dá os defaults', async ($, on) => {
  const s = await statusWith($, on, { HOME: '/h' }, () => ({ value: '{nao e json' }))
  expect(s).toBe(DEFAULT_STATUS)
})

test('PRUMO_HOME define onde se lê o guard.json', async ($, on) => {
  const paths: string[] = []
  const s = await statusWith($, on, { HOME: '/h', PRUMO_HOME: '/p' }, path => {
    paths.push(path)
    return path === '/p/guard.json' ? { value: '{"brake":{"repeatLimit":9}}' } : { deny: 'ENOENT' }
  })
  expect(paths).toEqual(['/p/guard.json'])
  expect(s).toBe('prumo-guard · orçamento 20 USD · repetição 9 · ips internos off')
})

test('sem PRUMO_HOME lê de $HOME/.prumo/guard.json', async ($, on) => {
  const paths: string[] = []
  await statusWith($, on, { HOME: '/h' }, path => { paths.push(path); return { deny: 'ENOENT' } })
  expect(paths).toEqual(['/h/.prumo/guard.json'])
})

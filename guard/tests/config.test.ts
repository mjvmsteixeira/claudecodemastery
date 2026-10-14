import { test, expect, mock } from 'claude-code/testing'

// `$.env`/`$.fs` só se chamam a partir do módulo do plugin (regra do host), por
// isso `loadConfig` testa-se pelo que o `session.start` do mod expõe no estado.
const START = { cwd: '/h', surface: null, isInteractive: false } as const

test('guard.json ausente dá os defaults', async ($, on) => {
  mock.env(on, { HOME: '/h' })
  on('fs.read', () => ({ deny: 'ENOENT' }))
  let status = ''
  on('ui.status', (_$, e) => { status = e.text ?? ''; return { value: undefined } })
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  await $.session.start(START)
  expect(status).toBe('prumo-guard · orçamento 20 USD')
})

test('guard.json parcial funde com os defaults', async ($, on) => {
  mock.env(on, { HOME: '/h' })
  on('fs.read', () => ({ value: '{"brake":{"usdBudget":5}}' }))
  let status = ''
  on('ui.status', (_$, e) => { status = e.text ?? ''; return { value: undefined } })
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  await $.session.start(START)
  expect(status).toBe('prumo-guard · orçamento 5 USD')
})

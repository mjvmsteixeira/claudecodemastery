import { test, expect, mock } from 'claude-code/testing'
import type { On } from 'claude-code'

const HIDDEN = '{"agents":{"hidden":["prumo-secops:prumo-ir-saas-01"]},"brake":{"usdBudget":7}}'
const run = (args: string, origin: object) => ({ command: 'prumo-guard-agents', args, origin, presentation: { layout: 'main', columns: 80 } }) as never
const offer = (agent: string) => ({ agent, description: '', source: 'plugin', provider: { plugin: 'x', tier: 'user' } }) as never

function setup(on: On, file: { value: string } | { deny: string } = { value: HIDDEN }) {
  mock.env(on, { HOME: '/h' })
  on('fs.read', () => file)
  on('agent.offer', () => ({ isOffered: true }))
  on('command.run', (_$, e) => ({ text: 'engine' }))
}

test('agente na lista hidden não é oferecido', async ($, on) => {
  setup(on)
  const hidden = await $.agent.offer(offer('prumo-secops:prumo-ir-saas-01'))
  const shown = await $.agent.offer(offer('prumo-secops:prumo-monitor-01'))
  expect(hidden.isOffered).toBe(false)
  expect(shown.isOffered).toBe(true)
})

test('nome sem prefixo de plugin também esconde', async ($, on) => {
  setup(on, { value: '{"agents":{"hidden":["prumo-ir-saas-01"]}}' })
  expect((await $.agent.offer(offer('prumo-secops:prumo-ir-saas-01'))).isOffered).toBe(false)
})

test('sem guard.json todos os agentes são oferecidos', async ($, on) => {
  setup(on, { deny: 'ENOENT' })
  expect((await $.agent.offer(offer('Plan'))).isOffered).toBe(true)
})

test('start regista o comando prumo-guard-agents', async ($, on) => {
  setup(on)
  const names: string[] = []
  on('command.register', (_$, e) => { names.push(e.name); return { value: { command: e.name } } })
  on('ui.status', () => ({ value: undefined }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/h', surface: null, isInteractive: false })
  expect(names).toContain('prumo-guard-agents')
})

test('hide pela tecla Enter escreve guard.json mantendo as outras chaves', async ($, on) => {
  setup(on)
  const writes: string[] = []
  on('fs.write', (_$, e) => { writes.push(e.path, e.text); return { value: undefined } })
  const r = await $.command.run(run('hide Plan', { kind: 'composer' }))
  expect(r.text).toContain('Escondido: Plan')
  expect(writes[0]).toBe('/h/.prumo/guard.json')
  const saved = JSON.parse(writes[1] as string)
  expect(saved.brake.usdBudget).toBe(7)
  expect(saved.agents.hidden).toEqual(['prumo-secops:prumo-ir-saas-01', 'Plan'])
})

test('origem que não é a pessoa não altera o guard.json', async ($, on) => {
  setup(on)
  const writes: string[] = []
  on('fs.write', (_$, e) => { writes.push(e.path); return { value: undefined } })
  const r = await $.command.run(run('hide Plan', { kind: 'sdk' }))
  expect(r.text).toContain('só aceita a tecla Enter')
  expect(writes).toEqual([])
})

test('sem argumentos lista os escondidos', async ($, on) => {
  setup(on)
  const r = await $.command.run(run('', { kind: 'composer' }))
  expect(r.text).toContain('prumo-secops:prumo-ir-saas-01')
})

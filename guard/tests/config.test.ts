import { test, expect, mock } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'
import { cmd } from './start-stubs.ts'

// `$.env`/`$.fs` só se chamam a partir do módulo do plugin (regra do host), por
// isso `loadConfig` testa-se pelo que `/prumo-guard` mostra da configuração lida.
async function configLine(
  $: Engine,
  on: On,
  env: Record<string, string>,
  read: (path: string) => { value: string } | { deny: string },
): Promise<string> {
  mock.env(on, env)
  on('fs.read', (_$, e) => read(e.path))
  on('fs.stat', () => ({ deny: 'ENOENT' }))
  const r = await $.command.run(cmd('prumo-guard'))
  return (r.text ?? '').split('\n').find(l => l.startsWith('orçamento:')) ?? ''
}

const DEFAULT_STATUS = 'orçamento: 20 USD · repetição: 4 · ips internos: off'

test('guard.json ausente dá os defaults', async ($, on) => {
  const s = await configLine($, on, { HOME: '/h' }, () => ({ deny: 'ENOENT' }))
  expect(s).toBe(DEFAULT_STATUS)
})

test('guard.json parcial funde com os defaults', async ($, on) => {
  const s = await configLine($, on, { HOME: '/h' }, () => ({ value: '{"brake":{"usdBudget":5}}' }))
  expect(s).toBe('orçamento: 5 USD · repetição: 4 · ips internos: off')
})

test('guard.json com override noutra secção mantém os defaults da primeira', async ($, on) => {
  const s = await configLine($, on, { HOME: '/h' }, () => ({ value: '{"redact":{"internalIps":true}}' }))
  expect(s).toBe('orçamento: 20 USD · repetição: 4 · ips internos: on')
})

test('guard.json com JSON inválido dá os defaults', async ($, on) => {
  const s = await configLine($, on, { HOME: '/h' }, () => ({ value: '{nao e json' }))
  expect(s).toBe(DEFAULT_STATUS)
})

test('PRUMO_HOME define onde se lê o guard.json', async ($, on) => {
  const paths: string[] = []
  const s = await configLine($, on, { HOME: '/h', PRUMO_HOME: '/p' }, path => {
    paths.push(path)
    return path === '/p/guard.json' ? { value: '{"brake":{"repeatLimit":9}}' } : { deny: 'ENOENT' }
  })
  expect(paths.filter(p => p.endsWith('guard.json'))).toEqual(['/p/guard.json'])
  expect(s).toBe('orçamento: 20 USD · repetição: 9 · ips internos: off')
})

test('sem PRUMO_HOME lê de $HOME/.prumo/guard.json', async ($, on) => {
  const paths: string[] = []
  await configLine($, on, { HOME: '/h' }, path => { paths.push(path); return { deny: 'ENOENT' } })
  expect(paths.filter(p => p.endsWith('guard.json'))).toEqual(['/h/.prumo/guard.json'])
})

async function brakeLine($: Engine, on: On, read: () => { value: string } | { deny: string }): Promise<string> {
  mock.env(on, { HOME: '/h' })
  on('fs.read', () => read())
  on('fs.stat', () => ({ deny: 'ENOENT' }))
  const r = await $.command.run(cmd('prumo-guard'))
  return (r.text ?? '').split('\n').find(l => l.startsWith('travão:')) ?? ''
}

test('/prumo-guard mostra o travão desligado por omissão', async ($, on) => {
  expect(await brakeLine($, on, () => ({ deny: 'ENOENT' }))).toBe('travão: desligado (guard.json → brake.enabled)')
})

test('/prumo-guard mostra o travão ligado quando a pessoa o liga', async ($, on) => {
  expect(await brakeLine($, on, () => ({ value: '{"brake":{"enabled":true}}' }))).toBe('travão: ligado')
})

test('um guard.json com a chave friday antiga é aceite sem aviso', async ($, on) => {
  const toasts: string[] = []
  on('ui.toast', (_$, e) => { toasts.push(e.text); return { value: undefined } })
  mock.env(on, { HOME: '/h' })
  on('fs.read', (_$, e) => (e.path.endsWith('/guard.json') ? { value: '{"friday":{"enabled":true},"brake":{"enabled":true}}' } : { deny: 'ENOENT' }))
  on('fs.stat', () => ({ deny: 'ENOENT' }))
  const r = await $.command.run(cmd('prumo-guard'))
  const lines = (r.text ?? '').split('\n')
  expect(lines.find(l => l.startsWith('travão:'))).toBe('travão: ligado')
  expect(r.text ?? '').not.toContain('friday')
  expect(toasts).toEqual([])
})

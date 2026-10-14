import { test, expect, mock } from 'claude-code/testing'
import type { PrumoGuardPending } from '../types'
import type { On } from 'claude-code'

const ID = 'b'.repeat(64)
const DENIAL = `[prumo-secops/approval-gate] Operação N1 detectada:\n  git push --force origin feature\n\napproval-id: ${ID}\n`
const MOUNT = { plugin: 'prumo-guard', surface: 'terminal', component: 'Pane', props: { title: 'prumo · aprovação', isFocused: true, bodyColumns: 80, placement: 'inline', scroll: { offset: 0, bodyRows: 10 }, view: {} }, requestId: 'prumo-guard-approval' } as const

type Seen = {
  writes: Array<{ path: string; text: string }>
  appended: string[]
  pending: PrumoGuardPending[]
  opened: string[]
  notified: string[]
  closed: string[]
  pendingSets: number
}

type Ran = { result: string; text: string; isError: true } | { result: string; text: string }

function stubs(on: On, texts: () => string, ran?: () => Ran): Seen {
  const seen: Seen = { writes: [], appended: [], pending: [], opened: [], notified: [], closed: [], pendingSets: 0 }
  on('state.set', { plugin: 'prumo-guard', key: 'pending' }, (_$, e, next) => {
    seen.pending = e.value as PrumoGuardPending[]
    seen.pendingSets++
    return next(e)
  })
  mock.env(on, { HOME: '/h' })
  on('clock.now', () => ({ value: 1_000_000 }))
  on('ui.open', (_$, e) => { seen.opened.push(e.id); return { value: { isPlaced: true } } })
  on('ui.notify', (_$, e) => { seen.notified.push(String(e.text)); return { value: { isSent: true, channel: 'terminal_bell' } } })
  on('ui.status', () => ({ value: undefined }))
  on('ui.close', (_$, e) => { seen.closed.push(e.id); return { value: undefined } })
  on('fs.write', (_$, e) => { seen.writes.push({ path: e.path, text: e.text }); return { value: undefined } })
  on('session.append', (_$, e, next) => {
    seen.appended.push(String((e.message.content[0] as unknown as { text: string }).text))
    return next(e)
  })
  on('tool.call', () => (ran ? ran() : { result: '', text: texts(), isError: true }))
  return seen
}

const BASH = { tool: 'Bash', command: 'git push --force origin feature' } as const

test('bloqueio do gate abre pedido pendente e diz ao modelo para não contornar', async ($, on) => {
  const seen = stubs(on, () => DENIAL)
  const ran = await $.tool.call(BASH)
  expect(ran.isError).toBe(true)
  expect(String(ran.context ?? '')).toContain('exatamente')
  expect(seen.pending[0]?.id).toBe(ID)
  expect(seen.pending[0]?.level).toBe('N1')
  expect(seen.opened).toEqual(['prumo-guard-approval'])
  expect(seen.notified.length).toBe(1)
  expect(seen.notified[0]).toContain('N1')
})

test('aprovar "só esta" escreve o ficheiro e remove o pendente', async ($, on) => {
  const seen = stubs(on, () => DENIAL)
  await $.tool.call(BASH)
  const ui = await $.ui.mount(MOUNT)
  await ui.press({ key: 'once' })
  expect(seen.writes[0]?.path).toBe(`/h/.prumo/approvals/${ID}`)
  expect(seen.writes[0]?.text).toContain('level=N1')
  expect(seen.writes[0]?.text).toContain('scope=once')
  expect(seen.writes[0]?.text).toContain(`expires=${1_000 + 300}`)
  expect(seen.appended[0]).toContain('aprovado')
  expect(seen.pending.length).toBe(0)
  expect(seen.closed).toEqual(['prumo-guard-approval'])
  await ui.unmount()
})

test('aprovar "10 minutos" escreve scope=ttl, expiração a 600 s e avisa o modelo', async ($, on) => {
  const seen = stubs(on, () => DENIAL)
  await $.tool.call(BASH)
  const ui = await $.ui.mount(MOUNT)
  await ui.press({ key: 'ttl' })
  expect(seen.writes[0]?.text).toContain('level=N1')
  expect(seen.writes[0]?.text).toContain('scope=ttl')
  expect(seen.writes[0]?.text).toContain(`expires=${1_000 + 600}`)
  expect(seen.appended[0]).toContain('durante 10 minutos')
  await ui.unmount()
})

test('resultado normal com o texto de recusa não abre pedido', async ($, on) => {
  const seen = stubs(on, () => DENIAL, () => ({ result: '', text: DENIAL }))
  await $.tool.call(BASH)
  expect(seen.pendingSets).toBe(0)
  expect(seen.opened.length).toBe(0)
})

test('erro de outro hook não abre pedido', async ($, on) => {
  const seen = stubs(on, () => DENIAL, () => ({ result: '', text: 'Erro: ficheiro inexistente', isError: true }))
  await $.tool.call(BASH)
  expect(seen.pendingSets).toBe(0)
  expect(seen.opened.length).toBe(0)
})

test('recusa do gate sem approval-id de 64 hex não abre pedido', async ($, on) => {
  const bad = DENIAL.replace(ID, 'b'.repeat(10))
  const seen = stubs(on, () => bad)
  const ran = await $.tool.call(BASH)
  expect(ran.isError).toBe(true)
  expect(seen.pendingSets).toBe(0)
  expect(seen.opened.length).toBe(0)
})

test('dois pendentes: decidir um mantém o outro', async ($, on) => {
  const ID2 = 'c'.repeat(64)
  let n = 0
  const seen = stubs(on, () => (n++ === 0 ? DENIAL : DENIAL.replace(ID, ID2)))
  await $.tool.call(BASH)
  await $.tool.call({ tool: 'Bash', command: 'git push --force origin outra' })
  const ui = await $.ui.mount(MOUNT)
  expect(await ui.find({ text: /1 pedido/ })).toBeDefined()
  await ui.press({ key: 'deny' })
  expect(seen.pending.length).toBe(1)
  expect(seen.pending[0]?.id).toBe(ID)
  expect(seen.writes.length).toBe(0)
  expect(seen.appended[0]).toContain('negou')
  expect(seen.closed.length).toBe(0)
  await ui.unmount()
})

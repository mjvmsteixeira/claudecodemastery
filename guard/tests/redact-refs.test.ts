import { test, expect } from 'claude-code/testing'
import { collectSecrets, countPlaceholders, redactText } from '../hooks/redact-patterns.ts'
import { positives, leaks, SECRETS_ONLY, W } from './coverage-cases.ts'

const REF = 'secret/inbox/demo/abc123#value'

for (const p of positives) {
  test(`refs: caso ${p.n}, recolha = valores removidos`, () => {
    const found = collectSecrets(p.text, SECRETS_ONLY).map(s => s.value)
    expect(found.slice().sort()).toEqual(p.values.slice().sort())
    for (const v of found) expect(redactText(p.text, SECRETS_ONLY).text.includes(v)).toBe(false)
    const refs = new Map(found.map((v, i) => [v, `secret/inbox/demo/id${i}#value`]))
    const out = redactText(p.text, { ...SECRETS_ONLY, refs }).text
    for (const v of found) expect(leaks(out, v)).toBe(false)
    expect(out).toContain('→secret/inbox/demo/id0#value]')
    expect(redactText(out, SECRETS_ONLY).hits).toBe(0)
  })
}

test('refs: valor, classe e ordem de aparição', () => {
  const sk = 'sk-' + 'proj-' + 'A1b2'.repeat(10)
  const got = collectSecrets('password=' + W + ' e ' + sk, SECRETS_ONLY)
  expect(got).toEqual([{ cls: 'SEGREDO', value: W }, { cls: 'CHAVE-API', value: sk }])
})

test('refs: repetidos recolhidos uma vez', () => {
  const got = collectSecrets('password=' + W + '\nsenha: ' + W, SECRETS_ONLY)
  expect(got).toEqual([{ cls: 'SEGREDO', value: W }])
})

test('refs: PII e IP não são recolhidos', () => {
  const all = { pii: true, internalIps: true, extra: [] }
  expect(collectSecrets('mail ana@exemplo.pt ip 10.0.0.5 tel +351 912 345 678', all)).toEqual([])
})

test('refs: aspas, Bearer e palavra-chave mantêm-se com referência', () => {
  const refs = new Map([[W, REF]])
  expect(redactText('password="' + W + '"', { ...SECRETS_ONLY, refs }).text).toBe('password="[prumo:SEGREDO→' + REF + ']"')
  const tok = 'abcdEFGH' + '12345678xyz'
  expect(collectSecrets('Authorization: Bearer ' + tok, SECRETS_ONLY)).toEqual([{ cls: 'TOKEN', value: tok }])
  expect(redactText('Bearer ' + tok, { ...SECRETS_ONLY, refs: new Map([[tok, REF]]) }).text).toBe('Bearer [prumo:TOKEN→' + REF + ']')
  const url = 'postgres://user:' + 'Pw9xQ2' + '@db'
  expect(collectSecrets(url, SECRETS_ONLY)).toEqual([{ cls: 'SEGREDO', value: 'Pw9xQ2' }])
})

test('refs: valor sem referência fica como hoje', () => {
  const refs = new Map([['outro', REF]])
  expect(redactText('password=' + W, { ...SECRETS_ONLY, refs }).text).toBe('password=[prumo:SEGREDO]')
})

test('refs: marcador com referência é contado e não é redigido de novo', () => {
  const t = 'password=[prumo:SEGREDO→' + REF + '] e token: [prumo:TOKEN→secret/inbox/password/x#value]'
  expect(countPlaceholders(t)).toBe(2)
  expect(countPlaceholders('[prumo:SEGREDO] [prumo:SEGREDO→' + REF + ']')).toBe(2)
  const r = redactText(t, SECRETS_ONLY)
  expect(r.hits).toBe(0)
  expect(r.text).toBe(t)
  expect(collectSecrets(t, SECRETS_ONLY)).toEqual([])
})

import { test, expect } from 'claude-code/testing'
import { collectSecrets, compileExtra, countPlaceholders, forgetRefs, redactText, rememberRef } from '../hooks/redact-patterns.ts'
import { positives, leaks, SECRETS_ONLY, V, W } from './coverage-cases.ts'

const PW = 'pass' + 'word='
const SN = 'sen' + 'ha: '
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
  const got = collectSecrets(PW + '' + W + ' e ' + sk, SECRETS_ONLY)
  expect(got).toEqual([{ cls: 'SEGREDO', value: W }, { cls: 'CHAVE-API', value: sk }])
})

test('refs: repetidos recolhidos uma vez', () => {
  const got = collectSecrets(PW + '' + W + '\n' + SN + W, SECRETS_ONLY)
  expect(got).toEqual([{ cls: 'SEGREDO', value: W }])
})

test('refs: PII e IP não são recolhidos', () => {
  const all = { pii: true, internalIps: true, extra: [] }
  expect(collectSecrets('mail ana@exemplo.pt ip 10.0.0.5 tel +351 912 345 678', all)).toEqual([])
})

test('refs: aspas, Bearer e palavra-chave mantêm-se com referência', () => {
  const refs = new Map([[W, REF]])
  expect(redactText(PW + '"' + W + '"', { ...SECRETS_ONLY, refs }).text).toBe(PW + '"[prumo:SEGREDO→' + REF + ']"')
  const tok = 'abcdEFGH' + '12345678xyz'
  expect(collectSecrets('Authorization: Bearer ' + tok, SECRETS_ONLY)).toEqual([{ cls: 'TOKEN', value: tok }])
  expect(redactText('Bearer ' + tok, { ...SECRETS_ONLY, refs: new Map([[tok, REF]]) }).text).toBe('Bearer [prumo:TOKEN→' + REF + ']')
  const url = 'postgres://user:' + 'Pw9xQ2' + '@db'
  expect(collectSecrets(url, SECRETS_ONLY)).toEqual([{ cls: 'SEGREDO', value: 'Pw9xQ2' }])
})

test('refs: valor sem referência fica como hoje', () => {
  const refs = new Map([['outro', REF]])
  expect(redactText(PW + '' + W, { ...SECRETS_ONLY, refs }).text).toBe(PW + '[prumo:SEGREDO]')
})

test('refs: marcador com referência é contado e não é redigido de novo', () => {
  const t = PW + '[prumo:SEGREDO→' + REF + '] e token: [prumo:TOKEN→secret/inbox/password/x#value]'
  expect(countPlaceholders(t)).toBe(2)
  expect(countPlaceholders('[prumo:SEGREDO] [prumo:SEGREDO→' + REF + ']')).toBe(2)
  const r = redactText(t, SECRETS_ONLY)
  expect(r.hits).toBe(0)
  expect(r.text).toBe(t)
  expect(collectSecrets(t, SECRETS_ONLY)).toEqual([])
})

// I1/M3: regras sobrepostas
const TOK = 'abcdEFGH' + '12345678xyz'
const overlaps = [
  'api_key: "Bearer ' + TOK + '"',
  PW + 'Bearer ' + TOK,
  'Authorization: Bearer ' + TOK + ' e ' + SN + W,
  'token = Bearer ' + TOK + ' ' + 'sk-' + 'proj-' + 'A1b2'.repeat(10),
]

for (const t of overlaps) {
  test(`refs: sobreposição ${t.slice(0, 22)}, valores recolhidos existem no original e sem marcador`, () => {
    const found = collectSecrets(t, SECRETS_ONLY)
    for (const f of found) {
      expect(t.includes(f.value)).toBe(true)
      expect(f.value.includes('[prumo:')).toBe(false)
    }
    expect(found.map(f => f.value)).toContain(TOK)
    const refs = new Map(found.map((f, i) => [f.value, `secret/inbox/demo/o${i}#value`]))
    const out = redactText(t, { ...SECRETS_ONLY, refs }).text
    expect(out).toContain('[prumo:TOKEN→secret/inbox/demo/o' + found.findIndex(f => f.value === TOK) + '#value]')
    expect(out.includes(TOK)).toBe(false)
  })
}

test('refs: api_key com Bearer entre aspas mantém o marcador TOKEN com a ref', () => {
  const out = redactText('api_key: "Bearer ' + TOK + '"', { ...SECRETS_ONLY, refs: new Map([[TOK, REF]]) }).text
  expect(out).toBe('api_key: "Bearer [prumo:TOKEN→' + REF + ']"')
})

test('refs: palavra-chave com Bearer <tok> recolhe só o token', () => {
  expect(collectSecrets(PW + 'Bearer ' + TOK, SECRETS_ONLY)).toEqual([{ cls: 'TOKEN', value: TOK }])
})

// M1
test('refs: valor que é substring de outro mantém a ordem de aparição', () => {
  const long = 'Xk9mPq2vL' + 'ZZ'
  const got = collectSecrets(SN + '' + long + ' e depois ' + PW + W, SECRETS_ONLY).map(s => s.value)
  expect(got).toEqual([long, W])
  const got2 = collectSecrets(PW + '' + W + 'ZZ' + ' antes\n' + PW + W, SECRETS_ONLY).map(s => s.value)
  expect(got2).toEqual([W + 'ZZ', W])
})

// M2
test('refs: referência ecoada depois de palavra-chave não é recolhida', () => {
  expect(collectSecrets(SN + 'secret/inbox/demo/abc#value', SECRETS_ONLY)).toEqual([])
})

// I2
test('refs: padrões extra só são recolhidos com secret: true, e são sempre redigidos', () => {
  const { patterns } = compileExtra({ patterns: [
    { name: 'ORG-SEG', regex: 'ORG-\\d{4}', secret: true },
    { name: 'ORG-HOST', regex: 'h\\d{4}\\.org' },
  ] })
  expect(patterns.map(p => p.secret)).toEqual([true, undefined])
  const o = { ...SECRETS_ONLY, extra: patterns }
  const t = 'cod ORG-1234 em h5678.org'
  expect(collectSecrets(t, o)).toEqual([{ cls: 'ORG-SEG', value: 'ORG-1234' }])
  expect(redactText(t, o).text).toBe('cod [prumo:ORG-SEG] em [prumo:ORG-HOST]')
})

// ronda 2: segredo colado a um marcador
const GLUED = [PW + V + '[prumo:TOKEN]', 'api_key: "' + V + '[prumo:TOKEN]"', 'senha: ' + V + '[prumo:TOKEN]']
for (const t of GLUED) {
  test(`refs: segredo colado a marcador, ${t.slice(0, 12)}`, () => {
    const found = collectSecrets(t, SECRETS_ONLY)
    expect(found.map(f => f.value)).toEqual([V])
    const out = redactText(t, SECRETS_ONLY).text
    expect(out.includes(V)).toBe(false)
    expect(out).toContain('[prumo:TOKEN]')
    const refs = new Map([[V, REF]])
    const withRef = redactText(t, { ...SECRETS_ONLY, refs }).text
    expect(leaks(withRef, V)).toBe(false)
    expect(withRef).toContain('→' + REF + ']')
  })
}

test('refs: um marcador com referência fica intacto com PII ligada (contadores >= 100, NIF válido, projeto numérico)', () => {
  const ok = (ref: string) => {
    const m = '[prumo:SEGREDO→' + ref + ']'
    // eco sem opts.refs (session.append): só a ref registada pelo capture.ts fica protegida
    rememberRef(ref)
    const r = redactText('x ' + m + ' y', { pii: true, internalIps: true, extra: [] })
    expect(r.text).toBe('x ' + m + ' y')
    expect(r.hits).toBe(0)
    const w = redactText(PW + W, { pii: true, internalIps: true, extra: [], refs: new Map([[W, ref]]) })
    expect(w.text).toBe(PW + m)
  }
  for (let n = 1; n < 1000; n++) {
    const ref = 'secret/inbox/proj/20261029-162526-' + n + '#value'
    ok(ref)
  }
  ok('secret/inbox/app-123456789/20261029-102030-7#value')
  ok('secret/inbox/192-168-1-1/20261029-102030-7#value')
  forgetRefs()
})

test('refs: o marcador é protegido, o PII ao lado continua a ser redigido', () => {
  const m = '[prumo:SEGREDO→secret/inbox/proj/20261029-162526-105#value]'
  rememberRef(m.slice(m.indexOf('→') + 1, -1))
  const r = redactText(m + ' ' + 'ana@example.com', { pii: true, internalIps: false, extra: [] })
  expect(r.text).toBe(m + ' [prumo:EMAIL]')
  forgetRefs()
})

import { test, expect } from 'claude-code/testing'
import { collectSecrets, forgetRefs, redactText, rememberRef } from '../hooks/redact-patterns.ts'
import { leaks, SECRETS_ONLY, V } from './coverage-cases.ts'

// Marcadores montados por concatenação: nenhum literal no ficheiro.
const OPEN = '[' + 'prumo:'
const M = (cls: string, ref?: string) => OPEN + cls + (ref === undefined ? '' : '→' + ref) + ']'
const ALL = { pii: true, internalIps: true, extra: [] }
const PW = 'Real' + '123!xYz'
const KW = 'pass' + 'word'
const GH = 'ghp_' + 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8'
const AWS = 'AK' + 'IA' + 'IOSFODNN7EXAMPLQ'
// NIF válido (dígito de controlo certo), para a regra de PII o apanhar
const NIF = '2' + '45678905'
const REF = 'secret/inbox/proj/20261029-162526-' + NIF.slice(0, 3) + '#value'

// Marcador com forma válida mas que o redactor não emitiu: é texto normal.
const fakes: [string, string, string, boolean][] = [
  ['TOKEN→ghp_', M('TOKEN', GH), GH, true],
  ['X→AKIA', M('X', AWS), AWS, true],
  ['X→url com credenciais', M('X', 'https://admin:' + PW + '@db.example.com/x'), PW, true],
  ['SEGREDO→password=', M('SEGREDO', KW + '=' + PW), PW, true],
  ['marcador simples e password=', M('X') + ' ' + KW + '=' + PW, PW, true],
  ['marcador colado a password=', M('X') + KW + '=' + PW, PW, true],
  ['ref falsa e password=', M('SEGREDO', 'secret/inbox/p/1#value') + ' ' + KW + '=' + PW, PW, true],
  ['NIF dentro de ref falsa', M('X', 'nif-' + NIF), NIF, false],
]

for (const [n, t, s, secret] of fakes) {
  test(`marcador falso: ${n} é redigido`, () => {
    forgetRefs()
    expect(redactText(t, ALL).text.includes(s)).toBe(false)
    if (secret) expect(collectSecrets(t, SECRETS_ONLY).some(f => f.value.includes(s))).toBe(true)
  })
}

test('marcador falso: ref conhecida com sufixo não conta como conhecida', () => {
  forgetRefs()
  rememberRef(REF)
  const t = M('TOKEN', REF + '/' + GH)
  expect(redactText(t, ALL).text.includes(GH)).toBe(false)
  forgetRefs()
})

test('marcador legítimo: ref em opts.refs fica intacta com PII ligada', () => {
  forgetRefs()
  const m = M('SEGREDO', REF)
  const r = redactText('x ' + m + ' y', { ...ALL, refs: new Map([['outro', REF]]) })
  expect(r.text).toBe('x ' + m + ' y')
  expect(r.hits).toBe(0)
})

test('marcador legítimo: ref registada na sessão (eco sem opts.refs) fica intacta; esquecida deixa de o ser', () => {
  forgetRefs()
  const m = M('SEGREDO', 'secret/inbox/proj/20261029-' + NIF + '#value')
  rememberRef('secret/inbox/proj/20261029-' + NIF + '#value')
  expect(redactText('eco ' + m, ALL).text).toBe('eco ' + m)
  forgetRefs()
  expect(redactText('eco ' + m, ALL).text.includes(NIF)).toBe(false)
})

test('palavra-chave como valor: api_key password=<v> recolhe só o valor', () => {
  const t = 'api_key ' + KW + '=' + V
  expect(collectSecrets(t, SECRETS_ONLY)).toEqual([{ cls: 'SEGREDO', value: V }])
  const out = redactText(t, SECRETS_ONLY).text
  expect(out.startsWith('api_key ' + KW + '=' + OPEN)).toBe(true)
  expect(leaks(out, V)).toBe(false)
})

test('palavra-chave como valor: prosa e forma "kw: " também', () => {
  for (const t of ['api_key is ' + KW + '=' + V, 'token: ' + KW + '=' + V, 'secret ' + KW + ': ' + V]) {
    expect(collectSecrets(t, SECRETS_ONLY).map(f => f.value)).toEqual([V])
    expect(leaks(redactText(t, SECRETS_ONLY).text, V)).toBe(false)
  }
})

// Ronda 1: o lookahead só salta uma palavra-chave que uma regra seguinte redige (ENV é sensível a maiúsculas).
test('palavra-chave como valor: nome minúsculo terminado em _key é valor, não palavra-chave', () => {
  for (const t of ['token: my_key=' + V, 'secret abc_key=' + V, 'a senha é sort_key=' + V]) {
    expect(leaks(redactText(t, SECRETS_ONLY).text, V)).toBe(false)
    expect(collectSecrets(t, SECRETS_ONLY).some(f => f.value.includes(V))).toBe(true)
  }
})

// Ronda 1: um marcador que nenhuma regra desta chamada emitiu, dentro do valor, faz parte do valor.
const REF7 = 'secret/inbox/proj/20261029-162526-7#value'
const glued: [string, string][] = [
  ['password=ab+M', KW + '=ab' + M('X') + PW],
  ['password: ab+M', KW + ': ab' + M('X') + PW],
  ['a senha é ab+M', 'a senha é ab' + M('X') + PW],
  ['password="ab+M"', KW + '="ab' + M('X') + PW + '"'],
  ['password=ab+M(ref conhecida)', KW + '=ab' + M('X', REF7) + PW],
  ['password=abcde+M', KW + '=abcde' + M('X') + PW],
  ['password=M colado', KW + '=' + M('X') + PW],
]
for (const [n, t] of glued) {
  test(`marcador falso dentro do valor: ${n} redige o valor inteiro`, () => {
    forgetRefs()
    rememberRef(REF7)
    const out = redactText(t, ALL).text
    expect(out.includes(PW)).toBe(false)
    expect(out.includes('ab')).toBe(false)
    expect(collectSecrets(t, SECRETS_ONLY).some(f => f.value.includes(PW))).toBe(true)
    forgetRefs()
  })
}

test('marcador emitido nesta chamada dentro do valor: api_key "Bearer <tok>" mantém TOKEN com a ref e não recolhe Bearer', () => {
  const tok = 'abcdEFGH' + '12345678xyz'
  expect(collectSecrets('api_key: "Bearer ' + tok + '"', SECRETS_ONLY)).toEqual([{ cls: 'TOKEN', value: tok }])
  const out = redactText('api_key: "Bearer ' + tok + '"', { ...SECRETS_ONLY, refs: new Map([[tok, REF7]]) }).text
  expect(out).toBe('api_key: "Bearer ' + M('TOKEN', REF7) + '"')
})

test('marcador emitido nesta chamada colado ao valor: o prefixo é redigido e o marcador fica', () => {
  const pem = '-----BEGIN RSA PRIVATE KEY-----\nMIIabc\n-----END RSA PRIVATE KEY-----'
  const t = KW + '=' + V + pem
  const got = collectSecrets(t, SECRETS_ONLY).map(f => f.value)
  expect(got).toContain(V)
  expect(got).toContain(pem)
  const out = redactText(t, SECRETS_ONLY).text
  expect(out).toBe(KW + '=' + M('SEGREDO') + M('CHAVE-PRIVADA'))
})

// Ronda 1 (ruling): pontuação de fecho não entra no valor gravado
test('pontuação de fecho: [password=V], (password=V) e "password=V." recolhem exactamente V', () => {
  for (const [t, tail] of [['[' + KW + '=' + V + ']', ']'], ['(' + KW + '=' + V + ')', ')'], ['use ' + KW + '=' + V + '.', '.'], ['use ' + KW + '=' + V + '. e mais', '. e mais']]) {
    expect(collectSecrets(t, SECRETS_ONLY).map(f => f.value)).toEqual([V])
    expect(redactText(t, SECRETS_ONLY).text.endsWith(M('SEGREDO') + tail)).toBe(true)
  }
})

test('pontuação de fecho: ")" sem parêntese de abertura antes da palavra-chave é do valor', () => {
  expect(collectSecrets(KW + '=' + V + ')', SECRETS_ONLY).map(f => f.value)).toEqual([V + ')'])
  expect(collectSecrets('x ' + KW + '=' + V + ']', SECRETS_ONLY).map(f => f.value)).toEqual([V + ']'])
  expect(collectSecrets(KW + '=' + V + '.x', SECRETS_ONLY).map(f => f.value)).toEqual([V + '.x'])
})

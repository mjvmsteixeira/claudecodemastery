import { test, expect } from 'claude-code/testing'
import { redactText, collectSecrets } from '../hooks/redact-patterns.ts'
import * as Fase1 from './fixtures/redact-patterns-fase1.ts'

// Revisão final da fase 3: palavra-chave como valor, janela da prosa, marcador falso com ref e desempenho da URL.
const O = { pii: false, internalIps: false, extra: [] }
const M = '[' + 'prumo:'
const V = 'Zx9' + 'qwerT/yu!p'
const PW = 'pass' + 'word'
const TK = 'to' + 'ken'

const keywordCases: Array<[string, string]> = [
  ['is + ENV', 'the ' + PW + ' is DB' + '_KEY ' + V],
  [': + ENV', PW + ': DB' + '_KEY ' + V],
  [': + outra palavra-chave', TK + ': api' + '_key ' + V],
  ['is + ( + ENV', PW + ' is (AWS_SECRET' + '_KEY ' + V],
  ['= espaço + ENV', PW + '= API' + '_KEY ' + V],
  ['token: password', TK + ': ' + PW + ' ' + V],
  ['password: token', PW + ': ' + TK + ' ' + V],
  ['password is token', PW + ' is ' + TK + ' ' + V],
  ['[ + palavra-chave', PW + ': [' + TK + ' ' + V],
]

for (const [name, t] of keywordCases) {
  test(`palavra-chave como valor: ${name} redige o valor seguinte`, () => {
    expect(redactText(t, O).text.includes(V)).toBe(false)
    expect(collectSecrets(t, O).map(c => c.value)).toContain(V)
  })
}

test('palavra-chave sem valor a seguir é o próprio valor', () => {
  const own = 'sec' + 'ret_x9'
  const r = redactText(PW + ': ' + own + ' fim', O)
  expect(r.text).toBe(PW + ': ' + M + 'SEGREDO] fim')
})

test('janela da prosa não passa um marcador emitido como se fosse curto (semente 11 do fuzzing)', () => {
  const sk = 's' + 'k-' + 'A1b2'.repeat(6)
  const t = '[access' + '_key é ' + sk + ')"' + M + 'SEGREDO] is (AWS_SECRET' + '_KEY ' + V + ' fim'
  const now = redactText(t, O).text
  expect(Fase1.redactText(t, O).text.includes(V)).toBe(false)
  expect(now.includes(V)).toBe(false)
  expect(now.includes('AWS_SECRET' + '_KEY')).toBe(true)
})

test('valor colado a um marcador acaba antes da palavra-chave seguinte', () => {
  const gh = 'gh' + 'p_' + 'A1b2'.repeat(9)
  const t = TK + ': ' + gh + '(db_' + PW + '\t' + V
  const r = redactText(t, O).text
  expect(r.includes(V)).toBe(false)
  expect(r.includes(gh)).toBe(false)
})

test('marcador falso com ref fora da forma da inbox é valor: redigido e recolhido', () => {
  const secret = 'Zq9' + 'secRet!x'
  for (const t of [PW + '=' + M + 'X→' + secret + ']', PW + ': ' + M + 'SEGREDO→' + secret + ']', 'DB' + '_KEY=' + M + 'X→' + secret + ']']) {
    expect(redactText(t, O).text.includes(secret)).toBe(false)
    expect(collectSecrets(t, O).some(c => c.value.includes(secret))).toBe(true)
  }
})

test('marcador com ref da inbox continua a ser um valor já redigido', () => {
  const t = PW + '=' + M + 'SEGREDO→secret/inbox/p/20261029-1#value]'
  expect(redactText(t, O).hits).toBe(0)
  expect(collectSecrets(t, O)).toEqual([])
})

// Ronda extra: um marcador seguido de pontuação continua sozinho; o valor seguinte não engole a palavra-chave
// que está a mais de 40 caracteres (limite do GLUED_KEYWORD). Regressões face à fase 1 numa versão intermédia.
const SK = 's' + 'k-' + 'A1b2'.repeat(6)
const AK = 'AK' + 'IA' + 'ABCDEFGHJKLMNPQR'
const X41 = 'x'.repeat(41)
const punctCases: Array<[string, string]> = [
  ['.<41x>password:', 'api' + '_key=' + SK + '.' + X41 + PW + ': ' + V],
  [').<41x>password is', 'api' + '_key=' + SK + ').' + X41 + PW + ' is ' + V],
  [': !<41x>password:', 'api' + '_key: ' + SK + '!' + X41 + PW + ': ' + V],
  ['.user@[x é', PW + ': ' + AK + '.user@[x é ' + V],
]
for (const [name, t] of punctCases) {
  test(`marcador seguido de pontuação: ${name} redige o valor seguinte`, () => {
    expect(Fase1.redactText(t, O).text.includes(V)).toBe(false)
    expect(redactText(t, O).text.includes(V)).toBe(false)
  })
}

test('URL-CREDENCIAIS linear: 390 KB de a-a- e 195 KB de a.a.…@ em menos de 2 s cada', () => {
  for (const t of ['a-'.repeat(200000), 'a.'.repeat(100000) + '@']) {
    const s = performance.now()
    redactText(t, { pii: true, internalIps: true, extra: [] })
    expect(performance.now() - s).toBeLessThan(2000)
  }
})

test('URL-CREDENCIAIS com o esquema colado a mais de 32 letras', () => {
  const pw = 'Zp' + 'abc9!x'
  const t = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef' + 'https://admin:' + pw + '@db.example.com'
  expect(redactText(t, O).text.includes(pw)).toBe(false)
})

test('URL-CREDENCIAIS continua a apanhar esquemas habituais', () => {
  const pw = 'Zp' + 'abc9!x'
  for (const scheme of ['https', 'postgres', 'mongodb+srv', 'git+ssh']) {
    expect(redactText(scheme + '://admin:' + pw + '@db.example.com', O).text).toBe(scheme + '://admin:' + M + 'SEGREDO]@db.example.com')
  }
})

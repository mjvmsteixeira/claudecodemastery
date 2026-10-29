import { test, expect } from 'claude-code/testing'
import { redactText } from '../hooks/redact-patterns.ts'

const SECRETS_ONLY = { pii: false, internalIps: false, extra: [] }

const V = 'Xk9' + '#mPq2vL'
const W = 'Xk9' + 'mPq2vL'

function leaks(out: string, value: string): boolean {
  for (let i = 0; i + 4 <= value.length; i++) if (out.includes(value.slice(i, i + 4))) return true
  return false
}

type Positive = { n: number; text: string; values: string[]; cls: string[] }

const SK_PROJ = 'sk-' + 'proj-' + 'A1b2'.repeat(10)
const SK_ANT = 'sk-' + 'ant-api03-' + 'A1b2'.repeat(12)
const SK_LIVE = 'sk_' + 'live_' + '51Habc' + 'd1'.repeat(12)
const AIZA = 'AI' + 'za' + 'SyA1b2C3d4E5f6G7h8I9j0KlMnOpQrStUv' + 'w'
const GLPAT = 'gl' + 'pat-' + 'AbCdEfGhIjKlMnOpQrSt'
const NPM = 'np' + 'm_' + 'A1b2'.repeat(9)
const AWS_SECRET = '9wJalrXUtnFEMI/' + 'K7MDENG/bPxRfiCYEXAMPLEKEY'
const STRIPE = 'sk_' + 'live_' + 'abc123def456'
const TG = '7123456789:' + 'AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw' + 'w'
const SLACK = 'xa' + 'pp-1-A0B1C2D3E4-' + '123456'

const positives: Positive[] = [
  { n: 1, text: 'a senha do servidor é ' + V, values: [V], cls: ['SEGREDO'] },
  { n: 2, text: 'senha: ' + V, values: [V], cls: ['SEGREDO'] },
  { n: 3, text: 'palavra-passe = ' + V, values: [V], cls: ['SEGREDO'] },
  { n: 4, text: 'user admin pass ' + W, values: [W], cls: ['SEGREDO'] },
  { n: 5, text: 'the password is ' + W, values: [W], cls: ['SEGREDO'] },
  { n: 6, text: 'password=' + 'Ab#' + '12', values: ['Ab#12'], cls: ['SEGREDO'] },
  { n: 7, text: 'password=' + 'Ab;cd' + '#1234', values: ['Ab;cd#1234'], cls: ['SEGREDO'] },
  { n: 8, text: 'password=' + 'Xk9,' + 'mPq2vL', values: ['Xk9,mPq2vL'], cls: ['SEGREDO'] },
  { n: 10, text: 'usa esta key ' + SK_PROJ, values: [SK_PROJ], cls: ['CHAVE-API'] },
  { n: 11, text: SK_ANT, values: [SK_ANT], cls: ['CHAVE-API'] },
  { n: 12, text: SK_LIVE, values: [SK_LIVE], cls: ['CHAVE-API'] },
  { n: 13, text: AIZA, values: [AIZA], cls: ['CHAVE-API'] },
  { n: 14, text: GLPAT, values: [GLPAT], cls: ['CHAVE-API'] },
  { n: 15, text: NPM, values: [NPM], cls: ['CHAVE-API'] },
  { n: 16, text: 'aws secret ' + AWS_SECRET, values: [AWS_SECRET], cls: ['SEGREDO'] },
  { n: 17, text: 'DB_PASS=' + W + '\nSTRIPE_KEY=' + STRIPE, values: [W, STRIPE], cls: ['SEGREDO'] },
  { n: 18, text: 'db:\n  pass: ' + W, values: [W], cls: ['SEGREDO'] },
  { n: 19, text: 'token do bot: ' + TG, values: [TG], cls: ['TELEGRAM-TOKEN'] },
  { n: 20, text: SLACK, values: [SLACK], cls: ['SLACK-TOKEN'] },
]

for (const p of positives) {
  test(`cobertura: caso ${p.n} é redigido`, () => {
    const r = redactText(p.text, SECRETS_ONLY)
    for (const v of p.values) expect(leaks(r.text, v)).toBe(false)
    for (const c of p.cls) expect(r.classes).toContain(c)
  })
}

test('cobertura: caso 9, aspas mantidas e conteúdo trocado', () => {
  const r = redactText('password="' + 'correct horse' + ' battery"', SECRETS_ONLY)
  expect(r.text).toBe('password="[prumo:SEGREDO]"')
})

test('cobertura: caso 17, as duas linhas ficam redigidas', () => {
  const r = redactText('DB_PASS=' + W + '\nSTRIPE_KEY=' + STRIPE, SECRETS_ONLY)
  expect(r.text.split('\n').every(l => l.includes('[prumo:'))).toBe(true)
  expect(r.hits).toBe(2)
})

test('cobertura: caso 7, o valor inteiro sai incluindo o ponto e vírgula', () => {
  expect(redactText('password=' + 'Ab;cd' + '#1234', SECRETS_ONLY).text).toBe('password=[prumo:SEGREDO]')
})

test('cobertura: valor termina em ponto e vírgula seguido de espaço', () => {
  const r = redactText('password=abc123; ls', SECRETS_ONLY)
  expect(r.text).toBe('password=[prumo:SEGREDO]; ls')
})

test('cobertura: sort_key minúsculo não é segredo', () => {
  expect(redactText('sort_key=created_at', SECRETS_ONLY).hits).toBe(0)
})

const negatives: Array<[string, string]> = [
  ['N1', '// run_with_secret: ' + 'desligado até a pessoa o ligar'],
  ['N2', "'run_with_secret: " + "pedido de aprovação aberto ao humano'"],
  ['N3', 'API_KEY = ' + 'process.env.API_KEY'],
  ['N4a', 'password=' + '$DB_PASSWORD'],
  ['N4b', 'token: ' + '${TOKEN}'],
  ['N5a', 'password = ' + "os.environ['DB_PASSWORD']"],
  ['N5b', 'token = ' + "ENV['GH_TOKEN']"],
  ['N6a', 'password: ' + 'string'],
  ['N6b', 'password: ' + 'str'],
  ['N6c', 'token: ' + 'null'],
  ['N6d', 'secret=' + 'true'],
  ['N6e', 'password: ' + 'required'],
  ['N7a', 'the password is required'],
  ['N7b', 'password reset sent'],
  ['N7c', 'reset the token now'],
  ['N8a', 'compass: northeast'],
  ['N8b', 'bypass=enabled'],
  ['N9a', 'task-' + 'a'.repeat(30)],
  ['N9b', 'risk-assessment-for-the-quarterly-report'],
  ['N10a', 'password: ' + '{{ vault_password }}'],
  ['N10b', 'password=' + '<PASSWORD>'],
]

for (const [id, text] of negatives) {
  test(`cobertura: ${id} fica intacto`, () => {
    const r = redactText(text, SECRETS_ONLY)
    expect(r.hits).toBe(0)
    expect(r.text).toBe(text)
  })
}

test('cobertura: texto já redigido não é redigido outra vez', () => {
  const t = 'password=' + '[prumo' + ':SEGREDO]'
  expect(redactText(t, SECRETS_ONLY).hits).toBe(0)
})

test('cobertura: N11, PIN de 4 dígitos não é coberto de propósito', () => {
  expect(redactText('o PIN é 4821', SECRETS_ONLY).hits).toBe(0)
})

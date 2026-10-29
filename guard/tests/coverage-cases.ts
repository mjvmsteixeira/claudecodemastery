export const SECRETS_ONLY = { pii: false, internalIps: false, extra: [] }

export const V = 'Xk9' + '#mPq2vL'
export const W = 'Xk9' + 'mPq2vL'

export function leaks(out: string, value: string): boolean {
  for (let i = 0; i + 4 <= value.length; i++) if (out.includes(value.slice(i, i + 4))) return true
  return false
}

export type Positive = { n: number; text: string; values: string[]; cls: string[] }

const SK_PROJ = 'sk-' + 'proj-' + 'A1b2'.repeat(10)
const SK_ANT = 'sk-' + 'ant-api03-' + 'A1b2'.repeat(12)
const SK_LIVE = 'sk_' + 'live_' + '51Habc' + 'd1'.repeat(12)
const AIZA = 'AI' + 'za' + 'SyA1b2C3d4E5f6G7h8I9j0KlMnOpQrStUv' + 'w'
const GLPAT = 'gl' + 'pat-' + 'AbCdEfGhIjKlMnOpQrSt'
const NPM = 'np' + 'm_' + 'A1b2'.repeat(9)
const AWS_SECRET = '9wJalrXUtnFEMI/' + 'K7MDENG/bPxRfiCYEXAMPLEKEY'
export const STRIPE = 'sk_' + 'live_' + 'abc123def456'
const TG = '7123456789:' + 'AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw' + 'w'
const SLACK = 'xa' + 'pp-1-A0B1C2D3E4-' + '123456'

export const positives: Positive[] = [
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

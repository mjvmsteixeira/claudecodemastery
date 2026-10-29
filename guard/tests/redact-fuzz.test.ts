import { test, expect } from 'claude-code/testing'
import { redactText, collectSecrets, rememberRef, forgetRefs } from '../hooks/redact-patterns.ts'
import * as Fase1 from './fixtures/redact-patterns-fase1.ts'
import { positives, leaks, SECRETS_ONLY } from './coverage-cases.ts'

// Fuzzing com semente fixa (mulberry32): o mesmo corpus em todas as corridas.
function rng(seed: number): () => number {
  let s = seed
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const M = '[' + 'prumo:'
const KNOWN = 'secret/inbox/p/20261029-105#value'
const SENTINEL_CHARS = /[\uFDD0-\uFDEF]/
const ALNUM = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
const KWS = ['pass' + 'word', 'Pass' + 'word', 'PASS' + 'WORD', 'db_' + 'pass' + 'word', 'to' + 'ken', 'api' + '_key', 'API' + '-KEY', 'DB' + '_KEY', 'AWS_SECRET' + '_KEY', 'pa' + 'ss', 'sen' + 'ha', 'sec' + 'ret', 'client_' + 'secret', 'pass' + 'phrase', 'Bea' + 'rer', 'p' + 'wd', 'palavra-' + 'passe', 'access' + '_key']

function generator(seed: number) {
  const rnd = rng(seed)
  const pick = <T,>(a: T[]): T => a[Math.floor(rnd() * a.length)] as T
  const rs = (n: number, cs = ALNUM) => Array.from({ length: n }, () => cs[Math.floor(rnd() * cs.length)]).join('')
  const value = (): string =>
    pick([
      () => 'Zq' + rs(6) + pick(['!', '#', '9', '%', '@', '^', '$x', '&', '.', ']', ')', '9.', '*', '~']) + rs(3),
      () => 'gh' + 'p_' + rs(36),
      () => 'AK' + 'IA' + rs(16, 'ABCDEFGHJKLMNPQRSTUVWXYZ234567'),
      () => 'hv' + 's.' + rs(24),
      () => 'ey' + 'J' + rs(12) + '.' + rs(8) + '.' + rs(8),
      () => 's' + 'k-' + rs(24),
      () => 'Zx9' + rs(5) + '/' + rs(4),
    ])()
  const seps = ['=', ': ', ':', ' = ', ' is ', ' é ', ' ', '="', "='", ': "', '":"', '"=', '\t', '=  ']
  const fakes = [M + 'SEGREDO]', M + 'X]', M + 'SEGREDO→' + KNOWN + ']', M + 'SEGREDO→secret/inbox/p/20261029-1#value]', M + 'TOKEN]', '\uFDD0\uFDD2\uFDD1', '\uFDD0', M + 'SEGREDO→zz]']
  const unit = (vals: string[]): string => {
    const r = rnd()
    if (r < 0.5) {
      const v = value()
      vals.push(v)
      const sep = pick(seps)
      const q = sep.endsWith('"') ? '"' : sep.endsWith("'") ? "'" : ''
      return pick(['', '(', '[', 'export ', '`']) + pick(KWS) + sep + v + q + pick(['', '.', ')', ']', '`', ',', '!'])
    }
    if (r < 0.65) {
      const v = value()
      vals.push(v)
      return v
    }
    if (r < 0.85) return pick(fakes)
    if (r < 0.9) return 'https://admin:' + M + 'SEGREDO]@db.example.com'
    return pick(KWS)
  }
  // texto livre: unidades coladas por pontuação, espaços, URLs e PII
  const glued = () => {
    const vals: string[] = []
    const glue = ['Bea' + 'rer ', ' is ', '=', ':', '"', '%', '$', '{{', '<', '\\', 'user@', ' 192.168.1.1 ', '', ' ', '\n', ', ', '; ', '(', ')', '[', ']', '.', '`', "'", '&', ' - ', '/', '@', '://', 'https://u:']
    const parts: string[] = []
    const n = 1 + Math.floor(rnd() * 6)
    for (let i = 0; i < n; i++) parts.push(unit(vals), pick(glue))
    return { text: parts.join(''), vals }
  }
  // frases separadas por espaço ou linha: aqui o motor da fase 1 é a referência
  const spaced = () => {
    const vals: string[] = []
    const parts: string[] = []
    const n = 1 + Math.floor(rnd() * 5)
    for (let i = 0; i < n; i++) parts.push(unit(vals), pick([' ', '\n', ' e ', '\n\n', ' | ']))
    return { text: parts.join(''), vals }
  }
  return { glued, spaced }
}

const opts = (pii: boolean) => ({ pii, internalIps: pii, extra: [] })

function check(text: string, vals: string[], pii: boolean): string[] {
  const o = opts(pii)
  const bad: string[] = []
  forgetRefs()
  rememberRef(KNOWN)
  const col = collectSecrets(text, o)
  const refs = new Map(col.map((c, j) => [c.value, `secret/inbox/p/r-${j}#value`]))
  for (const r of refs.values()) rememberRef(r)
  const withRefs = redactText(text, { ...o, refs }).text
  const plain = redactText(text, o).text
  if (SENTINEL_CHARS.test(withRefs) || SENTINEL_CHARS.test(plain)) bad.push('sentinela no texto')
  for (const c of col) {
    if (SENTINEL_CHARS.test(c.value)) bad.push('sentinela num valor recolhido')
    // valores feitos só de marcadores falsos podem repetir-se noutro sítio do texto
    if (!vals.some(v => c.value.includes(v))) continue
    if (withRefs.includes(c.value)) bad.push('recolhido fica no texto (refs)')
    if (plain.includes(c.value)) bad.push('recolhido fica no texto')
  }
  forgetRefs()
  return bad
}

const N = 600

test('fuzz: sem sentinelas no texto, valores recolhidos fora do texto (com e sem refs)', () => {
  const g = generator(11)
  const failures: string[] = []
  for (let i = 0; i < N; i++) {
    const { text, vals } = g.glued()
    for (const b of check(text, vals, i % 2 === 0)) failures.push(`#${i}: ${b}`)
  }
  expect(failures).toEqual([])
})

test('fuzz: nada que o motor da fase 1 redigia em frases separadas por espaço passa em claro', () => {
  const g = generator(7)
  const failures: string[] = []
  for (let i = 0; i < N; i++) {
    const { text, vals } = g.spaced()
    const o = opts(false)
    const before = Fase1.redactText(text, o).text
    forgetRefs()
    rememberRef(KNOWN)
    const col = collectSecrets(text, o)
    const refs = new Map(col.map((c, j) => [c.value, `secret/inbox/p/r-${j}#value`]))
    const now = redactText(text, o).text
    const nowRefs = redactText(text, { ...o, refs }).text
    forgetRefs()
    // No motor da fase 1 o texto do marcador emitido ficava no texto: o `TOKEN` de um marcador da classe GITHUB-TOKEN servia de
    // palavra-chave a uma regra seguinte (`<marcador> e Bearer is <v>`). É um acaso, não cobertura: esses textos ficam fora.
    const tokenInMarker = /TOKEN\]/.test(before)
    if (!tokenInMarker) for (const v of vals) if (!before.includes(v) && (now.includes(v) || nowRefs.includes(v))) failures.push(`#${i}: valor de ${v.length} caracteres em claro`)
    for (const b of check(text, vals, false)) failures.push(`#${i}: ${b}`)
  }
  expect(failures).toEqual([])
})

// Texto colado contra a fase 1: aqui há diferenças assumidas. O motor da fase 1 apanhava alguns valores por engolir
// um troço longo de lixo colado (marcadores, URLs, palavras-chave sem espaço); a fase 3 estreitou isso de propósito
// (marcador falso, pontuação de fecho fora do valor, palavra-chave como valor). Medido no mulberry com 7 sementes ×
// 40 000: 29 regressões não-TOKEN (~1 em 10 000). Aqui a semente e o N são fixos e o limite é o valor medido com
// este motor (0). A semente 5 dá 3 com o motor de 18f3bbe e 1 com o de a3d7adc (pontuação depois do marcador):
// uma alteração que o suba é uma regressão nova a rever, não um número a actualizar sem olhar.
const GLUED_N = 4000
const GLUED_MAX_REGRESSIONS = 0

test(`fuzz: texto colado contra a fase 1, no máximo ${GLUED_MAX_REGRESSIONS} regressões em ${GLUED_N}`, () => {
  const g = generator(5)
  const o = opts(false)
  const found: string[] = []
  for (let i = 0; i < GLUED_N; i++) {
    const { text, vals } = g.glued()
    const before = Fase1.redactText(text, o).text
    if (/TOKEN\]/.test(before)) continue
    const now = redactText(text, o).text
    for (const v of vals) if (!before.includes(v) && now.includes(v)) found.push(`#${i}`)
  }
  expect(found.length).toBeLessThan(GLUED_MAX_REGRESSIONS + 1)
})

test('fuzz: corpus de positivos da fase 1, sozinho e em frases baralhadas, sem regressão', () => {
  const rnd = rng(3)
  const failures: string[] = []
  const texts = positives.map(p => ({ text: p.text, values: p.values }))
  for (let i = 0; i < 40; i++) {
    const a = positives[Math.floor(rnd() * positives.length)]
    const b = positives[Math.floor(rnd() * positives.length)]
    if (a && b) texts.push({ text: a.text + (rnd() < 0.5 ? '\n' : ' e ') + b.text, values: [...a.values, ...b.values] })
  }
  for (const { text, values } of texts) {
    const before = Fase1.redactText(text, SECRETS_ONLY).text
    const now = redactText(text, SECRETS_ONLY).text
    for (const v of values) if (!leaks(before, v) && leaks(now, v)) failures.push(JSON.stringify(text.slice(0, 20)))
  }
  expect(failures).toEqual([])
})

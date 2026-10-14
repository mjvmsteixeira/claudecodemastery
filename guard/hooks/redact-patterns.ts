export type ExtraPattern = { name: string; re: RegExp }
export type RedactOptions = { pii: boolean; internalIps: boolean; extra: ExtraPattern[] }

type Rule = {
  name: string
  re: RegExp
  pii?: boolean
  ip?: boolean
  valid?: (match: string) => boolean
  replace?: (match: string, ...groups: string[]) => string
}

const ph = (name: string) => `[prumo:${name}]`

function nifValid(raw: string): boolean {
  const d = raw.replace(/[\s-]/g, '')
  if (!/^[1-9]\d{8}$/.test(d)) return false
  let sum = 0
  for (let i = 0; i < 8; i++) sum += Number(d[i]) * (9 - i)
  const r = sum % 11
  return (r < 2 ? 0 : 11 - r) === Number(d[8])
}

function ccValid(raw: string): boolean {
  const v = raw.replace(/[\s-]/g, '').toUpperCase()
  if (!/^\d{9}[A-Z0-9]{2}\d$/.test(v)) return false
  let sum = 0
  let second = false
  for (let i = v.length - 1; i >= 0; i--) {
    const ch = v[i] as string
    let n = /\d/.test(ch) ? Number(ch) : ch.charCodeAt(0) - 55
    if (second) {
      n *= 2
      if (n > 9) n -= 9
    }
    sum += n
    second = !second
  }
  return sum % 10 === 0
}

function ibanValid(raw: string): boolean {
  const v = raw.replace(/\s/g, '').toUpperCase()
  const moved = v.slice(4) + v.slice(0, 4)
  let rem = 0
  for (const ch of moved) {
    const digits = /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55)
    for (const dg of digits) rem = (rem * 10 + Number(dg)) % 97
  }
  return rem === 1
}

const RULES: Rule[] = [
  { name: 'CHAVE-PRIVADA', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g },
  { name: 'JWT', re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}/g },
  { name: 'VAULT-TOKEN', re: /\bhv[sbr]\.[A-Za-z0-9_-]{20,}/g },
  { name: 'AWS-KEY', re: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g },
  { name: 'GITHUB-TOKEN', re: /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})/g },
  { name: 'SLACK-TOKEN', re: /\bxox[abprs]-[A-Za-z0-9-]{10,}/g },
  { name: 'TOKEN', re: /\b(Bearer)\s+[A-Za-z0-9._~+/-]{16,}=*/g, replace: (_m, kw) => `${kw} ${ph('TOKEN')}` },
  {
    name: 'SEGREDO',
    re: /\b((?:password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|client[_-]?secret)\s*[=:]\s*)(["']?)([^\s"'&;,]{6,})\2/gi,
    replace: (_m, lead, q) => `${lead}${q}${ph('SEGREDO')}${q}`,
  },
  { name: 'EMAIL', pii: true, re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
  { name: 'IBAN', pii: true, re: /\bPT\d{2}(?:\s?\d{4}){5}\s?\d\b/gi, valid: ibanValid },
  { name: 'CC', pii: true, re: /\b\d{8}\s?\d\s?[A-Za-z]{2}\d\b/g, valid: ccValid },
  { name: 'NIF', pii: true, re: /\b[1-9]\d{2}[\s-]?\d{3}[\s-]?\d{3}\b/g, valid: nifValid },
  { name: 'TELEFONE', pii: true, re: /(?:\+351[\s-]?[239]\d{2}[\s-]?\d{3}[\s-]?\d{3}\b|\b[239]\d{2}[\s-]\d{3}[\s-]\d{3}\b)/g },
  { name: 'IP-INTERNO', ip: true, re: /\b(?:10\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])|192\.168)\.\d{1,3}\.\d{1,3}\b/g },
]

export const PLACEHOLDER_RE = /\[prumo:[A-Z0-9-]+\]/g

export function countPlaceholders(text: string): number {
  return (text.match(PLACEHOLDER_RE) ?? []).length
}

export function redactText(text: string, opts: RedactOptions): { text: string; hits: number; classes: string[] } {
  let out = text
  let hits = 0
  const classes = new Set<string>()
  const rules: Rule[] = [...RULES, ...opts.extra.map(x => ({ name: x.name, re: x.re }))]
  for (const rule of rules) {
    if (rule.pii && !opts.pii) continue
    if (rule.ip && !opts.internalIps) continue
    out = out.replace(rule.re, (match: string, ...rest: unknown[]) => {
      if (rule.valid && !rule.valid(match)) return match
      hits += 1
      classes.add(rule.name)
      const groups = rest.filter((g): g is string => typeof g === 'string')
      return rule.replace ? rule.replace(match, ...groups) : ph(rule.name)
    })
  }
  return { text: out, hits, classes: [...classes] }
}

export function compileExtra(raw: unknown): { patterns: ExtraPattern[]; errors: string[] } {
  const patterns: ExtraPattern[] = []
  const errors: string[] = []
  const list = typeof raw === 'object' && raw !== null ? (raw as { patterns?: unknown }).patterns : undefined
  if (!Array.isArray(list)) return { patterns, errors }
  for (const item of list) {
    const p = item as { name?: unknown; regex?: unknown; flags?: unknown }
    if (typeof p.name !== 'string' || typeof p.regex !== 'string' || !/^[A-Z0-9-]+$/.test(p.name)) {
      errors.push(`padrão inválido: ${JSON.stringify(item)}`)
      continue
    }
    const flags = typeof p.flags === 'string' ? p.flags : 'g'
    try {
      patterns.push({ name: p.name, re: new RegExp(p.regex, flags.includes('g') ? flags : `${flags}g`) })
    } catch (err) {
      errors.push(`${p.name}: ${String(err)}`)
    }
  }
  return { patterns, errors }
}

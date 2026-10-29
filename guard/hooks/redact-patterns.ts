export type ExtraPattern = { name: string; re: RegExp; secret?: boolean }
export type RedactOptions = { pii: boolean; internalIps: boolean; extra: ExtraPattern[]; refs?: ReadonlyMap<string, string> }

type Rule = {
  name: string
  re: RegExp
  pii?: boolean
  ip?: boolean
  collect?: boolean
  valid?: (match: string) => boolean
  replace?: (mark: Mark, match: string, ...groups: (string | undefined)[]) => string
}

type Mark = (value: string, cls?: string) => string

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

const KEYWORD_SUFFIX = String.raw`(?:_[A-Za-z0-9_]*)?`
const KEYWORDS_OTHER = String.raw`(?:password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|client[_-]?secret|senha|palavra[-_ ]passe|passphrase)${KEYWORD_SUFFIX}`
// 'pass' sozinho é também um verbo ("pass rate", pass "all tests passed"): as aspas com espaços pedem mais prova
const KEYWORDS_PASS = String.raw`(?<![A-Za-z])pass${KEYWORD_SUFFIX}`
// sensível a maiúsculas para não apanhar sort_key=created_at
const KEYWORDS_ENV = String.raw`\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*_KEY`

// referências a variáveis, placeholders e literais não são valores; "99.5%" é uma taxa, não uma palavra-passe
const NOT_A_VALUE = String.raw`(?!\[prumo:|\$|\\\$(?:[({]|[A-Z_]{2})|process\.env|os\.environ|ENV\[|<|\{\{|\d[\d.,]*%(?![^\s"'&;,.)]))(?!(?:true|false|null|none|nil|undefined|string|str|number|int|bool|boolean|required|optional)(?![^\s"'&;,.)]))`
// pontuação de fim de frase ou de markdown: nunca conta como símbolo nem pertence ao valor
const TRAIL = '.)\\]`*!?:'
const UNQUOTED = String.raw`(?:[^\s"'&;,]|[;,](?=[^\s"'&;,])){5,}`
const UNQUOTED_TRIM = String.raw`${UNQUOTED}(?<![${TRAIL}])`
const QUOTED = String.raw`(["'])${NOT_A_VALUE}[^"'\n]{5,}\2`
// em prosa só conta com dígito ou símbolo dentro do valor (a pontuação interna conta, a final não); sem isto "password reset" seria segredo
const SYMBOL = String.raw`(?:[^\p{L}\s"'&;,${TRAIL}]|(?<=[^\s"'&;,${TRAIL}])[${TRAIL.replace(':', '')}](?=[^\s"'&;,${TRAIL}]))`
// depois de uma palavra solta o '/', '_' e '-' são caminhos e nomes (auth/approle/login), não sinal de segredo
const SYMBOL_STRICT = String.raw`[^\p{L}\s"'&;,${TRAIL}/_-]`
const hasDigitOrSymbol = (symbol: string, skip = '') =>
  String.raw`(?=(?:\p{L}|[${TRAIL}${skip}])*(?:${symbol}|[;,][^\s"'&;,]))`
// entre aspas, depois de uma palavra solta: sem espaços pede símbolo e sem expansão de shell; com espaços ("correct horse battery") serve qualquer frase sem sinais de código
const VAR = String.raw`\$(?:[({]|[A-Za-z_]{2}(?=[^"'\n]*\/))`
const QUOTED_SYMBOL = String.raw`[^\p{L}\s"'${TRAIL}/_-]`
const QUOTED_NOSPACE = String.raw`(?![^"'\s]*${VAR})(?=[^"'\s]*${QUOTED_SYMBOL})[^"'\s]{5,}`
const QUOTED_SPACED = String.raw`(?=[^"'\n]* )(?![^"'\n]*${VAR})[^"'\n\[\]{}+]{5,}`
const QUOTED_PROSE = String.raw`(["'])${NOT_A_VALUE}(?:${QUOTED_NOSPACE}|${QUOTED_SPACED})\2`
// 'pass' sozinho é também um verbo ("pass \"all tests passed\""): com espaços exige dígito ou símbolo e no máximo 4 palavras
const QUOTED_PASS_SPACED = String.raw`(?=[^"'\n]{5})(?=[^"'\n]* )(?![^"'\n]*${VAR})(?=[^"'\n]*${QUOTED_SYMBOL})[^"'\n\[\]{}+ ]+(?: [^"'\n\[\]{}+ ]+){1,3}`
const QUOTED_PASS = String.raw`(["'])${NOT_A_VALUE}(?:${QUOTED_NOSPACE}|${QUOTED_PASS_SPACED})\2`
// código de shell a seguir a uma palavra solta: flags, redirecções, caminhos, subshells, pipes
const SHELL_START = String.raw`(?:[-~/(|>]|\d>)`

function segredoRules(keywords: string, flags: string, passKeywords?: string): Rule[] {
  // o grupo 2 é a aspa quando o valor vem entre aspas; sem aspas fica undefined
  const replace = (mark: Mark, m: string, lead?: string, q?: string) => {
    const quote = typeof q === 'string' ? q : ''
    const head = (lead ?? '').length + quote.length
    return `${lead}${quote}${mark(m.slice(head, m.length - quote.length))}${quote}`
  }
  const rule = (lead: string, value: string): Rule => ({ name: 'SEGREDO', re: new RegExp(String.raw`(${lead})${value}`, flags), replace })
  const unquoted = (symbol: string, skip?: string) => `${hasDigitOrSymbol(symbol, skip)}${NOT_A_VALUE}${UNQUOTED_TRIM}`
  const all = passKeywords ? `(?:${keywords}|${passKeywords})` : keywords
  const prose = (kw: string, quoted: string) => [
    rule(String.raw`${kw}(?![A-Za-z/\\])["']?[^\n]{0,30}?[ \t](?:é|is|era|was)[ \t]+`, `(?:${quoted}|${unquoted(SYMBOL)})`),
    rule(String.raw`${kw}(?![A-Za-z/\\])(?:["'](?![ \t]+["']))?[ \t]+(?!${SHELL_START})`, `(?:${quoted}|${unquoted(SYMBOL_STRICT, '/_-')})`),
  ]
  return [
    rule(String.raw`${all}["']?[ \t]*[=:]`, `(?:${QUOTED}|${NOT_A_VALUE}${UNQUOTED})`),
    rule(String.raw`${all}(?![A-Za-z])["']?[ \t]*[=:][ \t]+`, `(?:${QUOTED}|${unquoted(SYMBOL)})`),
    ...prose(keywords, QUOTED_PROSE),
    ...(passKeywords ? prose(passKeywords, QUOTED_PASS) : []),
  ]
}

const RULES: Rule[] = [
  { name: 'CHAVE-PRIVADA', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g },
  { name: 'JWT', re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}/g },
  { name: 'VAULT-TOKEN', re: /\bhv[sbr]\.[A-Za-z0-9_-]{20,}/g },
  { name: 'AWS-KEY', re: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g },
  { name: 'GITHUB-TOKEN', re: /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})/g },
  { name: 'SLACK-TOKEN', re: /\b(?:xox[abprs]|xapp)-[A-Za-z0-9-]{10,}/g },
  { name: 'CHAVE-API', re: /\b(?:sk-[A-Za-z0-9_-]{20,}|(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{10,}|AIza[A-Za-z0-9_-]{35}|glpat-[A-Za-z0-9_-]{20,}|npm_[A-Za-z0-9]{36})/g },
  { name: 'TELEGRAM-TOKEN', re: /\b\d{8,10}:AA[A-Za-z0-9_-]{33}\b/g },
  { name: 'TOKEN', re: /\b(Bearer)\s+([A-Za-z0-9._~+/-]{16,}=*)/g, replace: (mark, _m, kw, val) => `${kw} ${mark(val as string)}` },
  ...segredoRules(KEYWORDS_OTHER, 'giu', KEYWORDS_PASS),
  ...segredoRules(KEYWORDS_ENV, 'gu'),
  { name: 'URL-CREDENCIAIS', re: /(\b[a-z][a-z0-9+.-]*:\/\/[^\s:\/@]+:)(?!\[prumo:)([^\s@\/]{3,})(@)/gi, replace: (mark, _m, lead, pw, at) => `${lead}${mark(pw as string, 'SEGREDO')}${at}` },
  { name: 'EMAIL', pii: true, re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
  { name: 'IBAN', pii: true, re: /\bPT\d{2}(?:\s?\d{4}){5}\s?\d\b/gi, valid: ibanValid },
  { name: 'CC', pii: true, re: /\b\d{8}\s?\d\s?[A-Za-z]{2}\d\b/g, valid: ccValid },
  { name: 'NIF', pii: true, re: /\b[1-9]\d{2}[\s-]?\d{3}[\s-]?\d{3}\b/g, valid: nifValid },
  { name: 'TELEFONE', pii: true, re: /(?:\+351[\s-]?[239]\d{2}[\s-]?\d{3}[\s-]?\d{3}\b|\b[239]\d{2}[\s-]\d{3}[\s-]\d{3}\b)/g },
  { name: 'IP-INTERNO', ip: true, re: /\b(?:10\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])|192\.168)\.\d{1,3}\.\d{1,3}\b/g },
]

export const PLACEHOLDER_RE = /\[prumo:[A-Z0-9-]+(?:→[^\]\s]+)?\]/g

export function countPlaceholders(text: string): number {
  return (text.match(PLACEHOLDER_RE) ?? []).length
}

function run(text: string, opts: RedactOptions, onSecret?: (cls: string, value: string, pos: number) => void): { text: string; hits: number; classes: string[] } {
  let out = text
  let hits = 0
  const classes = new Set<string>()
  const rules: Rule[] = [...RULES, ...opts.extra.map(x => ({ name: x.name, re: x.re, collect: x.secret === true }))]
  // origin[i] = posição no texto original do carácter i do texto actual; serve a ordem de aparição
  let origin: number[] = onSecret ? Array.from({ length: text.length + 1 }, (_, k) => k) : []
  for (const rule of rules) {
    if (rule.pii && !opts.pii) continue
    if (rule.ip && !opts.internalIps) continue
    const collect = !rule.pii && !rule.ip && rule.collect !== false
    const edits: [number, number, number][] = []
    out = out.replace(rule.re, (match: string, ...rest: unknown[]) => {
      if (rule.valid && !rule.valid(match)) return match
      const offset = rest[rest.findIndex(g => typeof g === 'number')] as number
      // "Bearer" solto antes de um marcador TOKEN é o prefixo do token, não o valor
      if (collect && /\bBearer$/i.test(match) && /^\s+\[prumo:TOKEN/.test(out.slice(offset + match.length))) return match
      const found: [string, string][] = []
      let tainted = false
      const mark: Mark = (value, cls = rule.name) => {
        // um marcador dentro do valor vem de uma regra anterior: redige-se o prefixo e o resto fica como está
        const at = value.indexOf('[prumo:')
        if (at >= 0) {
          const pre = value.slice(0, at)
          if (pre.length < 5 || /^\s*Bearer\s*$/i.test(pre)) {
            tainted = true
            return ph(cls)
          }
          return mark(pre, cls) + value.slice(at)
        }
        found.push([cls, value])
        const ref = opts.refs?.get(value)
        return ref === undefined ? ph(cls) : `[prumo:${cls}→${ref}]`
      }
      const groups = rest.slice(0, rest.findIndex(g => typeof g === 'number')) as (string | undefined)[]
      const replaced = rule.replace ? rule.replace(mark, match, ...groups) : mark(match)
      if (tainted) return match
      hits += 1
      classes.add(rule.name)
      if (collect) for (const [cls, value] of found) onSecret?.(cls, value, origin[offset] as number)
      edits.push([offset, match.length, replaced.length])
      return replaced
    })
    if (onSecret && edits.length > 0) {
      const next: number[] = []
      let cursor = 0
      for (const [offset, oldLen, newLen] of edits) {
        for (let k = cursor; k < offset; k++) next.push(origin[k] as number)
        for (let k = 0; k < newLen; k++) next.push(origin[offset] as number)
        cursor = offset + oldLen
      }
      for (let k = cursor; k < origin.length; k++) next.push(origin[k] as number)
      origin = next
    }
  }
  return { text: out, hits, classes: [...classes] }
}

export function redactText(text: string, opts: RedactOptions): { text: string; hits: number; classes: string[] } {
  return run(text, opts)
}

export function collectSecrets(text: string, opts: RedactOptions): { cls: string; value: string }[] {
  const found = new Map<string, { cls: string; pos: number }>()
  run(text, opts, (cls, value, pos) => {
    // uma referência ecoada depois de uma palavra-chave não é um segredo novo
    if (value.startsWith('secret/inbox/')) return
    const prev = found.get(value)
    if (!prev || pos < prev.pos) found.set(value, { cls: prev?.cls ?? cls, pos })
  })
  return [...found].sort((a, b) => a[1].pos - b[1].pos).map(([value, f]) => ({ cls: f.cls, value }))
}

export function compileExtra(raw: unknown): { patterns: ExtraPattern[]; errors: string[] } {
  const patterns: ExtraPattern[] = []
  const errors: string[] = []
  const list = typeof raw === 'object' && raw !== null ? (raw as { patterns?: unknown }).patterns : undefined
  if (!Array.isArray(list)) return { patterns, errors }
  for (const item of list) {
    const p = item as { name?: unknown; regex?: unknown; flags?: unknown; secret?: unknown }
    if (typeof p.name !== 'string' || typeof p.regex !== 'string' || !/^[A-Z0-9-]+$/.test(p.name)) {
      errors.push(`padrão inválido: ${JSON.stringify(item)}`)
      continue
    }
    const flags = typeof p.flags === 'string' ? p.flags : 'g'
    try {
      patterns.push({ name: p.name, re: new RegExp(p.regex, flags.includes('g') ? flags : `${flags}g`), ...(Object.is(p.secret, true) && { secret: true }) })
    } catch (err) {
      errors.push(`${p.name}: ${String(err)}`)
    }
  }
  return { patterns, errors }
}

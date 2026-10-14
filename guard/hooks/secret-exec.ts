const NEVER = new Set([
  'sh', 'bash', 'zsh', 'fish', 'dash', 'ksh', 'csh', 'tcsh', 'python', 'python2', 'python3', 'perl', 'ruby',
  'node', 'deno', 'bun', 'osascript', 'eval', 'env', 'xargs', 'sudo', 'doas', 'su',
])

const base = (p: string) => p.split('/').pop() ?? p

export function checkArgv(argv: string[], allow: string[]): string | null {
  if (argv.length === 0 || !argv[0]) return 'argv vazio'
  const bin = base(argv[0])
  if (NEVER.has(bin) || /^python\d/.test(bin)) return `${bin} é um shell ou interpretador e nunca corre com segredos`
  if (argv[0].includes('/')) return `${argv[0]} usa um caminho; só são aceites nomes simples de comandos (resolvidos pelo PATH)`
  if (!allow.includes(bin)) return `${bin} não está na allowlist (~/.prumo/secret-exec.json → allow)`
  return null
}

export function maskSecrets(text: string, secrets: Record<string, string>): string {
  let out = text
  for (const [name, raw] of Object.entries(secrets)) {
    for (const v of new Set([raw, raw.trimEnd(), encodeURIComponent(raw)])) {
      if (v.length < 4) continue
      out = out.split(v).join(`[SEGREDO:${name}]`)
    }
  }
  return out
}

export function parseSecretRef(ref: string): { path: string; field: string } | null {
  const i = ref.lastIndexOf('#')
  if (i <= 0 || i === ref.length - 1) return null
  return { path: ref.slice(0, i), field: ref.slice(i + 1) }
}

export function shellQuote(argv: string[]): string {
  return argv.map(a => (/^[A-Za-z0-9_@%+=:,./-]+$/.test(a) ? a : `'${a.replace(/'/g, `'"'"'`)}'`)).join(' ')
}

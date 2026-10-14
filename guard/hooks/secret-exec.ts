const NEVER = new Set([
  'sh', 'bash', 'zsh', 'fish', 'dash', 'ksh', 'csh', 'tcsh', 'python', 'python2', 'python3', 'perl', 'ruby',
  'node', 'deno', 'bun', 'osascript', 'eval', 'env', 'xargs', 'sudo', 'doas', 'su',
])

const base = (p: string) => p.split('/').pop() ?? p

// Opções e subcomandos com que um cliente da allowlist corre código ou lê configuração que o
// agente pode ter escrito. Fecha as formas conhecidas; não é exaustivo (ver README, run_with_secret).
const GIT_GLOBAL_VALUE = new Set(['-C', '--git-dir', '--work-tree', '--namespace', '--super-prefix', '--attr-source'])
const GIT_SUBS = new Set([
  'config', 'difftool', 'mergetool', 'bisect', 'submodule', 'filter-branch', 'rebase', 'instaweb', 'daemon',
  'web--browse', 'help', 'send-email', 'credential',
])
const DOCKER_SUBS = new Set(['run', 'exec', 'create', 'build', 'buildx', 'compose', 'container', 'cp', 'plugin', 'debug'])
const KUBECTL_SUBS = new Set(['exec', 'run', 'debug', 'attach', 'cp', 'plugin'])
const GH_SUBS = new Set(['alias', 'extension', 'ext'])
// Correm código a partir de configuração que o agente consegue escrever ou de uma opção que se
// confunde com um uso normal (core.fsmonitor no .git/config do cwd, --eval do mongosh, plugins do
// docker e do kubectl). Ficam de fora mesmo listados em `allow`, salvo "allowRisky": true.
const RISKY = new Set(['git', 'docker', 'kubectl', 'mongosh'])
// Mais largo do que as formas abaixo, de propósito: o meta-comando de shell do psql e do mysql.
// Qualquer `\!` num argumento, e `system` no início de uma instrução.
const shellMeta = (a: string) => a.includes('\\!') || /(^|[;\n])\s*system(\s|;|$)/i.test(a)

function gitEscape(args: string[]): string | null {
  let i = 0
  for (; i < args.length; i++) {
    const a = args[i] as string
    if (!a.startsWith('-')) break
    if (a === '-c' || a.startsWith('--config-env') || a.startsWith('--exec-path')) return a
    if (GIT_GLOBAL_VALUE.has(a)) i++
  }
  const sub = args[i]
  if (sub !== undefined && GIT_SUBS.has(sub)) return `git ${sub}`
  for (const a of args.slice(i + 1)) {
    if (/^--(upload-pack|receive-pack|exec|template|config)(=|$)/.test(a) || a.includes('ext::')) return a
    if ((sub === 'clone' || sub === 'ls-remote') && (a === '-u' || a === '-c')) return a
    if (sub === 'grep' && (a.startsWith('-O') || a.startsWith('--open-files-in-pager'))) return a
  }
  return null
}

function escapeOf(bin: string, args: string[]): string | null {
  switch (bin) {
    case 'git':
      return gitEscape(args)
    case 'curl':
      return args.find(a => /^--config(=|$)/.test(a) || /^-[sSLfikvnNqIgGjJlOpRZ#0-6]*K/.test(a)) ?? null
    case 'docker':
      return args.find(a => DOCKER_SUBS.has(a) || /^--config(=|$)/.test(a)) ?? null
    case 'kubectl':
      return args.find(a => KUBECTL_SUBS.has(a) || /^--kubeconfig(=|$)/.test(a)) ?? null
    case 'gh':
      return args[0] !== undefined && GH_SUBS.has(args[0]) ? `gh ${args[0]}` : null
    case 'psql':
      return args.find(a => shellMeta(a) || /^(-f|--file)/.test(a) || /\\!|\\(o|out|g|gx|w|write)\s*\||\\(i|ir|include|include_relative)\b|\\copy\b.*\bprogram\b/i.test(a)) ?? null
    case 'mysql':
      return args.find(a => shellMeta(a) || /^--(pager|tee|defaults-file|defaults-extra-file|plugin-dir)(=|$)/.test(a) || /(^|[\s;])(system|source|\\!|\\\.)(\s|$)/i.test(a)) ?? null
    default:
      return null
  }
}

export function checkArgv(argv: string[], allow: string[], allowRisky = false): string | null {
  if (argv.length === 0 || !argv[0]) return 'argv vazio'
  const bin = base(argv[0])
  if (NEVER.has(bin) || /^python\d/.test(bin)) return `${bin} é um shell ou interpretador e nunca corre com segredos`
  if (argv[0].includes('/')) return `${argv[0]} usa um caminho; só são aceites nomes simples de comandos (resolvidos pelo PATH)`
  if (!allow.includes(bin)) return `${bin} não está na allowlist (~/.prumo/secret-exec.json → allow)`
  if (RISKY.has(bin) && !allowRisky) {
    return `${bin} corre código a partir de configuração que o agente pode escrever; só corre com segredos se a pessoa puser "allowRisky": true em ~/.prumo/secret-exec.json`
  }
  const esc = escapeOf(bin, argv.slice(1))
  if (esc) return `${esc} faz o ${bin} correr código ou ler configuração de fora, e nunca corre com segredos`
  return null
}

// Variáveis que mudam o que o processo carrega ou corre (PATH, loader, git, pager): um segredo
// nunca vai para elas, nem para as do próprio prumo.
const ENV_DENY = new Set([
  'PATH', 'IFS', 'BASH_ENV', 'ENV', 'SHELL', 'SHELLOPTS', 'BASHOPTS', 'CDPATH', 'GLOBIGNORE', 'PS4',
  'PROMPT_COMMAND', 'HOME', 'TMPDIR', 'ZDOTDIR', 'EDITOR', 'VISUAL', 'PAGER', 'MANPAGER', 'LESSOPEN',
  'KUBECONFIG', 'DOCKER_CONFIG', 'DOCKER_HOST', 'CURL_HOME', 'WGETRC', 'PSQLRC', 'MYSQL_HOME',
  'SSL_CERT_FILE', 'SSL_CERT_DIR', 'GH_CONFIG_DIR', 'XDG_CONFIG_HOME',
])
const ENV_DENY_PREFIX = ['LD_', 'DYLD_', 'GIT_', 'BASH_FUNC_', 'PRUMO_', 'CLAUDE_', 'NODE_', 'PYTHON', 'PERL', 'RUBY', 'JAVA_TOOL', 'MALLOC_']

export function checkEnvName(name: string): string | null {
  if (!/^[A-Z_][A-Z0-9_]*$/.test(name)) return `nome de variável inválido (${name})`
  if (ENV_DENY.has(name) || ENV_DENY_PREFIX.some(p => name.startsWith(p))) {
    return `${name} muda o que o processo carrega ou corre e não recebe segredos`
  }
  return null
}

// Os ficheiros que só a pessoa muda (D2): ~/.prumo e os settings do Claude Code.
export function protectedArg(args: string[], prumoHome: string): string | null {
  const home = prumoHome.toLowerCase().replace(/\/+$/, '')
  for (const a of args) {
    const x = a.toLowerCase()
    if (/(^|[/=:@])\.prumo(\/|$)|\.claude\/settings(\.local)?\.json/.test(x) || (home !== '' && x.includes(home))) return a
  }
  return null
}

export function protectedDir(dir: string, prumoHome: string): boolean {
  const x = dir.toLowerCase().replace(/\/+$/, '')
  const home = prumoHome.toLowerCase().replace(/\/+$/, '')
  return /\/\.(prumo|claude)(\/|$)/.test(x) || (home !== '' && (x === home || x.startsWith(`${home}/`)))
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

const byName = (refs: Record<string, string>) => Object.entries(refs).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))

// O que a pessoa aprova numa chamada: argv, referências (por nome) e o diretório onde corre. A
// quebra de linha depois do nome separa estes ids dos do approval-gate, que troca as quebras por
// espaços antes do hash: nenhum comando Bash chega ao id de uma chamada.
export function secretCallText(argv: string[], refs: Record<string, string>, cwd: string): string {
  return `run_with_secret\n${JSON.stringify({ argv, secrets: byName(refs), cwd })}`
}

// Controlo, bidi e largura zero: num terminal escondem ou reordenam texto.
const HIDDEN = /[\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g
const visible = (v: unknown) => JSON.stringify(v).replace(HIDDEN, c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`)

// A linha do pedido de aprovação: argv inteiro, referências e cwd, cada um em JSON (fronteiras
// dos argumentos à vista, sem quebras); nunca os valores.
export function secretCallLine(argv: string[], refs: Record<string, string>, cwd: string): string {
  return `run_with_secret ${visible(argv)} · segredos ${visible(Object.fromEntries(byName(refs)))} · cwd ${visible(cwd)}`
}

import type { EngineInterface } from 'claude-code'
import { collectSecrets, forgetRefs, redactText, rememberRef, type RedactOptions } from './redact-patterns.ts'
import { latestPluginDir } from './plugin-paths.ts'

const MAX_PER_PROMPT = 10
const FIELD = 'value'
const NO_WRITER = 'prumo-guard: segredo redigido mas não guardado — instala o prumo-base 1.1.0 ou superior'
const FAIL_REASON = 'Vault inacessível ou sem permissão'
const BUDGET_REASON = 'orçamento de tempo esgotado'
const BUDGET_MS = 10_000
const MIN_WRITE_MS = 1_000
const MAX_FAIL_PROMPTS = 3
const DISABLED_TOAST =
  'prumo-guard: captura para o Vault desligada nesta sessão após 3 falhas seguidas; /prumo-guard mostra o estado'

const refs = new Map<string, string>()
let warnedNoWriter = false
let counter = 0
let failStreak = 0
let disabled = false

export function captureState(): { disabled: boolean; failStreak: number } {
  return { disabled, failStreak }
}

// Chamada pelo startRedaction: as referências valem só dentro da sessão.
export function resetCapture(): void {
  refs.clear()
  forgetRefs()
  warnedNoWriter = false
  counter = 0
  failStreak = 0
  disabled = false
}

// <projeto>: basename do cwd em minúsculas, só [a-z0-9-]; vazio vira "sessao".
function projectSegment(cwd: string): string {
  const name = cwd.split('/').filter(Boolean).pop() ?? ''
  return name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/^-+|-+$/g, '') || 'sessao'
}

// aaaammdd-hhmmss, hora local.
function stamp(ms: number): string {
  const d = new Date(ms)
  const p = (n: number, w = 2) => String(n).padStart(w, '0')
  return `${p(d.getFullYear(), 4)}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

export type Captured = {
  text: string
  hits: number
  // Redigido sem que nenhum toast de captura o tenha dito (o chamador avisa).
  uncovered: number
  classes: string[]
  // Contexto para o modelo (uma entrada) ou null quando não houve segredos.
  context: string | null
}

// Grava cada segredo do texto na inbox do Vault (valor só por stdin) e devolve o texto redigido
// com a referência; o que não for gravado fica com o marcador simples. `secretsOnly` deixa de fora PII/IP.
export async function captureAndRedact($: EngineInterface, text: string, opts: RedactOptions, capture: boolean, secretsOnly: boolean): Promise<Captured> {
  const base = secretsOnly ? { ...opts, pii: false, internalIps: false } : opts
  const secrets = capture && !disabled ? collectSecrets(text, { ...base, pii: false, internalIps: false }) : []
  let created = 0
  let reused = 0
  let failed = 0
  let skipped = 0
  let abandoned = 0
  let budgetOut = false
  const covered: string[] = []
  if (secrets.length > 0) {
    const dir = await latestPluginDir($, 'prumo-base')
    const writer = dir ? `${dir}/lib/vault-write-field.sh` : null
    if (!writer || !(await $.fs.exists(writer).catch(() => false))) {
      if (!warnedNoWriter) {
        warnedNoWriter = true
        $.ui.toast(NO_WRITER)
        covered.push(...secrets.map(s => s.value))
      }
    } else {
      const project = projectSegment(await $.session.cwd())
      const now = await $.clock.now()
      let attempts = 0
      let stopped = false
      for (const s of secrets) {
        if (refs.has(s.value)) {
          reused++
          covered.push(s.value)
          continue
        }
        if (attempts >= MAX_PER_PROMPT) {
          skipped++
          covered.push(s.value)
          continue
        }
        if (stopped) {
          abandoned++
          covered.push(s.value)
          continue
        }
        const left = BUDGET_MS - ((await $.clock.now()) - now)
        if (left <= 0) {
          stopped = budgetOut = true
          abandoned++
          covered.push(s.value)
          continue
        }
        attempts++
        const path = `secret/inbox/${project}/${stamp(now)}-${++counter}`
        const ok = await $.process
          .run(['bash', writer, path, FIELD], { stdin: s.value, timeoutMs: Math.max(MIN_WRITE_MS, left) })
          .then(r => r.exitCode === 0)
          .catch(() => false)
        covered.push(s.value)
        if (ok) {
          refs.set(s.value, `${path}#${FIELD}`)
          rememberRef(`${path}#${FIELD}`)
          created++
        } else {
          failed++
          stopped = true
        }
      }
      if (failed > 0 || budgetOut) {
        if (++failStreak >= MAX_FAIL_PROMPTS && !disabled) {
          disabled = true
          $.ui.toast(DISABLED_TOAST)
        }
      } else if (created > 0) failStreak = 0
      if (created > 0 || reused > 0)
        $.ui.toast(
          `prumo-guard: ${created} segredo(s) guardado(s) em secret/inbox/${project}/ e redigido(s)` + (reused > 0 ? `; ${reused} já guardado(s)` : ''),
        )
      if (failed + abandoned > 0)
        $.ui.toast(`prumo-guard: ${failed + abandoned} segredo(s) redigido(s) mas não guardado(s) no Vault (${failed > 0 ? FAIL_REASON : BUDGET_REASON})`)
      if (skipped > 0) $.ui.toast(`prumo-guard: ${skipped} segredo(s) não guardado(s): limite de ${MAX_PER_PROMPT} por prompt`)
    }
  }
  const r = redactText(text, { ...base, refs })
  const residue = covered.reduce((t, v) => t.split(v).join(' '), text)
  const rest = redactText(residue, { ...base, refs })
  const coveredHits = covered.reduce((n, v) => n + (text.split(v).length - 1), 0)
  const saved = created + reused
  const parts: string[] = []
  if (saved > 0)
    parts.push(
      `O prompt tinha ${saved} segredo(s); foram guardados no Vault e o texto mostra só a referência (caminho#campo). ` +
        'Não peças o valor à pessoa nem tentes lê-lo: a referência está na inbox e o agente não a consegue ler; ' +
        'a pessoa promove-o para o caminho definitivo com /vault-set (ou no terminal, como está documentado nesse comando).',
    )
  const unsaved = secrets.length - saved
  if (unsaved > 0)
    parts.push(
      `${unsaved} segredo(s) não foram guardados no Vault e ficam só redigidos; a pessoa deve gravá-los no seu terminal ` +
        '(com `vault` instalado e VAULT_ADDR/VAULT_TOKEN definidos) com `vault kv patch <caminho> <campo>=-` (o valor é lido do stdin; `kv put` se o caminho ainda não existir).',
    )
  return {
    text: r.text,
    hits: r.hits,
    uncovered: Math.max(0, r.hits - coveredHits),
    classes: rest.classes,
    context: parts.length ? `[prumo-guard] ${parts.join(' ')}` : null,
  }
}

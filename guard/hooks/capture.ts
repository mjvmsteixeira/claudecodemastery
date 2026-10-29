import type { EngineInterface } from 'claude-code'
import { collectSecrets, redactText, type RedactOptions } from './redact-patterns.ts'
import { latestPluginDir } from './plugin-paths.ts'

const MAX_PER_PROMPT = 10
const FIELD = 'value'
const NO_WRITER = 'prumo-guard: segredo redigido mas não guardado — instala o prumo-base 1.1.0 ou superior'
const FAIL_REASON = 'Vault inacessível ou sem permissão'

const refs = new Map<string, string>()
let warnedNoWriter = false
let counter = 0

// Chamada pelo startRedaction: as referências valem só dentro da sessão.
export function resetCapture(): void {
  refs.clear()
  warnedNoWriter = false
  counter = 0
}

// O nome da pasta do projeto vira um segmento válido do caminho do escritor ([A-Za-z0-9._-], sem segmentos . ou ..).
function projectSegment(cwd: string): string {
  const name = cwd.split('/').filter(Boolean).pop() ?? ''
  const seg = name.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[.-]+/, '').replace(/-+$/, '')
  return seg || 'sem-projeto'
}

export type Captured = {
  text: string
  hits: number
  classes: string[]
  // Contexto para o modelo (uma entrada) ou null quando não houve segredos.
  context: string | null
}

// Grava cada segredo do texto na inbox do Vault (valor só por stdin) e devolve o texto redigido
// com a referência; o que não for gravado fica com o marcador simples. `secretsOnly` deixa de fora PII/IP.
export async function captureAndRedact($: EngineInterface, text: string, opts: RedactOptions, capture: boolean, secretsOnly: boolean): Promise<Captured> {
  const base = secretsOnly ? { ...opts, pii: false, internalIps: false } : opts
  const secrets = capture ? collectSecrets(text, { ...base, pii: false, internalIps: false }) : []
  let stored = 0
  let failed = 0
  let reason = ''
  if (secrets.length > 0) {
    const dir = await latestPluginDir($, 'prumo-base')
    const writer = dir ? `${dir}/lib/vault-write-field.sh` : null
    if (!writer || !(await $.fs.exists(writer).catch(() => false))) {
      if (!warnedNoWriter) {
        warnedNoWriter = true
        $.ui.toast(NO_WRITER)
      }
    } else {
      const project = projectSegment(await $.session.cwd())
      const now = await $.clock.now()
      let attempts = 0
      for (const s of secrets) {
        if (refs.has(s.value)) {
          stored++
          continue
        }
        if (attempts >= MAX_PER_PROMPT) continue
        attempts++
        const path = `secret/inbox/${project}/${now}-${++counter}`
        const ok = await $.process
          .run(['bash', writer, path, FIELD], { stdin: s.value, timeoutMs: 8000 })
          .then(r => r.exitCode === 0)
          .catch(() => false)
        if (ok) {
          refs.set(s.value, `${path}#${FIELD}`)
          stored++
        } else {
          failed++
          reason = FAIL_REASON
        }
      }
      if (stored > 0) $.ui.toast(`prumo-guard: ${stored} segredo(s) guardado(s) em secret/inbox/${project}/ e redigido(s)`)
      if (failed > 0) $.ui.toast(`prumo-guard: ${failed} segredo(s) redigido(s) mas não guardado(s) no Vault (${reason})`)
    }
  }
  const r = redactText(text, { ...base, refs })
  const parts: string[] = []
  if (stored > 0)
    parts.push(
      `O prompt tinha ${stored} segredo(s); foram guardados no Vault e o texto mostra só a referência (caminho#campo). ` +
        'Não peças o valor à pessoa: usa a referência com run_with_secret, ou pede-lhe que o promova para o caminho definitivo com /vault-set.',
    )
  const unsaved = secrets.length - stored
  if (unsaved > 0 && capture)
    parts.push(
      `${unsaved} segredo(s) não foram guardados no Vault e ficam só redigidos; a pessoa deve gravá-los no seu terminal ` +
        '(com `vault` instalado e VAULT_ADDR/VAULT_TOKEN definidos) com `vault kv patch <caminho> <campo>=-` (o valor é lido do stdin; `kv put` se o caminho ainda não existir).',
    )
  return { text: r.text, hits: r.hits, classes: r.classes, context: parts.length ? `[prumo-guard] ${parts.join(' ')}` : null }
}

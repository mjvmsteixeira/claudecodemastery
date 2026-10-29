import { atom, read, update } from 'claude-code'
import type { EngineInterface, On } from 'claude-code'
import { loadConfig, prumoHome, readJsonFile, type GuardConfig } from './config.ts'
import { compileExtra, countPlaceholders, redactText, type ExtraPattern } from './redact-patterns.ts'

export const redactOn = atom({ plugin: 'prumo-guard', key: 'redactOn' } as const, true)
export const redactHits = atom({ plugin: 'prumo-guard', key: 'redactHits' } as const, 0)

export const REDACT_DOORS = new Set(['tool-result', 'tool-message', 'attachment', 'hook-context', 'delivery'])
const PII_SKIP_TOOLS = new Set(['Read', 'Grep', 'Glob', 'NotebookRead'])
const NOTE = (n: number) =>
  `\n[prumo-guard] ${n} valor(es) redigido(s) como [prumo:CLASSE]. Não escrevas estes marcadores em ficheiros.`

let cfg: GuardConfig | undefined
let extra: ExtraPattern[] = []

let extraLoaded = false
let extraProblem: string | null = null

async function ensureConfig($: EngineInterface): Promise<GuardConfig> {
  if (!cfg) cfg = await loadConfig($)
  return cfg
}

// redact.json ausente é normal (sem padrões da organização). Ilegível, JSON inválido ou sem uma
// lista em `patterns` desliga esses padrões, e a pessoa tem de o saber (toast e /prumo-guard).
async function ensureExtra($: EngineInterface): Promise<void> {
  if (extraLoaded) return
  extraLoaded = true
  extra = []
  extraProblem = null
  const file = await readJsonFile($, `${await prumoHome($)}/redact.json`)
  if (file.state === 'missing') return
  const value = file.state === 'ok' ? file.value : null
  const list = typeof value === 'object' && value !== null ? (value as { patterns?: unknown }).patterns : undefined
  if (!Array.isArray(list)) {
    extraProblem = 'redact.json inválido — padrões da organização desligados'
    $.ui.toast(`prumo-guard: ${extraProblem}`)
    return
  }
  const compiled = compileExtra(value)
  extra = compiled.patterns
  if (compiled.errors.length) {
    extraProblem = `${compiled.errors.length} padrão(ões) inválido(s) em redact.json, ignorado(s)`
    $.ui.toast(`prumo-guard: ${compiled.errors.length} padrão(ões) inválido(s) em redact.json`)
  }
}

// Para o /prumo-guard: o problema do redact.json, se houver.
export async function redactConfigProblem($: EngineInterface): Promise<string | null> {
  await ensureExtra($)
  return extraProblem
}

type Block = { type: string; text?: string; content?: unknown; [k: string]: unknown }

function redactBlocks(blocks: Block[], opts: { pii: boolean; internalIps: boolean }): { blocks: Block[]; hits: number } {
  let hits = 0
  const run = (t: string) => {
    const r = redactText(t, { ...opts, extra })
    hits += r.hits
    return r
  }
  const out = blocks.map(b => {
    if (b.type === 'text' && typeof b.text === 'string') return { ...b, text: run(b.text).text }
    if (b.type === 'tool_result') {
      if (typeof b.content === 'string') {
        const r = run(b.content)
        return { ...b, content: r.hits ? r.text + NOTE(r.hits) : r.text }
      }
      if (Array.isArray(b.content)) {
        return {
          ...b,
          content: (b.content as Block[]).map(c => (c.type === 'text' && typeof c.text === 'string' ? { ...c, text: run(c.text).text } : c)),
        }
      }
    }
    return b
  })
  return { blocks: out, hits }
}

// Os ficheiros do próprio prumo-guard (testes, README) contêm marcadores de
// propósito; o guarda contra corrupção não se aplica a eles. Compara caminhos
// reais (o plugin carrega por symlink a partir de dev-mods).
async function isOwnFile($: EngineInterface, filePath: string): Promise<boolean> {
  try {
    const root = (await $.fs.stat($.plugin.root, { resolve: true })).realPath ?? $.plugin.root
    const dir = filePath.slice(0, filePath.lastIndexOf('/')) || '/'
    const real = (await $.fs.stat(dir, { resolve: true })).realPath ?? dir
    return real === root || real.startsWith(`${root}/`)
  } catch {
    return false
  }
}

export async function setRedactOn($: EngineInterface, value: boolean): Promise<void> {
  await update($, redactOn, () => value)
}

export async function startRedaction($: EngineInterface): Promise<GuardConfig> {
  cfg = undefined
  extraLoaded = false
  const c = await ensureConfig($)
  await update($, redactOn, () => c.redact.enabled)
  return c
}

export function registerRedaction(on: On): void {

  on('session.append', async ($, e, next) => {
    if (!REDACT_DOORS.has(e.door)) return next(e)
    if (!(await read($, redactOn))) return next(e)
    const c = await ensureConfig($)
    await ensureExtra($)
    const tool = e.origin.kind === 'tool' ? e.origin.tool : undefined
    const pii = !(tool && PII_SKIP_TOOLS.has(tool)) || c.redact.readPii
    const { blocks, hits } = redactBlocks(e.message.content as Block[], { pii, internalIps: c.redact.internalIps })
    if (hits === 0) return next(e)
    await update($, redactHits, n => (n ?? 0) + hits)
    return next({ ...e, message: { ...e.message, content: blocks as typeof e.message.content } })
  }).catch(($, e, next) =>
    next.called
      ? next(e)
      : next({
          ...e,
          message: {
            ...e.message,
            content: (e.message.content as Block[]).map(b =>
              b.type === 'tool_result'
                ? { ...b, content: '[prumo-guard] resultado retido: a redação falhou.' }
                : b.type === 'text'
                  ? { ...b, text: '[prumo-guard] texto retido: a redação falhou.' }
                  : b,
            ) as typeof e.message.content,
          },
        }),
  )

  on('prompt.submit', async ($, e, next) => {
    if (e.command || e.isMeta) return next(e)
    if (!(await read($, redactOn))) return next(e)
    const c = await ensureConfig($)
    if (!c.redact.prompt) return next(e)
    await ensureExtra($)
    const r = redactText(e.text, { pii: true, internalIps: c.redact.internalIps, extra })
    if (r.hits === 0) return next(e)
    $.ui.toast(`prumo-guard: ${r.hits} valor(es) redigido(s) no prompt (${r.classes.join(', ')})`)
    return next({ ...e, text: r.text })
  })

on('tool.call', { tool: /^(Write|Edit|MultiEdit)$/ }, async ($, e, next) => {
    const input = e as unknown as { file_path?: string; content?: string; new_string?: string; edits?: { new_string?: string }[] }
    const incoming = [input.content, input.new_string, ...(input.edits ?? []).map(x => x.new_string)].filter((x): x is string => typeof x === 'string').join('\n')
    if (countPlaceholders(incoming) === 0 || !input.file_path) return next(e)
    if (await isOwnFile($, input.file_path)) return next(e)
    let current: string
    try {
      current = await $.fs.read(input.file_path)
    } catch {
      return next(e)
    }
    const before = countPlaceholders(current)
    const after = (e as unknown as { tool: string }).tool === 'Write' ? countPlaceholders(incoming) : before + countPlaceholders(incoming)
    if (after <= before) return next(e)
    return {
      deny:
        'prumo-guard: este conteúdo traz marcadores de redação ([prumo:…]) para um ficheiro existente e apagaria os valores reais. ' +
          'Edita só as linhas que precisas, com old_string sem marcadores, ou pede ao humano para desligar a redação (/prumo-guard-redact off).',
      }
  }).catch(($, e, next) => (next.called ? next(e) : { deny: 'prumo-guard: a verificação de marcadores falhou.' }))

  // O modelo só vê o marcador; gravá-lo no Vault trocaria o segredo real por texto.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const command = (e as unknown as { command?: string }).command
    if (typeof command !== 'string' || !command.includes('[prumo:')) return next(e)
    const kvWrite = /\bkv\s+(put|patch)\b/.test(command) || /\bwrite\s+(-\S+\s+)*secret\//.test(command)
    const httpWrite = /\/v1\/secret\//.test(command) && /\b(curl|wget)\b/.test(command) && /(-X\s*(POST|PUT|PATCH)\b|\s-d\b|--data)/i.test(command)
    if (!kvWrite && !httpWrite) return next(e)
    return {
      deny:
        'prumo-guard: este comando grava um marcador de redação no Vault. O valor foi redigido antes de chegar ao modelo e não está disponível; ' +
        'gravar o marcador destruiria o segredo. A pessoa grava-o no seu terminal com `vault kv patch <caminho> <campo>=-` ' +
        '(o valor é lido do stdin; `kv put` se o caminho ainda não existir).',
    }
  }).catch(($, e, next) => (next.called ? next(e) : { deny: 'prumo-guard: a verificação de escritas no Vault falhou.' }))
}

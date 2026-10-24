import { atom, read, update } from 'claude-code'
import type { EngineInterface, On } from 'claude-code'
import { HUMAN_ONLY } from './commands.ts'
import { loadConfig } from './config.ts'
import type { HookInput, HookNext, HookResult } from './hook-types.ts'
import { BRAKE_DEFAULT, LOOP_DEFAULT, USAGE_DEFAULT } from './refs.ts'
import { emptyRepeat, trackCall, trackEdit, trackTest } from './repeat.ts'
import { parseRalphSession, parseRalphState } from './loop-state.ts'
import { refreshStatus } from './status.ts'
import { failureSignature, isTestCommand, parseTestSummary, shortHash } from './test-summary.ts'

const brakeRef = atom({ plugin: 'prumo-guard', key: 'brake' } as const, BRAKE_DEFAULT)
const repeatRef = atom({ plugin: 'prumo-guard', key: 'repeat' } as const, emptyRepeat())
const loopRef = atom({ plugin: 'prumo-guard', key: 'loop' } as const, LOOP_DEFAULT)
const usageRef = atom({ plugin: 'prumo-guard', key: 'usage' } as const, USAGE_DEFAULT)

const LOOP_PHASE_TOOL = 'mcp__prumo-guard__loop_phase'

export const BRAKE_DENY_PREFIX = 'prumo-guard: o travão está em pausa'

let currentTurn: string | null = null
let abortedTurn: string | null = null
let loopWasActive = false

async function ralphFile($: EngineInterface): Promise<string> {
  return `${await $.session.cwd()}/.claude/ralph-loop.local.md`
}

async function readText($: EngineInterface, path: string): Promise<string | null> {
  try {
    return await $.fs.read(path)
  } catch {
    return null
  }
}

async function moveFile($: EngineInterface, src: string, dst: string): Promise<boolean> {
  try {
    await $.process.run(['mv', '-n', src, dst])
  } catch {
    return false
  }
  return (await readText($, src)) === null && (await readText($, dst)) !== null
}

type Suspension = { result: 'suspended' | 'none' | 'failed' | 'other'; saved: string | null }

// Suspende o loop do ralph: sem o ficheiro de estado o stop hook do ralph não faz re-prompt.
// Um loop de outra sessão não é desta pausa; um .paused antigo é guardado à parte, não apagado.
async function suspendRalph($: EngineInterface): Promise<Suspension> {
  const file = await ralphFile($)
  const text = await readText($, file)
  if (text === null) return { result: 'none', saved: null }
  const owner = parseRalphSession(text)
  if (owner !== null && owner !== (await $.session.id())) return { result: 'other', saved: null }
  let saved: string | null = null
  if ((await readText($, `${file}.paused`)) !== null) {
    const name = `${file}.paused.${await $.clock.now()}`
    if (!(await moveFile($, `${file}.paused`, name))) return { result: 'failed', saved: null }
    saved = name.slice(name.lastIndexOf('/') + 1)
  }
  return { result: (await moveFile($, file, `${file}.paused`)) ? 'suspended' : 'failed', saved }
}

async function resumeRalph($: EngineInterface): Promise<string> {
  const file = await ralphFile($)
  const paused = await readText($, `${file}.paused`)
  const active = await readText($, file)
  if (paused === null) return active === null ? 'Travão rearmado. Não havia loop do ralph suspenso.' : 'Travão rearmado. O loop do ralph ativo continua.'
  if (active !== null) return `Travão rearmado. Existem o ficheiro ativo e o .paused do ralph (${file}); não toquei em nenhum.`
  if (!(await moveFile($, `${file}.paused`, file))) return `Travão rearmado, mas não consegui retomar o loop do ralph: ${file}.paused ficou onde estava.`
  const owner = parseRalphSession(paused)
  if (owner !== null && owner !== (await $.session.id())) return `Travão rearmado. Loop do ralph reposto, mas pertence à sessão ${owner}: retoma-o lá (claude --resume ${owner}) ou relança /ralph-loop aqui.`
  const iteration = parseRalphState(paused)?.iteration
  const text = iteration === null || iteration === undefined ? 'Loop do ralph retomado.' : `Loop do ralph retomado na iteração ${iteration}.`
  return `Travão rearmado. ${text}`
}

// A pausa recusa as ferramentas (brakeToolCall) e suspende o ficheiro do ralph; cortar o turno
// fica para o excesso de orçamento acima de 120% (cutTurn), como na D6.
async function trip($: EngineInterface, reason: string): Promise<void> {
  const b = await read($, brakeRef)
  if (b.paused) return
  await update($, brakeRef, s => ({ ...(s ?? b), paused: true, reason }))
  const ralph = await suspendRalph($)
  const base = ralph.result === 'suspended' ? 'loop do ralph suspenso.' : ralph.result === 'failed' ? 'o loop do ralph não foi suspenso.' : ralph.result === 'other' ? 'o loop do ralph é de outra sessão; não foi suspenso.' : ''
  const note = [base, ralph.saved ? `(um loop suspenso antigo foi guardado em ${ralph.saved})` : ''].filter(Boolean).join(' ')
  $.ui.toast(`prumo-guard: loop em pausa — ${reason}. ${note ? `${note} ` : ''}/prumo-guard-resume para continuar.`)
  void $.ui.notify(`Loop em pausa: ${reason}.${note ? ` ${note}` : ''}`, { title: 'prumo-guard' })
  await refreshStatus($)
}

async function cutTurn($: EngineInterface): Promise<void> {
  if (!currentTurn || abortedTurn === currentTurn) return
  abortedTurn = currentTurn
  try {
    await $.turn.abort({ turnId: currentTurn })
  } catch {
    // O motor pode recusar o abort de dentro do hook do mesmo turno; a pausa já está registada
    // e recusa as ferramentas seguintes.
  }
}

export async function startBrake($: EngineInterface): Promise<void> {
  await $.command.register({ name: 'prumo-guard-resume', description: 'Rearma o travão do loop: tira a pausa e recomeça a contagem do orçamento. Só pela pessoa.' })
  await $.command.register({ name: 'prumo-guard-stop', description: 'Termina o loop do ralph (apaga .claude/ralph-loop.local.md e o .paused). Só pela pessoa.' })
  try {
    if ((await readText($, `${await ralphFile($)}.paused`)) !== null) {
      $.ui.toast('prumo-guard: há um loop do ralph suspenso; /prumo-guard-resume retoma-o, /prumo-guard-stop termina-o.')
    }
  } catch {
    // O aviso é cortesia; sem cwd o resto do arranque segue.
  }
}

// Tratadores dos eventos partilhados; o despachante (observers.ts) chama-os por ordem.
export async function brakeTurnStart($: EngineInterface, e: HookInput<'turn.start'>, next: HookNext<'turn.start'>): HookResult<'turn.start'> {
  if (!e.agentId) currentTurn = e.turnId
  const loop = await read($, loopRef)
  const b = await read($, brakeRef)
  const started = loop.active && !loopWasActive
  loopWasActive = loop.active
  if (loop.active && (started || b.loopStartUsd === null)) {
    const usd = (await read($, usageRef)).usd
    await update($, brakeRef, s => ({ ...(s ?? b), loopStartUsd: usd ?? 0 }))
  }
  return next(e)
}

export async function brakeTurnComplete($: EngineInterface, e: HookInput<'turn.complete'>, next: HookNext<'turn.complete'>): HookResult<'turn.complete'> {
  if (!e.agentId) currentTurn = null
  if (e.usage) {
    const add = e.usage.input_tokens + e.usage.output_tokens + e.usage.cache_creation_input_tokens
    await update($, brakeRef, s => ({ ...(s ?? BRAKE_DEFAULT), tokens: (s?.tokens ?? 0) + add }))
    const cfg = await loadConfig($)
    const b = await read($, brakeRef)
    if (cfg.brake.enabled && cfg.brake.tokenBudget > 0 && b.tokens >= cfg.brake.tokenBudget) {
      await trip($, `orçamento de tokens atingido (${b.tokens} de ${cfg.brake.tokenBudget})`)
    }
  }
  return next(e)
}

export async function brakeMeasure($: EngineInterface, e: HookInput<'session.measure'>, next: HookNext<'session.measure'>): HookResult<'session.measure'> {
  const r = await next(e)
  const usd = e.cost?.usd
  if (usd === undefined) return r
  const cfg = await loadConfig($)
  if (!cfg.brake.enabled) return r
  const b = await read($, brakeRef)
  const spent = usd - (b.loopStartUsd ?? 0)
  const budget = cfg.brake.usdBudget
  if (budget > 0 && spent >= budget) {
    await trip($, `orçamento atingido (${spent.toFixed(2)} de ${budget} USD)`)
    if (spent >= budget * 1.2) await cutTurn($)
  }
  return r
}

export async function brakeToolCall($: EngineInterface, e: HookInput<'tool.call'>, next: HookNext<'tool.call'>): HookResult<'tool.call'> {
  if (e.tool !== LOOP_PHASE_TOOL) {
    const gate = await loadConfig($)
    if (gate.brake.enabled) {
      const b = await read($, brakeRef)
      if (b.paused) return { deny: `${BRAKE_DENY_PREFIX} (${b.reason ?? 'motivo não registado'}). Nenhuma ferramenta corre até a pessoa retomar com /prumo-guard-resume (ou terminar o loop com /prumo-guard-stop). Para já, explica em texto o que estavas a fazer e onde ficaste.` }
    }
  }
  const ran = await next(e)
  // Declarar a fase não é trabalho do loop: repetir a mesma fase não conta como repetição.
  if (e.tool === LOOP_PHASE_TOOL) return ran
  const cfg = await loadConfig($)
  if (!cfg.brake.enabled) return ran
  const limit = cfg.brake.repeatLimit
  let s = await read($, repeatRef)
  let reason: string | null = null
  const { tool_use_id: _id, agentId: _agent, ...input } = e as unknown as Record<string, unknown>
  const text = typeof ran.text === 'string' ? ran.text : ''
  ;({ s, trip: reason } = trackCall(s, `${e.tool}:${shortHash(JSON.stringify(input))}`, shortHash(`${ran.isError ?? false}:${text}`), limit))
  if (!reason && e.tool === 'Bash' && isTestCommand(e.command)) {
    const sum = parseTestSummary(text)
    if (sum) ({ s, trip: reason } = trackTest(s, sum.failed, shortHash(failureSignature(text)), limit))
  }
  if (!reason && e.tool === 'Edit') ({ s, trip: reason } = trackEdit(s, e.file_path, e.old_string, e.new_string))
  await update($, repeatRef, () => s)
  if (reason) await trip($, reason)
  return ran
}

export function registerBrake(on: On): void {
  on('command.run', { command: 'prumo-guard-resume' }, async ($, e) => {
    if (e.origin?.kind !== 'composer') return { text: HUMAN_ONLY }
    const usd = (await read($, usageRef)).usd
    await update($, brakeRef, () => ({ paused: false, reason: null, loopStartUsd: usd ?? 0, tokens: 0 }))
    await update($, repeatRef, () => emptyRepeat())
    await refreshStatus($)
    return { text: await resumeRalph($) }
  })

  on('command.run', { command: 'prumo-guard-stop' }, async ($, e) => {
    if (e.origin?.kind !== 'composer') return { text: HUMAN_ONLY }
    const file = await ralphFile($)
    const dir = file.slice(0, file.lastIndexOf('/'))
    const prefix = `${file.slice(dir.length + 1)}.paused.`
    let old: string[] = []
    try {
      old = (await $.fs.list(dir)).filter(f => f.name.startsWith(prefix)).map(f => `${dir}/${f.name}`)
    } catch {
      // Sem a listagem apagam-se só os dois ficheiros conhecidos.
    }
    const r = await $.process.run(['rm', '-f', file, `${file}.paused`, ...old])
    return { text: r.exitCode === 0 ? `Loop do ralph terminado (${file}, ${file}.paused${old.length ? ` e ${old.length} guardado(s) antigo(s)` : ''} apagados).` : `Não consegui apagar ${file} nem ${file}.paused: ${r.stderr.trim()}` }
  })
}

import { atom, read, update } from 'claude-code'
import type { EngineInterface, On } from 'claude-code'
import { HUMAN_ONLY } from './commands.ts'
import { loadConfig } from './config.ts'
import type { HookInput, HookNext, HookResult } from './hook-types.ts'
import { BRAKE_DEFAULT, LOOP_DEFAULT, USAGE_DEFAULT } from './refs.ts'
import { emptyRepeat, trackCall, trackEdit, trackTest } from './repeat.ts'
import { refreshStatus } from './status.ts'
import { failureSignature, isTestCommand, parseTestSummary, shortHash } from './test-summary.ts'

const brakeRef = atom({ plugin: 'prumo-guard', key: 'brake' } as const, BRAKE_DEFAULT)
const repeatRef = atom({ plugin: 'prumo-guard', key: 'repeat' } as const, emptyRepeat())
const loopRef = atom({ plugin: 'prumo-guard', key: 'loop' } as const, LOOP_DEFAULT)
const usageRef = atom({ plugin: 'prumo-guard', key: 'usage' } as const, USAGE_DEFAULT)

let currentTurn: string | null = null
let loopWasActive = false

async function trip($: EngineInterface, reason: string): Promise<void> {
  const b = await read($, brakeRef)
  if (b.paused) return
  await update($, brakeRef, s => ({ ...(s ?? b), paused: true, reason }))
  $.ui.toast(`prumo-guard: loop em pausa — ${reason}. /prumo-guard-resume para continuar.`)
  void $.ui.notify(`Loop em pausa: ${reason}`, { title: 'prumo-guard' })
  if (currentTurn) {
    try {
      await $.turn.abort({ turnId: currentTurn })
    } catch {
      // O motor pode recusar o abort de dentro do hook do mesmo turno; a pausa já está registada
      // e o veto ao Stop impede o re-prompt do ralph.
    }
  }
  await refreshStatus($)
}

export async function startBrake($: EngineInterface): Promise<void> {
  await $.command.register({ name: 'prumo-guard-resume', description: 'Rearma o travão do loop: tira a pausa e recomeça a contagem do orçamento. Só pela pessoa.' })
  await $.command.register({ name: 'prumo-guard-stop', description: 'Termina o loop do ralph (apaga .claude/ralph-loop.local.md). Só pela pessoa.' })
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
    if (cfg.brake.tokenBudget > 0 && b.tokens >= cfg.brake.tokenBudget) {
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
  const b = await read($, brakeRef)
  const spent = usd - (b.loopStartUsd ?? 0)
  if (cfg.brake.usdBudget > 0 && spent >= cfg.brake.usdBudget) {
    await trip($, `orçamento atingido (${spent.toFixed(2)} de ${cfg.brake.usdBudget} USD)`)
  }
  return r
}

export async function brakeToolCall($: EngineInterface, e: HookInput<'tool.call'>, next: HookNext<'tool.call'>): HookResult<'tool.call'> {
  const ran = await next(e)
  const cfg = await loadConfig($)
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

export async function brakeStop($: EngineInterface, e: HookInput<'classic.Stop'>, next: HookNext<'classic.Stop'>): HookResult<'classic.Stop'> {
  const r = await next(e)
  const b = await read($, brakeRef)
  if (!b.paused || r.block === undefined) return r
  const { block: _vetoed, ...rest } = r
  $.ui.toast('prumo-guard: loop em pausa — o re-prompt do ralph foi anulado.')
  return rest
}

export function registerBrake(on: On): void {
  on('command.run', { command: 'prumo-guard-resume' }, async ($, e) => {
    if (e.origin?.kind !== 'composer') return { text: HUMAN_ONLY }
    const usd = (await read($, usageRef)).usd
    await update($, brakeRef, () => ({ paused: false, reason: null, loopStartUsd: usd ?? 0, tokens: 0 }))
    await update($, repeatRef, () => emptyRepeat())
    await refreshStatus($)
    return { text: 'Travão rearmado. O orçamento conta a partir de agora.' }
  })

  on('command.run', { command: 'prumo-guard-stop' }, async ($, e) => {
    if (e.origin?.kind !== 'composer') return { text: HUMAN_ONLY }
    const file = `${await $.session.cwd()}/.claude/ralph-loop.local.md`
    const r = await $.process.run(['rm', '-f', file])
    return { text: r.exitCode === 0 ? `Loop do ralph terminado (${file} apagado).` : `Não consegui apagar ${file}: ${r.stderr.trim()}` }
  })
}

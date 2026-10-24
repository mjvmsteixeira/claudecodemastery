import { atom, read, update } from 'claude-code'
import type { EngineInterface, On } from 'claude-code'
import type { HookInput, HookNext, HookResult } from './hook-types.ts'
import type { PrumoGuardLoop } from '../types'
import { parseRalphState } from './loop-state.ts'
import { AGENTS_DEFAULT, BRAKE_DEFAULT, LOOP_DEFAULT, PHASE_DEFAULT, TESTS_DEFAULT, USAGE_DEFAULT } from './refs.ts'
import { refreshStatus } from './status.ts'
import { isTestCommand, parseTestSummary } from './test-summary.ts'

const loopRef = atom({ plugin: 'prumo-guard', key: 'loop' } as const, LOOP_DEFAULT)
const phaseRef = atom({ plugin: 'prumo-guard', key: 'phase' } as const, PHASE_DEFAULT)
const testsRef = atom({ plugin: 'prumo-guard', key: 'tests' } as const, TESTS_DEFAULT)
const agentsRef = atom({ plugin: 'prumo-guard', key: 'agents' } as const, AGENTS_DEFAULT)
const usageRef = atom({ plugin: 'prumo-guard', key: 'usage' } as const, USAGE_DEFAULT)

const brakeRef = atom({ plugin: 'prumo-guard', key: 'brake' } as const, BRAKE_DEFAULT)

const PHASES = ['plano', 'implementação', 'testes', 'revisão', 'outro']
const LOOP_PHASE_TOOL = 'mcp__prumo-guard__loop_phase'

export async function readLoop($: EngineInterface): Promise<PrumoGuardLoop> {
  try {
    const text = await $.fs.read(`${await $.session.cwd()}/.claude/ralph-loop.local.md`)
    const parsed = parseRalphState(text)
    return { active: true, iteration: parsed?.iteration ?? null, maxIterations: parsed?.maxIterations ?? null }
  } catch {
    return { active: false, iteration: null, maxIterations: null }
  }
}

function fmtUsd(usd: number | null): string {
  return usd === null ? '' : `${usd.toFixed(2).replace('.', ',')} USD`
}

export async function startPanel($: EngineInterface): Promise<void> {
  await $.tool.register({
    name: 'loop_phase',
    description:
      'Declara a fase atual do loop autónomo para o painel do prumo-guard. Chama-a quando mudas de fase: plano, implementação, testes, revisão ou outro.',
    inputSchema: {
      type: 'object',
      properties: { phase: { type: 'string', enum: PHASES }, note: { type: 'string', description: 'Uma linha opcional sobre o que vem a seguir.' } },
      required: ['phase'],
    },
    isDeferred: false,
  })
}

// Tratadores dos eventos partilhados; o despachante (observers.ts) chama-os por ordem.
export async function panelTurnStart($: EngineInterface, e: HookInput<'turn.start'>, next: HookNext<'turn.start'>): HookResult<'turn.start'> {
  if (!e.agentId) {
    const loop = await readLoop($)
    await update($, loopRef, () => loop)
    await refreshStatus($)
  }
  return next(e)
}

export async function panelMeasure($: EngineInterface, e: HookInput<'session.measure'>, next: HookNext<'session.measure'>): HookResult<'session.measure'> {
  await update($, usageRef, () => ({
    contextPercent: e.context.percent ?? null,
    usd: e.cost?.usd ?? null,
    windows: e.rateLimits.map(r => (r.resetsAt === undefined ? { kind: r.kind, percent: r.percentUsed } : { kind: r.kind, percent: r.percentUsed, resetsAt: r.resetsAt })),
  }))
  return next(e)
}

export async function panelAgentSpawn($: EngineInterface, e: HookInput<'agent.spawn'>, next: HookNext<'agent.spawn'>): HookResult<'agent.spawn'> {
  const r = await next(e)
  if (r.agentId) {
    const id = r.agentId
    const startedAt = await $.clock.now()
    await update($, agentsRef, list => [...(list ?? []), { id, type: e.subagentType || 'general-purpose', startedAt }].slice(-12))
  }
  return r
}

export async function panelTurnComplete($: EngineInterface, e: HookInput<'turn.complete'>, next: HookNext<'turn.complete'>): HookResult<'turn.complete'> {
  if (e.agentId) await update($, agentsRef, list => (list ?? []).filter(a => a.id !== e.agentId))
  return next(e)
}

export function registerPanel(on: On): void {
  on('tool.call', { tool: LOOP_PHASE_TOOL }, async ($, e) => {
    const asked = String((e as unknown as { phase?: unknown }).phase ?? 'outro')
    const phase = PHASES.includes(asked) ? asked : 'outro'
    await update($, phaseRef, () => phase)
    await refreshStatus($)
    return { result: `Fase registada: ${phase}.` }
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    if (!isTestCommand(e.command)) return ran
    const summary = parseTestSummary(typeof ran.text === 'string' ? ran.text : '')
    if (summary) {
      const at = await $.clock.now()
      await update($, testsRef, () => ({ command: e.command.slice(0, 80), ...summary, at }))
    }
    return ran
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const loop = await read($, loopRef)
    const agents = await read($, agentsRef)
    const tests = await read($, testsRef)
    const phase = await read($, phaseRef)
    const usage = await read($, usageRef)
    const brake = await read($, brakeRef)
    if (e.props.hasSurvey || (!loop.active && agents.length === 0 && !tests && !phase && !brake.paused)) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const now = await $.clock.now()
    const head = [
      loop.active ? `ralph ${loop.iteration ?? '?'}/${loop.maxIterations ?? '?'}` : null,
      phase ? `fase ${phase}` : null,
      usage.contextPercent !== null ? `ctx ${Math.round(usage.contextPercent)}%` : null,
      fmtUsd(usage.usd) || null,
      usage.windows.map(w => `${w.kind} ${Math.round(w.percent)}%`).join(' · ') || null,
    ].filter(Boolean).join(' · ')
    return (
      <Box flexDirection="column">
        {brake.paused ? <Text color="red">[pausa] {brake.reason ?? 'travão acionado'}</Text> : null}
        {head ? <Text>{head}</Text> : null}
        {agents.length > 0 ? (
          <Text dimColor>
            subagentes: {agents.map(a => `${a.type.split(':').pop()} ${Math.round((now - a.startedAt) / 60000)}m`).join(' · ')}
          </Text>
        ) : null}
        {tests ? (
          <Text color={tests.failed > 0 ? 'red' : undefined} dimColor={tests.failed === 0}>
            testes: {tests.passed}/{tests.passed + tests.failed}{tests.failed > 0 ? ` · ${tests.failed} falham` : ' · verdes'}
          </Text>
        ) : null}
      </Box>
    )
  })
}

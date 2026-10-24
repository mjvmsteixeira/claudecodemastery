import { atom, read, update } from 'claude-code'
import type { EngineInterface, On, RenderChildren } from 'claude-code'
import type { HookInput, HookNext, HookResult } from './hook-types.ts'
import type { PrumoGuardLoop } from '../types'
import { loadConfig } from './config.ts'
import { parseRalphState } from './loop-state.ts'
import { bar, levelColor, levelOf, resetText, windowLabel } from './panel-format.ts'
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

const WIDE_COLUMNS = 110
const RALPH_PHRASE: Record<string, string> = {
  suspended: 'loop do ralph suspenso',
  failed: 'loop do ralph não foi suspenso',
  other: 'loop do ralph de outra sessão (não tocado)',
}

function fmtMoney(n: number): string {
  return n.toFixed(2).replace('.', ',')
}

function fmtBudget(n: number): string {
  return Number.isInteger(n) ? String(n) : fmtMoney(n)
}

type Measure = { label: string; pct: number; reset: string | null; alert: string | null }

function alertFor(kind: string, pct: number, reset: string | null): string | null {
  const when = reset === null ? '' : /^\d+h\d\d$/.test(reset) ? ` — reinicia em ${reset}` : ` — reinicia ${reset}`
  if (kind === 'ctx') return `▲ contexto a ${pct}% — compacta em breve (/compact)`
  if (kind === 'five_hour') return `▲ limite de 5 horas a ${pct}%${when}`
  if (kind === 'seven_day') return `▲ limite de 7 dias a ${pct}%${when}`
  return null
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
    const cfg = await loadConfig($)
    const t = cfg.panel
    const wide = e.props.bodyColumns >= WIDE_COLUMNS

    const headParts = [loop.active ? `ralph ${loop.iteration ?? '?'}/${loop.maxIterations ?? '?'}` : null, phase].filter(Boolean)
    const head = headParts.length > 0 ? `◆ ${headParts.join(' · ')}` : null

    const raw: { kind: string; label: string; percent: unknown; resetsAt?: string }[] = [
      { kind: 'ctx', label: 'ctx', percent: usage.contextPercent },
      ...(usage.windows ?? []).map(w => ({ kind: w.kind, label: windowLabel(w.kind), percent: w.percent, resetsAt: w.resetsAt })),
    ]
    const measures: Measure[] = raw
      .filter((m): m is typeof m & { percent: number } => typeof m.percent === 'number' && Number.isFinite(m.percent))
      .map(m => {
        const pct = Math.round(m.percent)
        const reset = resetText(m.resetsAt, now)
        return { label: m.label, pct, reset, alert: levelOf(pct, t) === 'crit' ? alertFor(m.kind, pct, reset) : null }
      })

    const usd = typeof usage.usd === 'number' && Number.isFinite(usage.usd) ? usage.usd : null
    const budget = cfg.brake.enabled && cfg.brake.usdBudget > 0 ? cfg.brake.usdBudget : null
    const spentPct = usd !== null && budget !== null ? Math.round((usd / budget) * 100) : null
    const cost =
      usd === null ? null : budget === null ? (
        <Text color="subtle" wrap="truncate-end">{`${fmtMoney(usd)} USD`}</Text>
      ) : (
        <Text wrap="truncate-end">
          <Text color={levelColor(levelOf(spentPct ?? 0, t))}>{fmtMoney(usd)}</Text>
          {`/${fmtBudget(budget)} USD`}
        </Text>
      )

    const alerts = measures.map(m => m.alert).filter((a): a is string => a !== null)
    if (usd !== null && budget !== null && spentPct !== null && levelOf(spentPct, t) === 'crit') {
      alerts.push(`▲ orçamento a ${spentPct}% (${fmtMoney(usd)}/${fmtBudget(budget)} USD)`)
    }

    const pctText = (m: Measure) => {
      const level = levelOf(m.pct, t)
      return <Text color={levelColor(level)} bold={level === 'crit'}>{`${m.pct}%`}</Text>
    }

    const hasLine = head !== null || measures.length > 0 || cost !== null
    let main: RenderChildren = null
    if (hasLine && wide) {
      main = (
        <Box key="linha" flexDirection="row" columnGap={3}>
          {head ? <Text color="claude" wrap="truncate-end">{head}</Text> : null}
          {measures.map(m => {
            const b = bar(m.pct)
            const c = levelColor(levelOf(m.pct, t))
            return (
              <Text wrap="truncate-end">
                {`${m.label} `}
                <Text color={c}>{'█'.repeat(b.filled)}</Text>
                <Text color="subtle">{'░'.repeat(b.empty)}</Text>
                {' '}
                {pctText(m)}
                {m.reset ? <Text color="subtle">{` ↻ ${m.reset}`}</Text> : null}
              </Text>
            )
          })}
          {cost}
        </Box>
      )
    } else if (hasLine) {
      const parts: RenderChildren[] = []
      const sep = () => (parts.length > 0 ? ' · ' : '')
      if (head) parts.push(head)
      for (const m of measures) {
        const short = m.reset && /^\d+h\d\d$/.test(m.reset) ? ` ↻${m.reset}` : ''
        parts.push(sep(), `${m.label} `, pctText(m), short)
      }
      if (cost) parts.push(sep(), cost)
      main = <Text wrap="truncate-end">{parts}</Text>
    }

    const pauseText = [brake.reason ?? 'travão acionado', 'ferramentas recusadas', brake.ralph ? RALPH_PHRASE[brake.ralph] : undefined, '/prumo-guard-resume']
      .filter(Boolean)
      .join(' · ')

    return (
      <Box flexDirection="column">
        {brake.paused ? (
          <Text wrap="truncate-end">
            <Text backgroundColor="error" color="inverseText" bold>{' PAUSA '}</Text>
            <Text color="error">{` ${pauseText}`}</Text>
          </Text>
        ) : null}
        {main}
        {alerts.map(a => <Text color="error" wrap="truncate-end">{a}</Text>)}
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

import type { EngineInterface, On } from 'claude-code'
import type { HookInput, HookNext, HookResult } from './hook-types.ts'
import { loadConfig } from './config.ts'
import { fridayLine, validSessionId } from './friday-line.ts'

let buffer: string[] = []
let enabled = false
let sid: string | null = null
let ready = false

async function flush($: EngineInterface): Promise<void> {
  if (!enabled || !sid || buffer.length === 0) return
  const lines = buffer
  buffer = []
  const dir = (await $.env.get('FRIDAY_STATE_DIR')) ?? `${await $.env.get('HOME')}/.claude/friday-state`
  await $.process.run(['sh', '-c', 'umask 077; mkdir -p "$1" && cat >> "$2"', '_', dir, `${dir}/${sid}.jsonl`], {
    stdin: lines.join('\n') + '\n',
  })
}

// `on('session.start')` sem matcher só pode existir uma vez no plugin (e já é do register.tsx):
// a configuração lê-se de forma preguiçosa no primeiro evento que chega.
async function init($: EngineInterface, hookSid: unknown): Promise<void> {
  if (ready) return
  ready = true
  enabled = (await loadConfig($)).friday.enabled
  if (!enabled) return
  sid = validSessionId(hookSid) ?? validSessionId(await $.session.id())
  $.clock.every(500, () => void flush($))
}

async function record<E extends object, R>($: EngineInterface, name: string, e: E, next: (e: E) => R): Promise<Awaited<R>> {
  const x = e as Record<string, unknown>
  await init($, x.session_id)
  if (enabled) {
    buffer.push(fridayLine({ t: await $.clock.now(), e: x.hook_event_name ?? name, p: x.prompt_id, tool: x.tool_name, ag: x.agent_id, at: x.agent_type, nt: x.notification_type }))
  }
  return await next(e)
}

export function registerFriday(on: On): void {
  // `on` só aceita o nome do evento literal à vista (o validador estático do plugin recusa nomes calculados).
  on('classic.SessionStart', ($, e, next) => record($, 'SessionStart', e, next))
  on('classic.Notification', ($, e, next) => record($, 'Notification', e, next))
  on('classic.PostToolUse', ($, e, next) => record($, 'PostToolUse', e, next))
  on('classic.PostToolUseFailure', ($, e, next) => record($, 'PostToolUseFailure', e, next))
  on('classic.UserPromptSubmit', ($, e, next) => record($, 'UserPromptSubmit', e, next))
  on('classic.SessionEnd', ($, e, next) => record($, 'SessionEnd', e, next))
  on('classic.PreCompact', ($, e, next) => record($, 'PreCompact', e, next))
  on('classic.SubagentStart', ($, e, next) => record($, 'SubagentStart', e, next))
  on('classic.SubagentStop', ($, e, next) => record($, 'SubagentStop', e, next))
  on('classic.PostCompact', ($, e, next) => record($, 'PostCompact', e, next))
}

// Estes três eventos não podem ter um segundo hook sem matcher no módulo: o despachante
// (observers.ts) chama-os por ordem, em primeiro lugar.
export function fridayStop($: EngineInterface, e: HookInput<'classic.Stop'>, next: HookNext<'classic.Stop'>): HookResult<'classic.Stop'> {
  return record($, 'Stop', e, next)
}

export async function fridayToolCall($: EngineInterface, e: HookInput<'tool.call'>, next: HookNext<'tool.call'>): HookResult<'tool.call'> {
  await init($, undefined)
  if (enabled) buffer.push(fridayLine({ t: await $.clock.now(), e: 'PreToolUse', tool: e.tool, ag: e.agentId }))
  return next(e)
}

export async function fridaySessionEnd($: EngineInterface, e: HookInput<'session.end'>, next: HookNext<'session.end'>): HookResult<'session.end'> {
  await flush($)
  return next(e)
}

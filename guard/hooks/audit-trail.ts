import { atom, read } from 'claude-code'
import type { EngineInterface } from 'claude-code'
import { cefLine, verdictOf } from './cef.ts'
import { loadConfig, prumoHome } from './config.ts'
import type { HookInput, HookNext, HookResult } from './hook-types.ts'
import { LOOP_DEFAULT } from './refs.ts'

const loopRef = atom({ plugin: 'prumo-guard', key: 'loop' } as const, LOOP_DEFAULT)

let lines: string[] = []
let ctx: { host: string; user: string; session: string; enabled: boolean; collector: string | null; port: string } | null = null

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
}

async function flush($: EngineInterface): Promise<void> {
  if (!ctx?.enabled || lines.length === 0) return
  const batch = lines
  lines = []
  const ts = new Date(await $.clock.now()).toISOString().replace(/\.\d+Z$/, 'Z')
  const log = `${await prumoHome($)}/log/cef.log`
  await $.process.run(['sh', '-c', 'umask 077; mkdir -p "$(dirname "$1")" && cat >> "$1"', '_', log], {
    stdin: batch.map(l => `${ts} ${l}`).join('\n') + '\n',
  })
  if (ctx.collector) {
    for (const l of batch) await $.process.run(['nc', '-u', '-w', '1', ctx.collector, ctx.port], { stdin: l + '\n', timeoutMs: 3000 })
  }
}

export async function startAuditTrail($: EngineInterface): Promise<void> {
  lines = []
  const cfg = await loadConfig($)
  const session = await $.session.id()
  const host = (await $.process.run(['hostname'])).stdout.trim() || 'unknown'
  ctx = {
    host,
    user: (await $.env.get('USER')) ?? 'unknown',
    session,
    enabled: cfg.cef.enabled,
    collector: (await $.env.get('PRUMO_WAZUH_HOST')) ?? (await $.env.get('WAZUH_HOST')) ?? null,
    port: (await $.env.get('WAZUH_PORT')) ?? '514',
  }
  if (ctx.enabled) {
    // O marker diz ao post-tool-cef-wazuh.sh (secops) que esta sessão já é registada aqui.
    await $.fs.write(`${await prumoHome($)}/run/cef-mod.${session}`, 'prumo-guard\n')
    $.clock.every(5000, () => void flush($))
  }
}

// Tratadores dos eventos partilhados; o despachante (observers.ts) chama-os por ordem.
export async function auditToolCall($: EngineInterface, e: HookInput<'tool.call'>, next: HookNext<'tool.call'>): HookResult<'tool.call'> {
  const ran = await next(e)
  if (!ctx?.enabled) return ran
  const { tool_use_id: _id, ...input } = e as unknown as Record<string, unknown>
  const { verdict, hook } = verdictOf(ran)
  const loop = await read($, loopRef)
  lines.push(cefLine({
    host: ctx.host, user: ctx.user, tool: e.tool, agent: e.agentId ?? 'main', session: ctx.session,
    inputHash: await sha256Hex(JSON.stringify(input)), verdict, hook, iteration: loop.active ? loop.iteration : null,
  }))
  return ran
}

export async function auditSessionEnd($: EngineInterface, e: HookInput<'session.end'>, next: HookNext<'session.end'>): HookResult<'session.end'> {
  await flush($)
  if (ctx?.enabled) await $.process.run(['rm', '-f', `${await prumoHome($)}/run/cef-mod.${ctx.session}`])
  return next(e)
}

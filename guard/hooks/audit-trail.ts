import { atom, read } from 'claude-code'
import type { EngineInterface } from 'claude-code'
import { cefLine, verdictOf } from './cef.ts'
import { loadConfig, prumoHome } from './config.ts'
import type { HookInput, HookNext, HookResult } from './hook-types.ts'
import { LOOP_DEFAULT } from './refs.ts'

const loopRef = atom({ plugin: 'prumo-guard', key: 'loop' } as const, LOOP_DEFAULT)

let lines: string[] = []
let ctx: { host: string; user: string; session: string | null; enabled: boolean; collector: string | null; port: string } | null = null
let timer: { cancel: () => void } | null = null
let writing: Promise<void> | null = null

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
}

async function write($: EngineInterface, batch: string[], collector: string | null, port: string): Promise<void> {
  const ts = new Date(await $.clock.now()).toISOString().replace(/\.\d+Z$/, 'Z')
  const log = `${await prumoHome($)}/log/cef.log`
  await $.process.run(['sh', '-c', 'umask 077; mkdir -p "$(dirname "$1")" && cat >> "$1"', '_', log], {
    stdin: batch.map(l => `${ts} ${l}`).join('\n') + '\n',
  })
  if (collector) {
    for (const l of batch) await $.process.run(['nc', '-u', '-w', '1', collector, port], { stdin: l + '\n', timeoutMs: 3000 })
  }
}

// Um flush de cada vez: o do session.end espera pelo periódico em voo, e só depois sai o marker.
async function flush($: EngineInterface): Promise<void> {
  while (writing) await writing.catch(() => undefined)
  if (!ctx?.enabled || lines.length === 0) return
  const batch = lines
  lines = []
  writing = write($, batch, ctx.collector, ctx.port)
  try {
    await writing
  } finally {
    writing = null
  }
}

async function markerPath($: EngineInterface, session: string): Promise<string> {
  return `${await prumoHome($)}/run/cef-mod.${session}`
}

// O marker diz ao post-tool-cef-wazuh.sh (secops) que esta sessão já é registada aqui. Depois de
// um /clear ou de um resume o processo segue com outro id sem session.start: o id lê-se em cada
// chamada e, quando muda, o marker passa para o novo.
async function ensureSession($: EngineInterface): Promise<string> {
  const session = await $.session.id()
  if (ctx && session !== ctx.session) {
    await $.fs.write(await markerPath($, session), 'prumo-guard\n')
    ctx.session = session
  }
  return session
}

export async function startAuditTrail($: EngineInterface): Promise<void> {
  lines = []
  const cfg = await loadConfig($)
  const host = (await $.process.run(['hostname'])).stdout.trim() || 'unknown'
  ctx = {
    host,
    user: (await $.env.get('USER')) ?? 'unknown',
    session: null,
    enabled: cfg.cef.enabled,
    collector: (await $.env.get('PRUMO_WAZUH_HOST')) ?? (await $.env.get('WAZUH_HOST')) ?? null,
    port: (await $.env.get('WAZUH_PORT')) ?? '514',
  }
  timer?.cancel()
  timer = null
  if (ctx.enabled) {
    await ensureSession($)
    timer = $.clock.every(5000, () => void flush($))
  }
}

// Tratadores dos eventos partilhados; o despachante (observers.ts) chama-os por ordem.
export async function auditToolCall($: EngineInterface, e: HookInput<'tool.call'>, next: HookNext<'tool.call'>): HookResult<'tool.call'> {
  // Antes de next: o marker do id novo tem de existir quando o PostToolUse do secops corre.
  const session = ctx?.enabled ? await ensureSession($) : null
  const ran = await next(e)
  if (!ctx?.enabled || session === null) return ran
  const { tool_use_id: _id, ...input } = e as unknown as Record<string, unknown>
  const { verdict, hook } = verdictOf(ran)
  const loop = await read($, loopRef)
  lines.push(cefLine({
    host: ctx.host, user: ctx.user, tool: e.tool, agent: e.agentId ?? 'main', session,
    inputHash: await sha256Hex(JSON.stringify(input)), verdict, hook, iteration: loop.active ? loop.iteration : null,
  }))
  return ran
}

export async function auditSessionEnd($: EngineInterface, e: HookInput<'session.end'>, next: HookNext<'session.end'>): HookResult<'session.end'> {
  await flush($)
  if (ctx?.enabled && ctx.session) {
    await $.process.run(['rm', '-f', await markerPath($, ctx.session)])
    // /clear e resume: o trilho continua com o id seguinte, lido na próxima chamada.
    if (e.reason === 'clear' || e.reason === 'resume') ctx.session = null
  }
  return next(e)
}

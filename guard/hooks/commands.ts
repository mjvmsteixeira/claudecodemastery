import { atom, read } from 'claude-code'
import type { EngineInterface, On } from 'claude-code'
import { APPROVAL_PANE } from './approval.tsx'
import { loadConfig, prumoHome } from './config.ts'
import { readMode, writeMode, type PrumoMode } from './mode.ts'
import { redactConfigProblem, setRedactOn } from './redact.ts'
import { refreshStatus } from './status.ts'

const redactOn = atom({ plugin: 'prumo-guard', key: 'redactOn' } as const, true)
const redactHits = atom({ plugin: 'prumo-guard', key: 'redactHits' } as const, 0)

export const HUMAN_ONLY = 'prumo-guard: este comando só aceita a tecla Enter da pessoa.'

export function parseModeArg(args: string): PrumoMode | null {
  const mode = args.trim()
  return mode === 'prod' || mode === 'dev' || mode === 'lab' ? mode : null
}

export function parseOnOff(args: string): boolean | null {
  const arg = args.trim()
  return arg === 'on' ? true : arg === 'off' ? false : null
}

export async function setRedact($: EngineInterface, value: boolean): Promise<void> {
  await setRedactOn($, value)
  await refreshStatus($)
}

export async function startCommands($: EngineInterface): Promise<void> {
  await $.command.register({ name: 'prumo-guard', description: 'Estado do prumo-guard: modo, redação e aprovações pendentes' })
  await $.command.register({ name: 'prumo-guard-mode', description: 'Muda o modo operacional prumo (prod, dev ou lab). Só pela pessoa.', argumentHint: 'prod|dev|lab' })
  await $.command.register({ name: 'prumo-guard-redact', description: 'Liga ou desliga a redação de segredos e PII nesta sessão. Só pela pessoa.', argumentHint: 'on|off' })
  await $.command.register({ name: 'prumo-guard-approvals', description: 'Abre o painel de aprovações pendentes' })
}

export function registerCommands(on: On): void {
  on('command.run', { command: 'prumo-guard' }, async $ => {
    const mode = await readMode($)
    const cfg = await loadConfig($)
    const problem = await redactConfigProblem($)
    const lines = [
      `modo: ${mode}`,
      `redação: ${(await read($, redactOn)) ? 'on' : 'off'} · ${await read($, redactHits)} valor(es) redigido(s) nesta sessão`,
      ...(problem ? [`aviso: ${problem}`] : []),
      `orçamento: ${cfg.brake.usdBudget} USD · repetição: ${cfg.brake.repeatLimit} · ips internos: ${cfg.redact.internalIps ? 'on' : 'off'}`,
      `configuração: ${await prumoHome($)}/guard.json`,
    ]
    return { text: lines.join('\n') }
  })

  on('command.run', { command: 'prumo-guard-mode' }, async ($, e) => {
    if (e.origin?.kind !== 'composer') return { text: HUMAN_ONLY }
    const mode = parseModeArg(e.args)
    if (!mode) return { text: 'Uso: /prumo-guard-mode prod|dev|lab' }
    await writeMode($, mode)
    await refreshStatus($)
    return { text: `Modo prumo: ${mode}.${mode === 'lab' ? ' Em lab os hooks fazem bypass (registado).' : ''}` }
  })

  on('command.run', { command: 'prumo-guard-redact' }, async ($, e) => {
    if (e.origin?.kind !== 'composer') return { text: HUMAN_ONLY }
    const value = parseOnOff(e.args)
    if (value === null) return { text: 'Uso: /prumo-guard-redact on|off' }
    await setRedact($, value)
    return { text: `Redação ${value ? 'on' : 'off'} nesta sessão.` }
  })

  on('command.run', { command: 'prumo-guard-approvals' }, async $ => {
    await $.ui.open({ id: APPROVAL_PANE, title: 'prumo · aprovação', focus: true, closeOnEscape: true, rows: 10 })
    return { text: 'Painel de aprovações aberto.' }
  })
}

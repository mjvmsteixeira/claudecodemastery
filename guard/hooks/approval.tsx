import { atom, read, update } from 'claude-code'
import type { EngineInterface, On } from 'claude-code'
import type { PrumoGuardLevel, PrumoGuardPending } from '../types'
import { parseGateDenial } from './approval-parse.ts'
import { prumoHome } from './config.ts'

const pending = atom({ plugin: 'prumo-guard', key: 'pending' } as const, [] as PrumoGuardPending[])
export const APPROVAL_PANE = 'prumo-guard-approval'
const ONCE_MS = 5 * 60 * 1000
const TTL_MS = 10 * 60 * 1000

const MODEL_NOTE =
  'prumo-guard: foi aberto um pedido de aprovação ao humano. Não reformules nem contornes o comando. ' +
  'Continua com outro trabalho; quando for decidido recebes uma mensagem, e só então repetes exatamente este comando.'

export async function requestApproval(
  $: EngineInterface,
  req: { id: string; level: PrumoGuardLevel; command: string; agentId?: string },
): Promise<void> {
  const requestedAt = await $.clock.now()
  await update($, pending, list =>
    [...(list ?? []).filter(p => p.id !== req.id), { ...req, requestedAt }].slice(-20),
  )
  void $.ui.open({ id: APPROVAL_PANE, title: 'prumo · aprovação', focus: true, closeOnEscape: true, rows: 10 })
  void $.ui.notify(`Aprovação ${req.level} pedida: ${req.command.slice(0, 80)}`, { title: 'prumo-guard' })
}

async function tell($: EngineInterface, text: string, agentId?: string): Promise<void> {
  const message = { type: 'user' as const, content: [{ type: 'text' as const, text }] }
  try {
    await $.session.append(agentId ? { message, agentId } : { message })
  } catch {
    await $.session.append({ message })
  }
}

async function decide($: EngineInterface, p: PrumoGuardPending, choice: 'once' | 'ttl' | 'deny'): Promise<void> {
  await update($, pending, list => (list ?? []).filter(x => x.id !== p.id))
  if ((await read($, pending)).length === 0) await $.ui.close({ id: APPROVAL_PANE })
  const shown = p.command.slice(0, 200)
  if (choice === 'deny') {
    await tell($, `prumo-guard: o humano negou ${p.level} para \`${shown}\`. Não o corras nem o contornes.`, p.agentId)
    return
  }
  const expires = Math.floor(((await $.clock.now()) + (choice === 'ttl' ? TTL_MS : ONCE_MS)) / 1000)
  await $.fs.write(`${await prumoHome($)}/approvals/${p.id}`, `level=${p.level}\nexpires=${expires}\nscope=${choice}\n`)
  const span = choice === 'ttl' ? 'durante 10 minutos' : 'uma vez'
  await tell($, `prumo-guard: aprovado ${p.level} ${span} para \`${shown}\`. Podes voltar a correr exatamente este comando.`, p.agentId)
}

export function registerApproval(on: On): void {
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny !== undefined || ran.isError !== true) return ran
    const req = parseGateDenial(ran.text ?? '')
    if (!req) return ran
    await requestApproval($, { ...req, command: e.command, ...(e.agentId ? { agentId: e.agentId } : {}) })
    return { ...ran, context: [MODEL_NOTE] }
  })

  on('ui.render', { component: 'Pane', requestId: APPROVAL_PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const list = await read($, pending)
    const p = list[list.length - 1]
    if (!p) return <Text dimColor>Sem aprovações pendentes.</Text>
    return (
      <Box flexDirection="column">
        <Text>O agente quer correr ({p.level}):</Text>
        <Text bold>{p.command.slice(0, 400)}</Text>
        {p.agentId ? <Text dimColor>subagente {p.agentId}</Text> : null}
        {list.length > 1 ? <Text dimColor>+{list.length - 1} pedido(s) na fila</Text> : null}
        <Box>
          <Button key="once" hotkey="1" variant="primary" label="Só esta" onPress={() => void decide($, p, 'once')} />
          <Button key="ttl" hotkey="2" label="10 minutos" onPress={() => void decide($, p, 'ttl')} />
          <Button key="deny" hotkey="3" label="Negar" onPress={() => void decide($, p, 'deny')} />
        </Box>
      </Box>
    )
  })
}

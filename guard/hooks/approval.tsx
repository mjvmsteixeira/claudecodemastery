import { atom, read, update } from 'claude-code'
import { APPROVALS_DEFAULT, PENDING_DEFAULT } from './refs.ts'
import type { EngineInterface, On } from 'claude-code'
import type { PrumoGuardApproval, PrumoGuardLevel, PrumoGuardPending } from '../types'
import { approvalIdOf, displayCommand, parseGateDenial, quoteCommand } from './approval-parse.ts'
import { prumoHome } from './config.ts'
import { refreshStatus } from './status.ts'

// O validador só lê átomos declarados no próprio ficheiro quando se escreve (update); a leitura usa o de refs.ts.
const pending = atom({ plugin: 'prumo-guard', key: 'pending' } as const, PENDING_DEFAULT)
// As decisões da pessoa no diálogo. Este ficheiro é o dono: o run_with_secret lê-as e gasta-as
// pelas funções exportadas abaixo.
const approvals = atom({ plugin: 'prumo-guard', key: 'approvals' } as const, APPROVALS_DEFAULT)
export const APPROVAL_PANE = 'prumo-guard-approval'
// O que o painel mostra de um pedido; o run_with_secret recusa uma chamada mais longa do que isto.
export const SHOWN_MAX = 400
const ONCE_MS = 5 * 60 * 1000
const TTL_MS = 10 * 60 * 1000

const MODEL_NOTE =
  'prumo-guard: foi aberto um pedido de aprovação ao humano. Não reformules nem contornes o comando. ' +
  'Continua com outro trabalho; quando for decidido recebes uma mensagem, e só então repetes exatamente este comando.'

export const FORGED_NOTE = 'aprovação não reconhecida: o ficheiro não foi criado pelo diálogo do prumo-guard'
const STALE_NOTE = 'aprovação expirada ou já usada'

// Depois de um comando correr: um approvals/<id> que apareceu durante o `next` (uma escrita
// concorrente na janela entre esta verificação e a leitura do approval-gate, noutro processo) e que
// não tem registo humano foi uma aprovação forjada. O mod apaga-o e avisa o modelo — a barreira
// efetiva para o comando que já correu é o prompt de permissão do Bash.
export const FORGED_RACE_NOTE =
  'prumo-guard: surgiu um ficheiro de aprovação sem registo humano durante a execução deste comando ' +
  '(uma escrita concorrente entre a verificação do mod e a leitura do approval-gate). Foi apagado para não ' +
  'autorizar mais nada. O comando pode ter corrido sem aprovação do humano — não o repitas; pede à pessoa ' +
  'para decidir no diálogo.'

export async function requestApproval(
  $: EngineInterface,
  req: { id: string; level: PrumoGuardLevel; command: string; agentId?: string; singleUse?: boolean },
): Promise<void> {
  const requestedAt = await $.clock.now()
  await update($, pending, list =>
    [...(list ?? []).filter(p => p.id !== req.id), { ...req, requestedAt }].slice(-20),
  )
  await refreshStatus($)
  // O pedido aparece na band acima do prompt (ui.render AbovePrompt, abaixo), não num painel com
  // foco: esse tirava o teclado a quem estava a trabalhar. O /prumo-guard-approvals abre o painel.
  void $.ui.notify(`Aprovação ${req.level} pedida: ${req.command.slice(0, 80)} · 1/2/3 com o prompt vazio`, { title: 'prumo-guard' })
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
  await refreshStatus($)
  const shown = quoteCommand(p.command)
  if (choice === 'deny') {
    await tell($, `prumo-guard: o humano negou ${p.level} para \`${shown}\` (citado numa só linha). Não o corras nem o contornes.`, p.agentId)
    return
  }
  const expires = Math.floor(((await $.clock.now()) + (choice === 'ttl' ? TTL_MS : ONCE_MS)) / 1000)
  // O registo entra antes do ficheiro: um ficheiro sem registo é tratado como forjado e apagado.
  const record: PrumoGuardApproval = { id: p.id, level: p.level, scope: choice, expires, used: false }
  await update($, approvals, list => [...(list ?? []).filter(r => r.id !== p.id), record].slice(-50))
  await $.fs.write(`${await prumoHome($)}/approvals/${p.id}`, `level=${p.level}\nexpires=${expires}\nscope=${choice}\n`)
  const span = p.singleUse ? 'uma vez (o run_with_secret gasta-a na primeira chamada)' : choice === 'ttl' ? 'durante 10 minutos' : 'uma vez'
  await tell($, `prumo-guard: aprovado ${p.level} ${span} para \`${shown}\` (citado numa só linha). Podes repetir exatamente o comando que foi bloqueado.`, p.agentId)
}

// Um registo serve com o mesmo id e nível, por expirar e, se só vale uma vez, por usar. Os do
// run_with_secret (`singleUse`) valem uma vez qualquer que seja o scope.
function usable(r: PrumoGuardApproval, id: string, level: string, now: number, singleUse: boolean): boolean {
  return r.id === id && r.level === level && r.expires > now && !(r.used && (singleUse || r.scope === 'once'))
}

export type HumanRecord = 'ok' | 'stale' | 'unknown'

// Há uma decisão da pessoa para este id e nível? `stale` quando a houve mas já expirou ou foi
// gasta; `unknown` quando o diálogo nunca a gravou. Só lê.
export async function humanRecord($: EngineInterface, id: string, level: string, singleUse: boolean): Promise<HumanRecord> {
  const now = Math.floor((await $.clock.now()) / 1000)
  const list = await read($, approvals)
  if (list.some(r => usable(r, id, level, now, singleUse))) return 'ok'
  return list.some(r => r.id === id) ? 'stale' : 'unknown'
}

// Gasta a decisão: marca usado o registo de uma só vez (ou qualquer um, com `singleUse`). De duas
// chamadas em paralelo só uma o gasta: o update repete a leitura quando a versão mudou.
export async function spendHumanRecord($: EngineInterface, id: string, level: string, singleUse: boolean): Promise<HumanRecord> {
  const now = Math.floor((await $.clock.now()) / 1000)
  let got = 'unknown' as HumanRecord
  await update($, approvals, list => {
    const all = list ?? []
    const i = all.findIndex(r => usable(r, id, level, now, singleUse))
    got = i >= 0 ? 'ok' : all.some(r => r.id === id) ? 'stale' : 'unknown'
    if (i < 0) return all
    return all.map((r, j) => (j === i && (singleUse || r.scope === 'once') ? { ...r, used: true } : r))
  })
  return got
}

// O lado do gate: antes de um comando chegar ao approval-gate, um approvals/<id> (o id que o gate
// lhe dá) só fica se o diálogo o gravou. Sem registo é apagado e o comando recusado; com um
// registo de uma vez, este fica gasto e o gate apaga o ficheiro quando o aceita.
export async function checkApprovalFile($: EngineInterface, id: string): Promise<string | null> {
  const file = `${await prumoHome($)}/approvals/${id}`
  if (!(await $.fs.stat(file).then(() => true, () => false))) return null
  const text = await $.fs.read(file).catch(() => '')
  const level = /^level=(.*)$/m.exec(text)?.[1] ?? ''
  const got = await spendHumanRecord($, id, level, false)
  if (got === 'ok') return null
  await $.process.run(['rm', '-f', file])
  const why = got === 'stale' ? STALE_NOTE : FORGED_NOTE
  return `prumo-guard: ${why}; o ficheiro approvals/${id.slice(0, 12)}… foi apagado e o comando não correu. Não o contornes: repete o comando e a pessoa decide no diálogo.`
}

// Varre, depois do comando correr, um approvals/<id> forjado (sem registo humano) que tenha surgido
// na janela entre a verificação do hook e a leitura do gate. Não toca num ficheiro com registo (uma
// aprovação de 10 minutos legítima fica). Só lê o átomo e, quando apaga, corre um `rm`.
export async function sweepForgedFile($: EngineInterface, id: string): Promise<boolean> {
  const file = `${await prumoHome($)}/approvals/${id}`
  if (!(await $.fs.stat(file).then(() => true, () => false))) return false
  if ((await read($, approvals)).some(r => r.id === id)) return false
  await $.process.run(['rm', '-f', file])
  return true
}

export function registerApproval(on: On): void {
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const id = await approvalIdOf(e.command)
    const refused = await checkApprovalFile($, id)
    if (refused) return { deny: refused }
    const ran = await next(e)
    if (ran.deny !== undefined) return ran
    if (ran.isError !== true) {
      // O comando correu (ou foi autorizado). Varre um ficheiro forjado que tenha aparecido na
      // janela entre a verificação acima e a leitura do gate: assim não sobrevive para autorizar o
      // próximo comando, e o modelo fica avisado.
      return (await sweepForgedFile($, id)) ? { ...ran, context: [FORGED_RACE_NOTE] } : ran
    }
    const req = parseGateDenial(ran.text ?? '', id)
    if (!req) return ran
    await requestApproval($, { ...req, command: e.command, ...(e.agentId ? { agentId: e.agentId } : {}) })
    return { ...ran, context: [MODEL_NOTE] }
  }).catch(($, e, next) => (next.called ? next(e) : { deny: 'prumo-guard: a verificação da aprovação falhou antes de o comando correr; nada correu.' }))

  // Registado antes do painel do loop (panel.tsx), fica por fora dele: com um pedido pendente a
  // band é este; sem pedidos, ou com um inquérito do Claude Code, passa. Um dígito com o prompt
  // vazio carrega num botão da band, e quem está a escrever no prompt continua a escrever.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const list = await read($, pending)
    const p = list[list.length - 1]
    if (!p) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    const shown = displayCommand(p.command, SHOWN_MAX)
    return (
      <Box flexDirection="column">
        <Text color="yellow">prumo · aprovação {p.level} · o agente quer correr:</Text>
        <Box>
          <Button key="once" hotkey="1" plain label="Só esta" onPress={() => void decide($, p, 'once')} />
          <Text> </Text>
          <Button key="ttl" hotkey="2" plain label="10 minutos" onPress={() => void decide($, p, 'ttl')} />
          <Text> </Text>
          <Button key="deny" hotkey="3" plain label="Negar" onPress={() => void decide($, p, 'deny')} />
          <Text dimColor>  · dígito com o prompt vazio · /prumo-guard-approvals abre o painel</Text>
        </Box>
        <Text bold>{shown.text}</Text>
        {shown.omitted > 0 ? (
          <Text dimColor>comando com {p.command.length} caracteres; mostra-se o início e o fim, a aprovação cobre-o inteiro</Text>
        ) : null}
        {p.agentId ? <Text dimColor>subagente {p.agentId}</Text> : null}
        {p.singleUse ? <Text dimColor>run_with_secret: a aprovação serve uma só chamada, também com 10 minutos.</Text> : null}
        {list.length > 1 ? <Text dimColor>+{list.length - 1} pedido(s) na fila</Text> : null}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: APPROVAL_PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const list = await read($, pending)
    const p = list[list.length - 1]
    if (!p) return <Text dimColor>Sem aprovações pendentes.</Text>
    const shown = displayCommand(p.command, SHOWN_MAX)
    return (
      <Box flexDirection="column">
        <Text>O agente quer correr ({p.level}):</Text>
        <Text bold>{shown.text}</Text>
        {shown.omitted > 0 ? (
          <Text dimColor>comando com {p.command.length} caracteres; mostra-se o início e o fim, a aprovação cobre-o inteiro</Text>
        ) : null}
        {p.agentId ? <Text dimColor>subagente {p.agentId}</Text> : null}
        {p.singleUse ? <Text dimColor>run_with_secret: a aprovação serve uma só chamada, também com 10 minutos.</Text> : null}
        {list.length > 1 ? <Text dimColor>+{list.length - 1} pedido(s) na fila</Text> : null}
        <Box>
          <Button key="once" hotkey="1" plain label="Só esta" onPress={() => void decide($, p, 'once')} />
          <Text> </Text>
          <Button key="ttl" hotkey="2" plain label="10 minutos" onPress={() => void decide($, p, 'ttl')} />
          <Text> </Text>
          <Button key="deny" hotkey="3" plain label="Negar" onPress={() => void decide($, p, 'deny')} />
        </Box>
        <Text dimColor>Esc fecha o painel; o pedido continua na band acima do prompt.</Text>
      </Box>
    )
  })
}

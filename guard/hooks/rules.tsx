import { atom, read, update } from 'claude-code'
import type { EngineInterface, On } from 'claude-code'
import type { PrumoGuardRule } from '../types'
import { displayCommand, sha256Hex } from './approval-parse.ts'
import { prumoHome } from './config.ts'
import { RULES_DEFAULT } from './refs.ts'
import { refreshStatus } from './status.ts'

// O ficheiro do projeto é uma lista de propostas: só vale o que a pessoa ativou nesta sessão
// (rulesActive), uma cópia tirada no momento da ativação. O agente não escreve átomos.
// rulesFile espelha o ficheiro tal como o mod o leu ou escreveu; rulesOffered são as regras do
// arranque ainda por decidir.
const rulesFile = atom({ plugin: 'prumo-guard', key: 'rulesFile' } as const, RULES_DEFAULT)
const rulesOffered = atom({ plugin: 'prumo-guard', key: 'rulesOffered' } as const, RULES_DEFAULT)
const rulesActive = atom({ plugin: 'prumo-guard', key: 'rulesActive' } as const, RULES_DEFAULT)

const RULE_ID = /^r-[0-9a-f]{12}$/
const HEX64 = /^[0-9a-f]{64}$/

// Um ficheiro que não bata em tudo (projeto, nível N1, ids) é ignorado por inteiro: aproveitar
// parte de um ficheiro estragado ou forjado seria pior do que não ter regras.
export function parseRulesFile(text: string, project: string): PrumoGuardRule[] | null {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return null
  }
  if (typeof raw !== 'object' || raw === null) return null
  const o = raw as { project?: unknown; rules?: unknown }
  if (o.project !== project || !Array.isArray(o.rules)) return null
  const out: PrumoGuardRule[] = []
  for (const r of o.rules as unknown[]) {
    if (typeof r !== 'object' || r === null) return null
    const x = r as Record<string, unknown>
    if (typeof x.id !== 'string' || !RULE_ID.test(x.id) || x.level !== 'N1' || typeof x.createdAt !== 'string') return null
    if (x.kind === 'level') out.push({ id: x.id, kind: 'level', level: 'N1', createdAt: x.createdAt })
    else if (x.kind === 'command' && typeof x.commandId === 'string' && HEX64.test(x.commandId) && typeof x.command === 'string')
      out.push({ id: x.id, kind: 'command', level: 'N1', commandId: x.commandId, command: x.command, createdAt: x.createdAt })
    else return null
  }
  return out
}

// O projeto é a raiz git do cwd da sessão, ou o próprio cwd sem git; sem symlinks, porque o git
// e o `pwd -P` devolvem o caminho físico.
export async function projectRoot($: EngineInterface): Promise<string | null> {
  const cwd = await $.session.cwd().catch(() => null)
  if (!cwd) return null
  const r = await $.process
    .run(['sh', '-c', 'cd "$1" && { git rev-parse --show-toplevel 2>/dev/null || pwd -P; }', '_', cwd])
    .catch(() => null)
  const root = r && r.exitCode === 0 ? r.stdout.trim() : ''
  return root || null
}

async function rulesPath($: EngineInterface, project: string): Promise<string> {
  return `${await prumoHome($)}/rules/${await sha256Hex(project)}.json`
}

type Loaded = { state: 'missing' } | { state: 'invalid' } | { state: 'ok'; rules: PrumoGuardRule[] }

async function loadRules($: EngineInterface, project: string): Promise<Loaded> {
  let text: string
  try {
    text = await $.fs.read(await rulesPath($, project))
  } catch {
    return { state: 'missing' }
  }
  const rules = parseRulesFile(text, project)
  return rules ? { state: 'ok', rules } : { state: 'invalid' }
}

async function saveRules($: EngineInterface, project: string, rules: PrumoGuardRule[]): Promise<boolean> {
  const path = await rulesPath($, project)
  try {
    if ((await $.process.run(['mkdir', '-p', path.slice(0, path.lastIndexOf('/'))])).exitCode !== 0) return false
    await $.fs.write(path, `${JSON.stringify({ project, rules }, null, 2)}\n`)
    return true
  } catch {
    return false
  }
}

export const RULES_PANE = 'prumo-guard-rules'

export async function startRules($: EngineInterface): Promise<void> {
  await $.command.register({ name: 'prumo-guard-rules', description: 'Regras de aprovação deste projeto: ver e revogar' })
  const project = await projectRoot($)
  if (!project) return
  const loaded = await loadRules($, project)
  if (loaded.state === 'invalid') {
    $.ui.toast(`prumo-guard: rules/${(await sha256Hex(project)).slice(0, 12)}….json inválido — regras ignoradas`)
    return
  }
  if (loaded.state === 'missing') return
  await update($, rulesFile, () => loaded.rules)
  await update($, rulesOffered, () => loaded.rules)
}

// Revogar tira a regra da sessão e reescreve o ficheiro a partir do que o mod leu ou escreveu.
// Um ficheiro forjado entretanto fica substituído.
export async function revokeRule($: EngineInterface, ruleId: string): Promise<void> {
  await update($, rulesActive, list => (list ?? []).filter(r => r.id !== ruleId))
  await update($, rulesOffered, list => (list ?? []).filter(r => r.id !== ruleId))
  const remaining = (await read($, rulesFile)).filter(r => r.id !== ruleId)
  await update($, rulesFile, () => remaining)
  const project = await projectRoot($)
  if (!project || !(await saveRules($, project, remaining))) $.ui.toast('prumo-guard: não foi possível gravar rules/ — a regra foi revogada só nesta sessão')
  await refreshStatus($)
}

// A regra criada nas opções 4 e 5 do pedido: fica ativa nesta sessão e vai para o ficheiro do
// projeto. Se a escrita falhar, vale só nesta sessão.
export async function addRule($: EngineInterface, kind: 'command' | 'level', commandId: string, command: string): Promise<PrumoGuardRule> {
  const createdAt = new Date(await $.clock.now()).toISOString()
  const id = `r-${(await sha256Hex(`${kind}|${commandId}|${createdAt}`)).slice(0, 12)}`
  const rule: PrumoGuardRule =
    kind === 'level' ? { id, kind: 'level', level: 'N1', createdAt } : { id, kind: 'command', level: 'N1', commandId, command, createdAt }
  await update($, rulesActive, list => [...(list ?? []), rule])
  const rules = [...(await read($, rulesFile)), rule]
  await update($, rulesFile, () => rules)
  const project = await projectRoot($)
  if (!project || !(await saveRules($, project, rules))) $.ui.toast('prumo-guard: não foi possível gravar rules/ — a regra vale só nesta sessão')
  await refreshStatus($)
  return rule
}

export async function decideOffered($: EngineInterface, rule: PrumoGuardRule, choice: 'activate' | 'later' | 'revoke'): Promise<void> {
  await update($, rulesOffered, list => (list ?? []).filter(r => r.id !== rule.id))
  if (choice === 'activate') await update($, rulesActive, list => [...(list ?? []).filter(r => r.id !== rule.id), rule])
  if (choice === 'revoke') await revokeRule($, rule.id)
  await refreshStatus($)
}

function describe(rule: PrumoGuardRule, max: number): string {
  return rule.kind === 'level' ? 'todos os N1 neste projeto' : `este comando: ${displayCommand(rule.command, max).text}`
}

export function registerRules(on: On): void {
  // Registado depois do pedido de aprovação e antes do painel do loop: um pedido pendente tem a
  // band primeiro; sem pedidos, as regras do arranque por decidir; depois o painel.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const offered = await read($, rulesOffered)
    const r = offered[0]
    if (!r) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        <Text color="yellow">prumo · regra do projeto, criada a {r.createdAt.slice(0, 10)}:</Text>
        <Text bold>{describe(r, 400)}</Text>
        <Box columnGap={2}>
          <Button key="rule-activate" hotkey="1" plain label="Ativar nesta sessão" onPress={() => void decideOffered($, r, 'activate')} />
          <Button key="rule-later" hotkey="2" plain label="Agora não" onPress={() => void decideOffered($, r, 'later')} />
          <Button key="rule-revoke" hotkey="3" plain label="Revogar" onPress={() => void decideOffered($, r, 'revoke')} />
        </Box>
        <Text dimColor>só o dígito, sem Enter, com o prompt vazio · /prumo-guard-rules abre o painel</Text>
        {offered.length > 1 ? <Text dimColor>+{offered.length - 1} regra(s) por decidir</Text> : null}
      </Box>
    )
  })
}

import { atom, read, update } from 'claude-code'
import type { EngineInterface, On } from 'claude-code'
import type { PrumoGuardRule } from '../types'
import { approvalIdOf, displayCommand, parseGateDenial, sha256Hex } from './approval-parse.ts'
import { prumoHome } from './config.ts'
import { latestPluginDir } from './plugin-paths.ts'
import { RULES_DEFAULT, RULES_PROJECT_DEFAULT } from './refs.ts'
import { refreshStatus } from './status.ts'

// O ficheiro do projeto é uma lista de propostas: só vale o que a pessoa ativou nesta sessão
// (rulesActive), uma cópia tirada no momento da ativação. O agente não escreve átomos.
// rulesFile espelha o ficheiro tal como o mod o leu ou escreveu; rulesOffered são as regras do
// arranque ainda por decidir; rulesProject é o projeto da sessão, fixado no arranque.
const rulesFile = atom({ plugin: 'prumo-guard', key: 'rulesFile' } as const, RULES_DEFAULT)
const rulesOffered = atom({ plugin: 'prumo-guard', key: 'rulesOffered' } as const, RULES_DEFAULT)
const rulesActive = atom({ plugin: 'prumo-guard', key: 'rulesActive' } as const, RULES_DEFAULT)
const rulesProject = atom({ plugin: 'prumo-guard', key: 'rulesProject' } as const, RULES_PROJECT_DEFAULT)

const RULE_ID = /^r-[0-9a-f]{12}$/
const HEX64 = /^[0-9a-f]{64}$/
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T/

// Um ficheiro que não bata em tudo (projeto, nível N1, ids, data) é ignorado por inteiro:
// aproveitar parte de um ficheiro estragado ou forjado seria pior do que não ter regras.
// Que cada commandId seja o do seu comando verifica-o o loadRules (o sha256 é assíncrono).
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
    if (typeof x.id !== 'string' || !RULE_ID.test(x.id) || x.level !== 'N1') return null
    if (typeof x.createdAt !== 'string' || !ISO_DATE.test(x.createdAt) || Number.isNaN(Date.parse(x.createdAt))) return null
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
  if (!rules) return { state: 'invalid' }
  // O texto mostrado tem de ser o do commandId: senão a pessoa ativava um comando e o agente
  // corria outro.
  for (const r of rules) if (r.kind === 'command' && (await approvalIdOf(r.command)) !== r.commandId) return { state: 'invalid' }
  return { state: 'ok', rules }
}

// O projeto da sessão, fixado no arranque: um `cd` para outro repositório não muda o ficheiro que
// se lê e escreve. Se o arranque não o determinou, calcula-se uma vez e guarda-se.
async function sessionProject($: EngineInterface): Promise<string | null> {
  const fixed = await read($, rulesProject)
  if (fixed) return fixed
  const project = await projectRoot($)
  if (project) await update($, rulesProject, () => project)
  return project
}

// A base de uma escrita é o ficheiro relido agora, porque outra sessão no mesmo projeto pode
// tê-lo mudado; em falta, nenhuma regra. Um ficheiro inválido (estragado ou forjado) fica
// substituído a partir do espelho desta sessão.
async function rulesOnDisk($: EngineInterface, project: string): Promise<PrumoGuardRule[]> {
  const loaded = await loadRules($, project)
  if (loaded.state === 'ok') return loaded.rules
  return loaded.state === 'missing' ? [] : await read($, rulesFile)
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
  const project = await sessionProject($)
  if (!project) return
  const loaded = await loadRules($, project)
  if (loaded.state === 'invalid') {
    $.ui.toast(`prumo-guard: rules/${(await sha256Hex(project)).slice(0, 12)}….json inválido — regras ignoradas`)
    return
  }
  if (loaded.state === 'missing') return
  await update($, rulesFile, () => loaded.rules)
  // O session.start volta a disparar em reload e respawn: uma regra já ativa não se oferece outra vez.
  const active = new Set((await read($, rulesActive)).map(r => r.id))
  await update($, rulesOffered, () => loaded.rules.filter(r => !active.has(r.id)))
}

// Revogar tira a regra da sessão e do ficheiro relido do disco; o espelho fica com o que se
// escreveu.
export async function revokeRule($: EngineInterface, ruleId: string): Promise<void> {
  await update($, rulesActive, list => (list ?? []).filter(r => r.id !== ruleId))
  await update($, rulesOffered, list => (list ?? []).filter(r => r.id !== ruleId))
  const project = await sessionProject($)
  const remaining = (project ? await rulesOnDisk($, project) : await read($, rulesFile)).filter(r => r.id !== ruleId)
  await update($, rulesFile, () => remaining)
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
  const project = await sessionProject($)
  const rules = [...(project ? await rulesOnDisk($, project) : await read($, rulesFile)), rule]
  await update($, rulesFile, () => rules)
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

// Numa só linha, como o gate o lê para o id: quebras de linha e tabs passam a espaços.
function describe(rule: PrumoGuardRule, max: number): string {
  return rule.kind === 'level' ? 'todos os N1 neste projeto' : `este comando: ${displayCommand(rule.command.replace(/[\r\n\t]/g, ' '), max).text}`
}

export function registerRules(on: On): void {
  // Registado depois do pedido de aprovação e antes do painel do loop: um pedido pendente tem a
  // band primeiro; sem pedidos, as regras do arranque por decidir; depois o painel. Os dígitos
  // 7/8/9 não coincidem com os 1 a 5 do pedido: um pedido que surja no instante do toque não
  // recebe o dígito destinado a esta band.
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
          <Button key="rule-activate" hotkey="7" plain label="Ativar nesta sessão" onPress={() => void decideOffered($, r, 'activate')} />
          <Button key="rule-later" hotkey="8" plain label="Agora não" onPress={() => void decideOffered($, r, 'later')} />
          <Button key="rule-revoke" hotkey="9" plain label="Revogar" onPress={() => void decideOffered($, r, 'revoke')} />
        </Box>
        <Text dimColor>7, 8 ou 9: só o dígito, sem Enter, com o prompt vazio · /prumo-guard-rules abre o painel</Text>
        {offered.length > 1 ? <Text dimColor>+{offered.length - 1} regra(s) por decidir</Text> : null}
      </Box>
    )
  })

  on('command.run', { command: 'prumo-guard-rules' }, async $ => {
    await $.ui.open({ id: RULES_PANE, title: 'prumo · regras do projeto', focus: true, closeOnEscape: true, rows: 12 })
    return { text: 'Painel de regras aberto.' }
  })

  on('ui.render', { component: 'Pane', requestId: RULES_PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    // As ativas (a cópia que vale nesta sessão) e as do ficheiro que não estão ativas: uma regra
    // ativa que saiu do ficheiro continua visível e revogável.
    const activeRules = await read($, rulesActive)
    const active = new Set(activeRules.map(r => r.id))
    const rules = [...activeRules, ...(await read($, rulesFile)).filter(r => !active.has(r.id))]
    if (rules.length === 0) return <Text dimColor>Sem regras neste projeto.</Text>
    return (
      <Box flexDirection="column">
        {rules.map(r => (
          <Box key={r.id} columnGap={2}>
            <Text color={active.has(r.id) ? 'green' : undefined} dimColor={!active.has(r.id)}>{active.has(r.id) ? 'ativa' : 'inativa'}</Text>
            <Text>{describe(r, 120)}</Text>
            <Button key={`revoke:${r.id}`} plain label="Revogar" onPress={() => void revokeRule($, r.id)} />
          </Box>
        ))}
        <Text dimColor>Esc fecha o painel. Ativar uma regra inativa: na band, quando a sessão arranca.</Text>
      </Box>
    )
  })
}

// Com regras ativas, classifica o Bash correndo o approval-gate como o run_with_secret faz. Só um
// N1 com uma regra que bata devolve a regra; qualquer outra saída (0, N2, N3, erro, gate em falta)
// devolve null e o Bash segue para o gate como sempre.
export async function ruleFor($: EngineInterface, command: string, id: string): Promise<PrumoGuardRule | null> {
  const active = await read($, rulesActive)
  if (active.length === 0) return null
  const secops = await latestPluginDir($, 'prumo-secops')
  if (!secops) return null
  const gate = await $.process
    .run(['bash', `${secops}/hooks/pre-tool-approval-gate.sh`], {
      stdin: JSON.stringify({ tool_name: 'Bash', tool_input: { command } }),
      env: { CLAUDE_PLUGIN_ROOT: secops },
      timeoutMs: 5000,
    })
    .catch(() => null)
  if (!gate || gate.exitCode !== 2 || parseGateDenial(gate.stderr, id)?.level !== 'N1') return null
  return active.find(r => r.kind === 'command' && r.commandId === id) ?? active.find(r => r.kind === 'level') ?? null
}

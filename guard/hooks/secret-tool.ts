import { atom, read } from 'claude-code'
import type { EngineInterface, On, ProcessRunResult } from 'claude-code'
import { checkApprovalFile, FORGED_NOTE, humanRecord, requestApproval, SHOWN_MAX, spendHumanRecord } from './approval.tsx'
import { approvalIdOf, parseGateDenial, sha256Hex } from './approval-parse.ts'
import { loadConfig, prumoHome, readJsonFile } from './config.ts'
import { latestPluginDir } from './plugin-paths.ts'
import { AGENTS_DEFAULT } from './refs.ts'
import {
  checkArgv, checkEnvName, clientArgv, isolatedEnv, maskSecrets, parseSecretRef, protectedArg, protectedDir, secretCallLine, secretCallText,
  shellQuote,
} from './secret-exec.ts'

const agentsRef = atom({ plugin: 'prumo-guard', key: 'agents' } as const, AGENTS_DEFAULT)

const TOOL = 'mcp__prumo-guard__run_with_secret'
const DEFAULT_ALLOW = ['psql', 'mysql', 'curl', 'gh']
// O mesmo tecto do approval-gate: o mod nunca escreve uma aprovação para mais de 10 minutos.
const APPROVAL_MAX_TTL_S = 600
// Os mesmos PreToolUse que um Bash atravessa: o comando não passa pela tool Bash, por isso o mod
// corre-os com um payload sintético. O approval-gate vem no fim, para não pedir aprovação humana
// a um comando que outro guard recusa.
const BASE_GUARDS = ['pre-tool-self-guard.sh', 'pre-tool-secret-read.sh', 'pre-tool-workspace.sh']
const SECOPS_GUARDS = ['pre-tool-agent-readonly.sh']

type Input = { argv?: unknown; secrets?: unknown; cwd?: unknown; agentId?: string }
type ExecCfg = {
  allow: string[]
  allowRisky: boolean
  readerPath: string | null
  gatePath: string | null
  baseDir: string | null
  secopsDir: string | null
}

let warnedInvalid = false

async function execConfig($: EngineInterface): Promise<ExecCfg | null> {
  const file = await readJsonFile($, `${await prumoHome($)}/secret-exec.json`)
  if (file.state === 'invalid') return null
  const value = file.state === 'ok' ? file.value : {}
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const raw = value as Partial<{ allow: unknown; allowRisky: unknown; readerPath: unknown; gatePath: unknown }>
  // Um `allow` mal escrito recusa: cair nos defaults alargava uma allowlist restrita sem aviso.
  if (raw.allow !== undefined && !(Array.isArray(raw.allow) && raw.allow.every(x => typeof x === 'string'))) return null
  if (raw.allowRisky !== undefined && typeof raw.allowRisky !== 'boolean') return null
  if ((raw.readerPath !== undefined && typeof raw.readerPath !== 'string') || (raw.gatePath !== undefined && typeof raw.gatePath !== 'string')) return null
  const baseDir = await latestPluginDir($, 'prumo-base')
  const secopsDir = await latestPluginDir($, 'prumo-secops')
  return {
    allow: Array.isArray(raw.allow) ? (raw.allow as string[]) : DEFAULT_ALLOW,
    allowRisky: raw.allowRisky === true,
    readerPath: typeof raw.readerPath === 'string' ? raw.readerPath : baseDir ? `${baseDir}/lib/vault-read-field.sh` : null,
    gatePath: typeof raw.gatePath === 'string' ? raw.gatePath : secopsDir ? `${secopsDir}/hooks/pre-tool-approval-gate.sh` : null,
    baseDir,
    secopsDir,
  }
}

async function isEnabled($: EngineInterface): Promise<boolean> {
  return (await loadConfig($)).secretExec.enabled === true
}

// Chamada pelo único session.start do register.tsx. Desligado (o default), a ferramenta não chega
// ao modelo: só a pessoa a liga, em guard.json.
export async function startSecretTool($: EngineInterface): Promise<void> {
  if (!(await isEnabled($))) return
  await $.tool.register({
    name: 'run_with_secret',
    description:
      'Corre um comando com segredos do Vault injetados como variáveis de ambiente; o mod não põe o valor na conversa. ' +
      'argv é o comando já partido (sem shell); secrets mapeia NOME_DA_VARIAVEL → "caminho/kv#campo". ' +
      'Cada chamada precisa de aprovação humana, e cada aprovação serve uma só chamada: sem ela o mod abre o pedido e recusa, e depois da aprovação repetes exatamente a mesma chamada (argv, secrets e cwd). ' +
      'O cliente corre sem a sua configuração (curl -q, psql -X, mysql --no-defaults, HOME vazio). ' +
      'O output volta com o valor trocado por [SEGREDO:NOME] na forma crua, sem espaço final e codificada em URL (outras codificações não são mascaradas). ' +
      'Só aceita os clientes da allowlist (psql, mysql, curl e gh por omissão); recusa shells, interpretadores e as opções conhecidas com que os clientes correm código; ' +
      'passa pelos mesmos guards do Bash e pelo approval-gate.',
    inputSchema: {
      type: 'object',
      properties: {
        argv: { type: 'array', items: { type: 'string' }, minItems: 1 },
        secrets: { type: 'object', additionalProperties: { type: 'string' } },
        cwd: { type: 'string' },
      },
      required: ['argv', 'secrets'],
    },
    isDeferred: false,
  })
}

async function cwdProblem($: EngineInterface, cwd: string, home: string): Promise<string | null> {
  if (protectedDir(cwd, home)) return `cwd ${cwd} fica num diretório protegido`
  let real: string | undefined
  try {
    real = (await $.fs.stat(cwd, { resolve: true })).realPath
  } catch {
    return `cwd ${cwd} não existe`
  }
  return real === undefined || protectedDir(real, home) ? `cwd ${cwd} fica num diretório protegido` : null
}

async function runGuards($: EngineInterface, cfg: ExecCfg, payload: string): Promise<string | null> {
  if (!cfg.baseDir) return 'prumo-base não encontrado (os guards do Bash vivem lá)'
  if (!cfg.secopsDir) return 'prumo-secops não encontrado (os guards do Bash vivem lá)'
  const hooks = [
    ...BASE_GUARDS.map(h => ({ root: cfg.baseDir as string, hook: h })),
    ...SECOPS_GUARDS.map(h => ({ root: cfg.secopsDir as string, hook: h })),
  ]
  for (const { root, hook } of hooks) {
    const r = await $.process.run(['bash', `${root}/hooks/${hook}`], { stdin: payload, env: { CLAUDE_PLUGIN_ROOT: root }, timeoutMs: 5000 })
    if (r.exitCode === 0) continue
    const why = r.stderr.trim().split('\n')[0] ?? ''
    return r.exitCode === 2 ? why || `${hook} bloqueou` : `${hook} saiu com ${r.exitCode}`
  }
  return null
}

// A aprovação desta chamada: o ficheiro approvals/<id>, validado como o approval-gate valida o seu
// (nível N2, expires no futuro e no máximo 10 minutos à frente, scope once ou ttl), e o registo
// que o diálogo gravou, por gastar. Um ficheiro inválido ou sem registo é apagado.
async function callApproval($: EngineInterface, id: string, file: string): Promise<'ok' | 'none' | 'forged'> {
  let text: string
  try {
    text = await $.fs.read(file)
  } catch {
    return 'none'
  }
  const field = (key: string) => new RegExp(`^${key}=(.*)$`, 'm').exec(text)?.[1] ?? ''
  const [level, expires, scope] = [field('level'), field('expires'), field('scope')]
  const now = Math.floor((await $.clock.now()) / 1000)
  const exp = Number(expires)
  const valid = level === 'N2' && /^[0-9]{1,12}$/.test(expires) && exp > now && exp <= now + APPROVAL_MAX_TTL_S && (scope === 'once' || scope === 'ttl')
  const human = valid ? await humanRecord($, id, 'N2', true) : 'unknown'
  if (human === 'ok') return 'ok'
  await $.process.run(['rm', '-f', file])
  return valid ? 'forged' : 'none'
}

export function registerSecretTool(on: On): void {
  on('tool.call', { tool: TOOL }, async ($, e) => {
    const input = e as unknown as Input
    const argv = Array.isArray(input.argv) ? input.argv.map(String) : []
    const rawRefs = typeof input.secrets === 'object' && input.secrets !== null ? (input.secrets as Record<string, unknown>) : {}
    const refs = Object.fromEntries(Object.entries(rawRefs).map(([k, v]) => [k, String(v)]))
    const deny = (why: string) => ({ deny: `run_with_secret recusado: ${why}` })
    // Também aqui: uma tool registada antes de a pessoa a desligar, ou chamada por outro plugin.
    if (!(await isEnabled($))) return deny('está desligado; só a pessoa o liga, em ~/.prumo/guard.json (secretExec.enabled: true).')
    const cfg = await execConfig($)
    if (!cfg) {
      if (!warnedInvalid) {
        warnedInvalid = true
        $.ui.toast('prumo-guard: ~/.prumo/secret-exec.json inválido — run_with_secret recusa até ser corrigido')
      }
      return deny('~/.prumo/secret-exec.json inválido (JSON, allow que não é uma lista de nomes, ou allowRisky que não é true/false); a pessoa tem de o corrigir.')
    }

    const refusal = checkArgv(argv, cfg.allow, cfg.allowRisky)
    if (refusal) return deny(`${refusal}.`)
    // Daqui em diante, o argv que corre (com as opções que deixam de fora a configuração do cliente).
    const runArgv = clientArgv(argv)
    for (const [name, ref] of Object.entries(refs)) {
      const bad = checkEnvName(name)
      if (bad) return deny(`${bad}.`)
      if (!parseSecretRef(ref)) return deny(`referência inválida para ${name} (usar caminho#campo).`)
    }
    const home = await prumoHome($)
    const hit = protectedArg(argv, home)
    if (hit) return deny(`${hit} aponta para ~/.prumo ou para um settings do Claude Code, que só a pessoa muda.`)
    const cwd = typeof input.cwd === 'string' ? input.cwd : null
    if (cwd !== null) {
      const bad = await cwdProblem($, cwd, home)
      if (bad) return deny(`${bad}.`)
    }
    // O diretório faz parte do que se aprova (um .git/config ou um .psqlrc dependem dele), por
    // isso fixa-se aqui e o comando corre nele, mesmo que a sessão mude de diretório entretanto.
    const runCwd = cwd ?? (await $.session.cwd())
    const line = secretCallLine(runArgv, refs, runCwd)
    if (line.length > SHOWN_MAX) {
      return deny(`a chamada tem ${line.length} caracteres e o painel de aprovação mostra ${SHOWN_MAX}; a pessoa tem de a ver inteira.`)
    }

    let agentType: string | undefined
    if (input.agentId) {
      agentType = (await read($, agentsRef)).find(a => a.id === input.agentId)?.type
      if (!agentType) return deny('subagente de tipo desconhecido; o agent-readonly não o pode avaliar.')
    }
    const command = shellQuote(runArgv)
    const payload = JSON.stringify({
      tool_name: 'Bash',
      tool_input: { command },
      cwd: runCwd,
      ...(agentType ? { agent_type: agentType } : {}),
    })
    const blocked = await runGuards($, cfg, payload)
    if (blocked) return deny(blocked)

    // O controlo do run_with_secret: a pessoa aprova cada chamada (argv, referências e cwd), e cada
    // aprovação serve uma só chamada, também com "10 minutos". Só se gasta depois do approval-gate;
    // se o gate pedir a sua, esta fica para a repetição.
    const id = await sha256Hex(secretCallText(runArgv, refs, runCwd))
    const file = `${home}/approvals/${id}`
    const approval = await callApproval($, id, file)
    if (approval === 'forged') return deny(`${FORGED_NOTE}; o ficheiro foi apagado e nada correu. Repete a chamada para a pessoa decidir no diálogo.`)
    if (approval === 'none') {
      await requestApproval($, { id, level: 'N2', command: line, singleUse: true, ...(input.agentId ? { agentId: input.agentId } : {}) })
      return {
        deny:
          'run_with_secret: cada chamada precisa de aprovação humana e o pedido foi aberto. Não a reformules nem a contornes; ' +
          'quando receberes a aprovação, repete exatamente a mesma chamada (argv, secrets e cwd).',
      }
    }

    if (!cfg.gatePath) return deny('approval-gate do prumo-secops não encontrado.')
    // O gate corre aqui fora da tool Bash: a mesma verificação do ficheiro dele que o hook do Bash faz.
    const gateId = await approvalIdOf(command)
    const gateRefused = await checkApprovalFile($, gateId)
    if (gateRefused) return { deny: gateRefused }
    const gate = await $.process.run(['bash', cfg.gatePath], { stdin: payload, env: { CLAUDE_PLUGIN_ROOT: cfg.secopsDir as string }, timeoutMs: 5000 })
    if (gate.exitCode === 2) {
      const req = parseGateDenial(gate.stderr, gateId)
      if (req) {
        await requestApproval($, { ...req, command, noRules: true, ...(input.agentId ? { agentId: input.agentId } : {}) })
        return { deny: 'run_with_secret: pedido de aprovação aberto ao humano. Repete exatamente esta chamada depois da aprovação.' }
      }
      return deny('bloqueado pelo approval-gate.')
    }
    if (gate.exitCode !== 0) return deny(`approval-gate saiu com ${gate.exitCode}.`)

    // De duas chamadas iguais em paralelo, só uma gasta o registo; o ficheiro sai com ele (`rm` sem
    // -f: se já não estiver lá, também não corre).
    if ((await spendHumanRecord($, id, 'N2', true)) !== 'ok' || (await $.process.run(['rm', file])).exitCode !== 0) {
      return deny('a aprovação desta chamada já foi usada; nada correu.')
    }

    if (!cfg.readerPath) return deny('vault-read-field.sh do prumo-base não encontrado.')
    const values: Record<string, string> = {}
    for (const [name, ref] of Object.entries(refs)) {
      const parsed = parseSecretRef(ref) as { path: string; field: string }
      const got = await $.process.run(['bash', cfg.readerPath, parsed.path, parsed.field], { timeoutMs: 10000 })
      if (got.exitCode !== 0) return deny(`não consegui ler ${name} (${parsed.path}#${parsed.field}); nada correu.`)
      values[name] = got.stdout
    }

    // HOME e XDG num diretório novo e vazio: a configuração do cliente que o agente possa ter
    // escrito (~/.curlrc, ~/.psqlrc, ~/.my.cnf, config do gh) não entra numa chamada aprovada.
    const made = await $.process.run(['mktemp', '-d'])
    const tmp = made.stdout.trim()
    if (made.exitCode !== 0 || !/^\/[^\n]*[^/\n]$/.test(tmp)) return deny('não consegui criar o diretório temporário do cliente; nada correu.')
    let run: ProcessRunResult
    try {
      run = await $.process.run(runArgv, { env: { ...values, ...isolatedEnv(runArgv[0] as string, tmp) }, cwd: runCwd, timeoutMs: 120000 })
    } finally {
      await $.process.run(['rm', '-rf', tmp])
    }
    const out = maskSecrets(run.stdout, values)
    const err = maskSecrets(run.stderr, values)
    return { result: [`exit ${run.exitCode}`, out && `stdout:\n${out}`, err && `stderr:\n${err}`].filter(Boolean).join('\n') }
  }).catch(($, e, next) => (next.called ? next(e) : { deny: 'run_with_secret: falhou antes de executar; nada correu.' }))
}

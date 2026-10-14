import { atom, read } from 'claude-code'
import type { EngineInterface, On } from 'claude-code'
import { requestApproval } from './approval.tsx'
import { approvalIdOf, parseGateDenial } from './approval-parse.ts'
import { prumoHome, readJsonFile } from './config.ts'
import { latestPluginDir } from './plugin-paths.ts'
import { AGENTS_DEFAULT } from './refs.ts'
import { checkArgv, checkEnvName, maskSecrets, parseSecretRef, protectedArg, protectedDir, shellQuote } from './secret-exec.ts'

const agentsRef = atom({ plugin: 'prumo-guard', key: 'agents' } as const, AGENTS_DEFAULT)

const TOOL = 'mcp__prumo-guard__run_with_secret'
const DEFAULT_ALLOW = ['psql', 'mysql', 'curl', 'gh', 'git', 'docker', 'kubectl', 'redis-cli', 'mongosh']
// Os mesmos PreToolUse que um Bash atravessa: o comando não passa pela tool Bash, por isso o mod
// corre-os com um payload sintético. O approval-gate vem no fim, para não pedir aprovação humana
// a um comando que outro guard recusa.
const BASE_GUARDS = ['pre-tool-self-guard.sh', 'pre-tool-secret-read.sh', 'pre-tool-workspace.sh']
const SECOPS_GUARDS = ['pre-tool-agent-readonly.sh']

type Input = { argv?: unknown; secrets?: unknown; cwd?: unknown; agentId?: string }
type ExecCfg = { allow: string[]; readerPath: string | null; gatePath: string | null; baseDir: string | null; secopsDir: string | null }

let warnedInvalid = false

async function execConfig($: EngineInterface): Promise<ExecCfg | null> {
  const file = await readJsonFile($, `${await prumoHome($)}/secret-exec.json`)
  if (file.state === 'invalid') return null
  const value = file.state === 'ok' ? file.value : {}
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const raw = value as Partial<{ allow: unknown; readerPath: unknown; gatePath: unknown }>
  // Um `allow` mal escrito recusa: cair nos defaults alargava uma allowlist restrita sem aviso.
  if (raw.allow !== undefined && !(Array.isArray(raw.allow) && raw.allow.every(x => typeof x === 'string'))) return null
  if ((raw.readerPath !== undefined && typeof raw.readerPath !== 'string') || (raw.gatePath !== undefined && typeof raw.gatePath !== 'string')) return null
  const baseDir = await latestPluginDir($, 'prumo-base')
  const secopsDir = await latestPluginDir($, 'prumo-secops')
  return {
    allow: Array.isArray(raw.allow) ? (raw.allow as string[]) : DEFAULT_ALLOW,
    readerPath: typeof raw.readerPath === 'string' ? raw.readerPath : baseDir ? `${baseDir}/lib/vault-read-field.sh` : null,
    gatePath: typeof raw.gatePath === 'string' ? raw.gatePath : secopsDir ? `${secopsDir}/hooks/pre-tool-approval-gate.sh` : null,
    baseDir,
    secopsDir,
  }
}

// Chamada pelo único session.start do register.tsx.
export async function startSecretTool($: EngineInterface): Promise<void> {
  await $.tool.register({
    name: 'run_with_secret',
    description:
      'Corre um comando com segredos do Vault injetados como variáveis de ambiente; o mod não põe o valor na conversa. ' +
      'argv é o comando já partido (sem shell); secrets mapeia NOME_DA_VARIAVEL → "caminho/kv#campo". ' +
      'O output volta com o valor trocado por [SEGREDO:NOME] na forma crua, sem espaço final e codificada em URL (outras codificações não são mascaradas). ' +
      'Recusa shells, interpretadores e as opções conhecidas com que git, curl, docker, kubectl, gh, psql e mysql correm código; passa pelos mesmos guards do Bash e pelo approval-gate.',
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

export function registerSecretTool(on: On): void {
  on('tool.call', { tool: TOOL }, async ($, e) => {
    const input = e as unknown as Input
    const argv = Array.isArray(input.argv) ? input.argv.map(String) : []
    const refs = typeof input.secrets === 'object' && input.secrets !== null ? (input.secrets as Record<string, unknown>) : {}
    const deny = (why: string) => ({ deny: `run_with_secret recusado: ${why}` })
    const cfg = await execConfig($)
    if (!cfg) {
      if (!warnedInvalid) {
        warnedInvalid = true
        $.ui.toast('prumo-guard: ~/.prumo/secret-exec.json inválido — run_with_secret recusa até ser corrigido')
      }
      return deny('~/.prumo/secret-exec.json inválido (JSON, ou allow que não é uma lista de nomes); a pessoa tem de o corrigir.')
    }

    const refusal = checkArgv(argv, cfg.allow)
    if (refusal) return deny(`${refusal}.`)
    for (const name of Object.keys(refs)) {
      const bad = checkEnvName(name)
      if (bad) return deny(`${bad}.`)
    }
    const home = await prumoHome($)
    const hit = protectedArg(argv, home)
    if (hit) return deny(`${hit} aponta para ~/.prumo ou para um settings do Claude Code, que só a pessoa muda.`)
    const cwd = typeof input.cwd === 'string' ? input.cwd : null
    if (cwd !== null) {
      const bad = await cwdProblem($, cwd, home)
      if (bad) return deny(`${bad}.`)
    }

    let agentType: string | undefined
    if (input.agentId) {
      agentType = (await read($, agentsRef)).find(a => a.id === input.agentId)?.type
      if (!agentType) return deny('subagente de tipo desconhecido; o agent-readonly não o pode avaliar.')
    }
    const command = shellQuote(argv)
    const payload = JSON.stringify({
      tool_name: 'Bash',
      tool_input: { command },
      cwd: cwd ?? (await $.session.cwd()),
      ...(agentType ? { agent_type: agentType } : {}),
    })
    const blocked = await runGuards($, cfg, payload)
    if (blocked) return deny(blocked)

    if (!cfg.gatePath) return deny('approval-gate do prumo-secops não encontrado.')
    const gate = await $.process.run(['bash', cfg.gatePath], { stdin: payload, env: { CLAUDE_PLUGIN_ROOT: cfg.secopsDir as string }, timeoutMs: 5000 })
    if (gate.exitCode === 2) {
      const req = parseGateDenial(gate.stderr, await approvalIdOf(command))
      if (req) {
        await requestApproval($, { ...req, command, ...(input.agentId ? { agentId: input.agentId } : {}) })
        return { deny: 'run_with_secret: pedido de aprovação aberto ao humano. Repete exatamente esta chamada depois da aprovação.' }
      }
      return deny('bloqueado pelo approval-gate.')
    }
    if (gate.exitCode !== 0) return deny(`approval-gate saiu com ${gate.exitCode}.`)

    if (!cfg.readerPath) return deny('vault-read-field.sh do prumo-base não encontrado.')
    const values: Record<string, string> = {}
    for (const [name, ref] of Object.entries(refs)) {
      const parsed = parseSecretRef(String(ref))
      if (!parsed) return deny(`referência inválida para ${name} (usar caminho#campo).`)
      const got = await $.process.run(['bash', cfg.readerPath, parsed.path, parsed.field], { timeoutMs: 10000 })
      if (got.exitCode !== 0) return deny(`não consegui ler ${name} (${parsed.path}#${parsed.field}); nada correu.`)
      values[name] = got.stdout
    }

    const run = await $.process.run(argv, {
      env: values,
      ...(cwd !== null ? { cwd } : {}),
      timeoutMs: 120000,
    })
    const out = maskSecrets(run.stdout, values)
    const err = maskSecrets(run.stderr, values)
    return { result: [`exit ${run.exitCode}`, out && `stdout:\n${out}`, err && `stderr:\n${err}`].filter(Boolean).join('\n') }
  }).catch(($, e, next) => (next.called ? next(e) : { deny: 'run_with_secret: falhou antes de executar; nada correu.' }))
}

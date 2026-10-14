import type { EngineInterface, On } from 'claude-code'
import { requestApproval } from './approval.tsx'
import { parseGateDenial } from './approval-parse.ts'
import { prumoHome } from './config.ts'
import { latestPluginDir } from './plugin-paths.ts'
import { checkArgv, maskSecrets, parseSecretRef, shellQuote } from './secret-exec.ts'

const TOOL = 'mcp__prumo-guard__run_with_secret'
const DEFAULT_ALLOW = ['psql', 'mysql', 'curl', 'gh', 'git', 'docker', 'kubectl', 'redis-cli', 'mongosh']

type Input = { argv?: unknown; secrets?: unknown; cwd?: unknown; agentId?: string }
type ExecCfg = { allow: string[]; readerPath: string | null; gatePath: string | null }

async function execConfig($: EngineInterface): Promise<ExecCfg> {
  let raw: Partial<{ allow: unknown; readerPath: unknown; gatePath: unknown }> = {}
  try {
    raw = JSON.parse(await $.fs.read(`${await prumoHome($)}/secret-exec.json`))
  } catch {
    raw = {}
  }
  const baseDir = await latestPluginDir($, 'prumo-base')
  const secopsDir = await latestPluginDir($, 'prumo-secops')
  return {
    allow: Array.isArray(raw.allow) ? raw.allow.filter((x): x is string => typeof x === 'string') : DEFAULT_ALLOW,
    readerPath: typeof raw.readerPath === 'string' ? raw.readerPath : baseDir ? `${baseDir}/lib/vault-read-field.sh` : null,
    gatePath: typeof raw.gatePath === 'string' ? raw.gatePath : secopsDir ? `${secopsDir}/hooks/pre-tool-approval-gate.sh` : null,
  }
}

// Chamada pelo único session.start do register.tsx.
export async function startSecretTool($: EngineInterface): Promise<void> {
  await $.tool.register({
    name: 'run_with_secret',
    description:
      'Corre um comando com segredos do Vault injetados como variáveis de ambiente, sem que o valor entre na conversa. ' +
      'argv é o comando já partido (sem shell); secrets mapeia NOME_DA_VARIAVEL → "caminho/kv#campo". ' +
      'O output volta com os valores trocados por [SEGREDO:NOME]. Shells e interpretadores são recusados.',
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

export function registerSecretTool(on: On): void {
  on('tool.call', { tool: TOOL }, async ($, e) => {
    const input = e as unknown as Input
    const argv = Array.isArray(input.argv) ? input.argv.map(String) : []
    const refs = typeof input.secrets === 'object' && input.secrets !== null ? (input.secrets as Record<string, unknown>) : {}
    const cfg = await execConfig($)

    const refusal = checkArgv(argv, cfg.allow)
    if (refusal) return { result: `run_with_secret recusado: ${refusal}.` }
    for (const name of Object.keys(refs)) {
      if (!/^[A-Z_][A-Z0-9_]*$/.test(name)) return { result: `run_with_secret recusado: nome de variável inválido (${name}).` }
    }

    if (!cfg.gatePath) return { result: 'run_with_secret recusado: approval-gate do prumo-secops não encontrado.' }
    const command = shellQuote(argv)
    const payload = JSON.stringify({ tool_name: 'Bash', tool_input: { command } })
    const gate = await $.process.run(['bash', cfg.gatePath], { stdin: payload, timeoutMs: 5000 })
    if (gate.exitCode === 2) {
      const req = parseGateDenial(gate.stderr)
      if (req) {
        await requestApproval($, { ...req, command, ...(input.agentId ? { agentId: input.agentId } : {}) })
        return { result: 'run_with_secret: pedido de aprovação aberto ao humano. Repete exatamente esta chamada depois da aprovação.' }
      }
      return { result: 'run_with_secret recusado pelo approval-gate.' }
    }
    if (gate.exitCode !== 0) return { result: `run_with_secret recusado: approval-gate saiu com ${gate.exitCode}.` }

    if (!cfg.readerPath) return { result: 'run_with_secret recusado: vault-read-field.sh do prumo-base não encontrado.' }
    const values: Record<string, string> = {}
    for (const [name, ref] of Object.entries(refs)) {
      const parsed = parseSecretRef(String(ref))
      if (!parsed) return { result: `run_with_secret recusado: referência inválida para ${name} (usar caminho#campo).` }
      const read = await $.process.run(['bash', cfg.readerPath, parsed.path, parsed.field], { timeoutMs: 10000 })
      if (read.exitCode !== 0) return { result: `run_with_secret: não consegui ler ${name} (${parsed.path}#${parsed.field}).` }
      values[name] = read.stdout
    }

    const run = await $.process.run(argv, {
      env: values,
      ...(typeof input.cwd === 'string' ? { cwd: input.cwd } : {}),
      timeoutMs: 120000,
    })
    const out = maskSecrets(run.stdout, values)
    const err = maskSecrets(run.stderr, values)
    return { result: [`exit ${run.exitCode}`, out && `stdout:\n${out}`, err && `stderr:\n${err}`].filter(Boolean).join('\n') }
  }).catch(($, e, next) => (next.called ? next(e) : { deny: 'run_with_secret: falhou antes de executar; nada correu.' }))
}

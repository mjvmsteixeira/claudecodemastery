import { atom } from 'claude-code'
import type { EngineInterface } from 'claude-code'
import type { PrumoGuardRule } from '../types'
import { sha256Hex } from './approval-parse.ts'
import { prumoHome } from './config.ts'
import { RULES_DEFAULT } from './refs.ts'

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

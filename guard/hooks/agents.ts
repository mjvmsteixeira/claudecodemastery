import type { EngineInterface, On } from 'claude-code'
import { loadConfig, prumoHome } from './config.ts'

const HUMAN_ONLY = 'prumo-guard: este comando só aceita a tecla Enter da pessoa.'

const matches = (agent: string, name: string) => agent === name || agent.endsWith(`:${name}`)

// Chamado pelo único session.start do register.tsx.
export async function startAgents($: EngineInterface): Promise<void> {
  await $.command.register({
    name: 'prumo-guard-agents',
    description: 'Lista ou altera os agentes escondidos do modelo. Só pela pessoa.',
    argumentHint: '[hide|show <agente>]',
  })
}

export function registerAgents(on: On): void {
  on('agent.offer', async ($, e, next) => {
    const hidden = (await loadConfig($)).agents.hidden
    if (hidden.some(h => matches(e.agent, h))) return { isOffered: false }
    return next(e)
  })

  on('command.run', { command: 'prumo-guard-agents' }, async ($, e) => {
    const cfgPath = `${await prumoHome($)}/guard.json`
    const [verb, name] = e.args.trim().split(/\s+/)
    if (!verb) {
      const hidden = (await loadConfig($)).agents.hidden
      return { text: hidden.length ? `Escondidos do modelo: ${hidden.join(', ')}` : 'Nenhum agente escondido.' }
    }
    if (e.origin.kind !== 'composer') return { text: HUMAN_ONLY }
    if ((verb !== 'hide' && verb !== 'show') || !name) return { text: 'Uso: /prumo-guard-agents [hide|show <agente>]' }
    let raw: Record<string, unknown> = {}
    try {
      raw = JSON.parse(await $.fs.read(cfgPath))
    } catch {
      raw = {}
    }
    const agents = (typeof raw.agents === 'object' && raw.agents !== null ? raw.agents : {}) as { hidden?: string[] }
    const set = new Set(agents.hidden ?? [])
    if (verb === 'hide') set.add(name)
    else set.delete(name)
    await $.fs.write(cfgPath, JSON.stringify({ ...raw, agents: { ...agents, hidden: [...set] } }, null, 2) + '\n')
    return { text: `${verb === 'hide' ? 'Escondido' : 'Visível'}: ${name}. Vale a partir do próximo agente oferecido.` }
  })
}

export type PrumoGuardLevel = 'N1' | 'N2' | 'N3'

export type PrumoGuardPending = {
  id: string
  level: PrumoGuardLevel
  command: string
  requestedAt: number
  agentId?: string
}

export type PrumoGuardLoop = { active: boolean; iteration: number | null; maxIterations: number | null }
export type PrumoGuardTests = { command: string; passed: number; failed: number; at: number }
export type PrumoGuardAgent = { id: string; type: string; startedAt: number }
export type PrumoGuardUsage = { contextPercent: number | null; usd: number | null; rate: string }

declare module 'claude-code' {
  interface PluginState {
    'prumo-guard': {
      pending: PrumoGuardPending[]
      redactOn: boolean
      redactHits: number
      loop: PrumoGuardLoop
      phase: string | null
      tests: PrumoGuardTests | null
      agents: PrumoGuardAgent[]
      usage: PrumoGuardUsage
    }
  }
}

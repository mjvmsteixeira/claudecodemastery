export type PrumoGuardLevel = 'N1' | 'N2' | 'N3'

export type PrumoGuardPending = {
  id: string
  level: PrumoGuardLevel
  command: string
  requestedAt: number
  agentId?: string
}

declare module 'claude-code' {
  interface PluginState {
    'prumo-guard': {
      pending: PrumoGuardPending[]
      redactOn: boolean
      redactHits: number
    }
  }
}

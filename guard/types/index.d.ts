export type PrumoGuardLevel = 'N1' | 'N2' | 'N3'

export type PrumoGuardPending = {
  id: string
  level: PrumoGuardLevel
  command: string
  requestedAt: number
  agentId?: string
  // run_with_secret: a aprovação serve uma só chamada, também com "10 minutos".
  singleUse?: boolean
}

// O que a pessoa decidiu no diálogo, guardado pelo mod: um approvals/<id> só serve com o registo
// correspondente (mesmo id e nível, por expirar e, se for de uma vez, por usar).
export type PrumoGuardApproval = {
  id: string
  level: PrumoGuardLevel
  scope: 'once' | 'ttl'
  expires: number
  used: boolean
}

export type PrumoGuardLoop = { active: boolean; iteration: number | null; maxIterations: number | null }
export type PrumoGuardTests = { command: string; passed: number; failed: number; at: number }
export type PrumoGuardAgent = { id: string; type: string; startedAt: number }
export type PrumoGuardUsage = { contextPercent: number | null; usd: number | null; rate: string }

export type PrumoGuardRepeat = {
  lastKey: string | null
  sameCount: number
  lastFailSig: string | null
  failCount: number
  edits: { file: string; old: string; neu: string }[]
  flips: number
}
export type PrumoGuardBrake = { paused: boolean; reason: string | null; loopStartUsd: number | null; tokens: number }

// Uma regra de aprovação do projeto (~/.prumo/rules/<sha256 do projeto>.json). Só N1. Só vale numa
// sessão depois de a pessoa a ativar; o match usa a cópia tirada nesse momento (rulesActive).
export type PrumoGuardRule =
  | { id: string; kind: 'level'; level: 'N1'; createdAt: string }
  | { id: string; kind: 'command'; level: 'N1'; commandId: string; command: string; createdAt: string }

declare module 'claude-code' {
  interface PluginState {
    'prumo-guard': {
      pending: PrumoGuardPending[]
      approvals: PrumoGuardApproval[]
      redactOn: boolean
      redactHits: number
      loop: PrumoGuardLoop
      phase: string | null
      tests: PrumoGuardTests | null
      agents: PrumoGuardAgent[]
      usage: PrumoGuardUsage
      repeat: PrumoGuardRepeat
      brake: PrumoGuardBrake
      rulesFile: PrumoGuardRule[]
      rulesOffered: PrumoGuardRule[]
      rulesActive: PrumoGuardRule[]
    }
  }
}

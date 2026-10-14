import type { PrumoGuardAgent, PrumoGuardApproval, PrumoGuardBrake, PrumoGuardLoop, PrumoGuardPending, PrumoGuardTests, PrumoGuardUsage } from '../types'

// O validador só lê átomos cuja referência (plugin e chave literais) está declarada no próprio
// ficheiro que os usa; por isso cada módulo declara o seu `atom({ plugin: 'prumo-guard', key })` e
// o que se partilha aqui são os valores por omissão, para as declarações não divergirem.
export const PENDING_DEFAULT: PrumoGuardPending[] = []
export const APPROVALS_DEFAULT: PrumoGuardApproval[] = []
export const LOOP_DEFAULT: PrumoGuardLoop = { active: false, iteration: null, maxIterations: null }
export const PHASE_DEFAULT: string | null = null
export const TESTS_DEFAULT: PrumoGuardTests | null = null
export const AGENTS_DEFAULT: PrumoGuardAgent[] = []
export const USAGE_DEFAULT: PrumoGuardUsage = { contextPercent: null, usd: null, rate: '' }
export const BRAKE_DEFAULT: PrumoGuardBrake = { paused: false, reason: null, loopStartUsd: null, tokens: 0 }

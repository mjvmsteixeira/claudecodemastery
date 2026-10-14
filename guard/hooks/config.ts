import type { EngineInterface } from 'claude-code'

export type GuardConfig = {
  redact: { enabled: boolean; prompt: boolean; readPii: boolean; internalIps: boolean }
  brake: { usdBudget: number; tokenBudget: number; repeatLimit: number }
  workspace: { extraRoots: string[] }
  friday: { enabled: boolean }
  agents: { hidden: string[] }
  mempalace: { staleDays: number }
  cef: { enabled: boolean }
}

export const DEFAULTS: GuardConfig = {
  redact: { enabled: true, prompt: true, readPii: false, internalIps: false },
  brake: { usdBudget: 20, tokenBudget: 0, repeatLimit: 4 },
  workspace: { extraRoots: [] },
  friday: { enabled: false },
  agents: { hidden: [] },
  mempalace: { staleDays: 90 },
  cef: { enabled: true },
}

export async function prumoHome($: EngineInterface): Promise<string> {
  const explicit = await $.env.get('PRUMO_HOME')
  if (explicit) return explicit
  return `${(await $.env.get('HOME')) ?? ''}/.prumo`
}

function section<K extends keyof GuardConfig>(raw: unknown, key: K): GuardConfig[K] {
  const value = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>)[key] : undefined
  if (typeof value !== 'object' || value === null) return DEFAULTS[key]
  return { ...DEFAULTS[key], ...(value as object) } as GuardConfig[K]
}

export async function loadConfig($: EngineInterface): Promise<GuardConfig> {
  let raw: unknown = {}
  try {
    raw = JSON.parse(await $.fs.read(`${await prumoHome($)}/guard.json`))
  } catch {
    raw = {}
  }
  return {
    redact: section(raw, 'redact'),
    brake: section(raw, 'brake'),
    workspace: section(raw, 'workspace'),
    friday: section(raw, 'friday'),
    agents: section(raw, 'agents'),
    mempalace: section(raw, 'mempalace'),
    cef: section(raw, 'cef'),
  }
}

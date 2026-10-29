import type { EngineInterface } from 'claude-code'

export type GuardConfig = {
  redact: { enabled: boolean; prompt: boolean; readPii: boolean; internalIps: boolean; capture: boolean }
  brake: { enabled: boolean; usdBudget: number; tokenBudget: number; repeatLimit: number }
  workspace: { extraRoots: string[] }
  agents: { hidden: string[] }
  mempalace: { staleDays: number }
  cef: { enabled: boolean }
  secretExec: { enabled: boolean }
  panel: { warn: number; crit: number }
}

export const DEFAULTS: GuardConfig = {
  redact: { enabled: true, prompt: true, readPii: false, internalIps: false, capture: true },
  // O travão é opt-in: só atua com brake.enabled true (ação humana no guard.json).
  brake: { enabled: false, usdBudget: 20, tokenBudget: 0, repeatLimit: 4 },
  workspace: { extraRoots: [] },
  agents: { hidden: [] },
  mempalace: { staleDays: 90 },
  cef: { enabled: true },
  // run_with_secret: desligado até a pessoa o ligar (a ferramenta nem é registada).
  secretExec: { enabled: false },
  panel: { warn: 50, crit: 80 },
}

export async function prumoHome($: EngineInterface): Promise<string> {
  const explicit = await $.env.get('PRUMO_HOME')
  if (explicit) return explicit
  return `${(await $.env.get('HOME')) ?? ''}/.prumo`
}

export type JsonFile = { state: 'missing' } | { state: 'invalid' } | { state: 'ok'; value: unknown }

// Ficheiro de configuração JSON: ausente, ilegível ou inválido são casos distintos, para que um
// erro num ficheiro de segurança não passe por ausência (e caia nos defaults) sem aviso.
export async function readJsonFile($: EngineInterface, path: string): Promise<JsonFile> {
  let text: string
  try {
    text = await $.fs.read(path)
  } catch {
    // $.fs.exists só rejeita para locais de rede, que aqui contam como ausentes.
    return (await $.fs.exists(path).catch(() => false)) ? { state: 'invalid' } : { state: 'missing' }
  }
  try {
    return { state: 'ok', value: JSON.parse(text) }
  } catch {
    return { state: 'invalid' }
  }
}

function section<K extends keyof GuardConfig>(raw: unknown, key: K): GuardConfig[K] {
  const value = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>)[key] : undefined
  if (typeof value !== 'object' || value === null) return DEFAULTS[key]
  return { ...DEFAULTS[key], ...(value as object) } as GuardConfig[K]
}

function percent(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 100 ? v : fallback
}

// Limiares do painel: cada campo inválido cai no seu default; se o par ficar incoerente, caem os dois.
function panelSection(raw: unknown): GuardConfig['panel'] {
  const m = section(raw, 'panel') as Record<string, unknown>
  const warn = percent(m.warn, DEFAULTS.panel.warn)
  const crit = percent(m.crit, DEFAULTS.panel.crit)
  return warn < crit ? { warn, crit } : { ...DEFAULTS.panel }
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
    agents: section(raw, 'agents'),
    mempalace: section(raw, 'mempalace'),
    cef: section(raw, 'cef'),
    secretExec: section(raw, 'secretExec'),
    panel: panelSection(raw),
  }
}

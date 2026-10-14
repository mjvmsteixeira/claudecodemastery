import type { PrumoGuardLevel } from '../types'

const LEVEL_RE = /\[prumo-secops\/approval-gate\] Operação (N[123]) detectada:/
const ID_RE = /approval-id: ([0-9a-f]{64})/

export function parseGateDenial(text: string): { id: string; level: PrumoGuardLevel } | null {
  const level = LEVEL_RE.exec(text)?.[1]
  const id = ID_RE.exec(text)?.[1]
  if (!level || !id) return null
  return { id, level: level as PrumoGuardLevel }
}

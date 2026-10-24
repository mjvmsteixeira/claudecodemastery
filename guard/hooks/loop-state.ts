export function parseRalphState(text: string): { iteration: number | null; maxIterations: number | null } | null {
  const m = /^---\n([\s\S]*?)\n---/.exec(text)
  if (!m) return null
  const field = (name: string): number | null => {
    const v = new RegExp(`^${name}:\\s*(.+)$`, 'm').exec(m[1] ?? '')?.[1]?.trim()
    return v !== undefined && /^\d+$/.test(v) ? Number(v) : null
  }
  return { iteration: field('iteration'), maxIterations: field('max_iterations') }
}

export function parseRalphSession(text: string): string | null {
  const m = /^---\n([\s\S]*?)\n---/.exec(text)
  const v = /^session_id:\s*(.+)$/m.exec(m?.[1] ?? '')?.[1]?.trim().replace(/^(["'])(.*)\1$/, '$2')
  return v ? v : null
}

export const MEMPALACE_SEARCH = 'mcp__plugin_mempalace_mempalace__mempalace_search'

export function ageNote(resultJson: string, nowMs: number, staleDays: number): string | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(resultJson)
  } catch {
    return null
  }
  const results = (parsed as { results?: unknown }).results
  if (!Array.isArray(results)) return null
  const parts: string[] = []
  results.forEach((r, i) => {
    const created = typeof (r as { created_at?: unknown }).created_at === 'string' ? Date.parse((r as { created_at: string }).created_at) : NaN
    if (Number.isNaN(created)) return
    const days = Math.floor((nowMs - created) / 86_400_000)
    parts.push(`#${i + 1} há ${days} dias${days > staleDays ? ' (antigo: confirmar antes de usar)' : ''}`)
  })
  return parts.length ? `[prumo-guard] idade das memórias: ${parts.join(' · ')}` : null
}

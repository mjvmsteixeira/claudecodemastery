export type Level = 'ok' | 'warn' | 'crit'

export function levelOf(pct: number, t: { warn: number; crit: number }): Level {
  if (pct >= t.crit) return 'crit'
  if (pct >= t.warn) return 'warn'
  return 'ok'
}

export function bar(pct: number): { filled: number; empty: number } {
  const filled = Math.min(8, Math.max(0, Math.round(pct / 12.5)))
  return { filled, empty: 8 - filled }
}

export function windowLabel(kind: string): string {
  if (kind === 'five_hour') return '5h'
  if (kind === 'seven_day') return '7d'
  return kind
}

const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

export function resetText(resetsAt: string | undefined, nowMs: number): string | null {
  if (!resetsAt) return null
  const at = Date.parse(resetsAt)
  if (Number.isNaN(at)) return null
  const diff = at - nowMs
  if (diff <= 0) return null
  if (diff < 24 * 3600_000) {
    const h = Math.floor(diff / 3600_000)
    const m = Math.floor((diff % 3600_000) / 60_000)
    return `${h}h${String(m).padStart(2, '0')}`
  }
  const d = new Date(at)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${WEEKDAYS[d.getDay()]} ${hh}:${mm}`
}

export function levelColor(l: Level): 'success' | 'warning' | 'error' {
  if (l === 'crit') return 'error'
  if (l === 'warn') return 'warning'
  return 'success'
}

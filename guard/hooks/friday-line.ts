const cut = (v: unknown): string | null => {
  if (v === undefined || v === null) return null
  return (typeof v === 'string' ? v : String(v)).slice(0, 64)
}

export function fridayLine(i: { t: number; e?: unknown; p?: unknown; tool?: unknown; ag?: unknown; at?: unknown; nt?: unknown }): string {
  return JSON.stringify({ t: i.t, e: cut(i.e), p: cut(i.p), tool: cut(i.tool), ag: cut(i.ag), at: cut(i.at), nt: cut(i.nt) })
}

export function validSessionId(sid: unknown): string | null {
  return typeof sid === 'string' && /^[A-Za-z0-9-]{1,64}$/.test(sid) ? sid : null
}

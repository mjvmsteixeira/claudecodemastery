export function verdictOf(ran: { deny?: string; isError?: boolean; text?: string }): { verdict: 'allow' | 'deny' | 'blocked' | 'withheld'; hook: string } {
  if (ran.deny !== undefined) return { verdict: 'deny', hook: 'plugin' }
  const text = ran.text ?? ''
  if (text.includes('a plugin withheld its result')) return { verdict: 'withheld', hook: 'plugin' }
  if (ran.isError) {
    const prumo = /\[(prumo-[a-z]+\/[a-z-]+)\]/.exec(text)?.[1]
    if (prumo) return { verdict: 'blocked', hook: prumo }
    const personal = /\[(pretool-[a-z-]+)\]/.exec(text)?.[1]
    if (personal) return { verdict: 'blocked', hook: personal }
  }
  return { verdict: 'allow', hook: '' }
}

// Igual ao cef_escape de secops/hooks/post-tool-cef-wazuh.sh: barra, pipe e igual escapados; sem quebras de linha.
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/=/g, '\\=').replace(/[\r\n]/g, '')
const SEV = { allow: 3, deny: 5, withheld: 5, blocked: 6 } as const

export function cefLine(r: { host: string; user: string; tool: string; agent: string; session: string; inputHash: string; verdict: keyof typeof SEV; hook: string; iteration: number | null }): string {
  return (
    `CEF:0|prumo|SecOps-Agents|1.0|toolcall|Claude Code tool call|${SEV[r.verdict]}|` +
    `src=${esc(r.host)} suser=${esc(r.user)} cs1Label=Tool cs1=${esc(r.tool)} cs2Label=Agent cs2=${esc(r.agent)} ` +
    `cs3Label=Session cs3=${esc(r.session)} cs4Label=InputHash cs4=${esc(r.inputHash)} ` +
    `cs5Label=Verdict cs5=${r.verdict} cs6Label=Hook cs6=${esc(r.hook)}` +
    (r.iteration !== null ? ` cn2Label=LoopIteration cn2=${r.iteration}` : '')
  )
}

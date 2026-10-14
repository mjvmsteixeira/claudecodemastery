import { atom, read } from 'claude-code'
import type { EngineInterface } from 'claude-code'
import { readMode } from './mode.ts'
import { PENDING_DEFAULT } from './refs.ts'

const redactOn = atom({ plugin: 'prumo-guard', key: 'redactOn' } as const, true)
const pending = atom({ plugin: 'prumo-guard', key: 'pending' } as const, PENDING_DEFAULT)

export async function refreshStatus($: EngineInterface): Promise<void> {
  const mode = await readMode($)
  const on = await read($, redactOn)
  const n = (await read($, pending)).length
  const parts = [`prumo ${mode}`, `redação ${on ? 'on' : 'off'}`]
  if (n > 0) parts.push(`${n} aprovação(ões) pendente(s)`)
  await $.ui.status(parts.join(' · '))
}

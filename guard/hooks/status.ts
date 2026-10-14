import { atom, read } from 'claude-code'
import type { EngineInterface } from 'claude-code'
import { readMode } from './mode.ts'
import { BRAKE_DEFAULT, LOOP_DEFAULT, PENDING_DEFAULT } from './refs.ts'

const redactOn = atom({ plugin: 'prumo-guard', key: 'redactOn' } as const, true)
const loopRef = atom({ plugin: 'prumo-guard', key: 'loop' } as const, LOOP_DEFAULT)
const brakeRef = atom({ plugin: 'prumo-guard', key: 'brake' } as const, BRAKE_DEFAULT)
const pending = atom({ plugin: 'prumo-guard', key: 'pending' } as const, PENDING_DEFAULT)

export async function refreshStatus($: EngineInterface): Promise<void> {
  const mode = await readMode($)
  const on = await read($, redactOn)
  const n = (await read($, pending)).length
  const parts = [`prumo ${mode}`, `redação ${on ? 'on' : 'off'}`]
  const loop = await read($, loopRef)
  if (loop.active) parts.push(`ralph ${loop.iteration ?? '?'}/${loop.maxIterations ?? '?'}`)
  if ((await read($, brakeRef)).paused) parts.push('pausa')
  if (n > 0) parts.push(`${n} aprovação(ões) pendente(s)`)
  await $.ui.status(parts.join(' · '))
}

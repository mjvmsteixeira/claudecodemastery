import type { On } from 'claude-code'
import { loadConfig } from './config.ts'
import { ageNote, MEMPALACE_SEARCH } from './mempalace-age.ts'

type Block = { type: string; text?: string; content?: unknown; [k: string]: unknown }

export function registerMemory(on: On): void {
  on('session.append', async ($, e, next) => {
    if (e.door !== 'tool-result' || e.origin.kind !== 'tool' || e.origin.tool !== MEMPALACE_SEARCH) return next(e)
    const staleDays = (await loadConfig($)).mempalace.staleDays
    const now = await $.clock.now()
    const content = (e.message.content as Block[]).map(b => {
      if (b.type !== 'tool_result') return b
      const text = typeof b.content === 'string' ? b.content : Array.isArray(b.content) ? (b.content as Block[]).map(c => c.text ?? '').join('') : ''
      const note = ageNote(text, now, staleDays)
      if (!note) return b
      return typeof b.content === 'string' ? { ...b, content: `${b.content}\n${note}` } : { ...b, content: [...(b.content as Block[]), { type: 'text', text: note }] }
    })
    return next({ ...e, message: { ...e.message, content: content as typeof e.message.content } })
  })
}

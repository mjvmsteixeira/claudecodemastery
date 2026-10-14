import type { Register } from 'claude-code'
import { loadConfig } from './config.ts'
import { registerApproval } from './approval.tsx'
import { registerFriday } from './friday.ts'
import { registerMemory } from './memory.ts'

export const register: Register = on => {
  registerApproval(on)

  on('session.start', async ($, e, next) => {
    const cfg = await loadConfig($)
    $.ui.status(`prumo-guard · orçamento ${cfg.brake.usdBudget} USD · repetição ${cfg.brake.repeatLimit} · ips internos ${cfg.redact.internalIps ? 'on' : 'off'}`)
    return next(e)
  })

  registerFriday(on)
  registerMemory(on)
}

import type { Register } from 'claude-code'
import { registerApproval } from './approval.tsx'
import { registerRedaction, startRedaction } from './redact.ts'
import { registerFriday } from './friday.ts'
import { registerMemory } from './memory.ts'
import { registerSecretTool, startSecretTool } from './secret-tool.ts'

export const register: Register = on => {
  registerApproval(on)
  registerRedaction(on)
  registerSecretTool(on)

  on('session.start', async ($, e, next) => {
    const cfg = await startRedaction($)
    $.ui.status(`prumo-guard · orçamento ${cfg.brake.usdBudget} USD · repetição ${cfg.brake.repeatLimit} · ips internos ${cfg.redact.internalIps ? 'on' : 'off'}`)
    await startSecretTool($)
    return next(e)
  })

  registerFriday(on)
  registerMemory(on)
}

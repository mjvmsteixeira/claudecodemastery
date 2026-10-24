import type { Register } from 'claude-code'
import { registerApproval } from './approval.tsx'
import { startAuditTrail } from './audit-trail.ts'
import { registerBrake, startBrake } from './brake.ts'
import { registerCommands, startCommands } from './commands.ts'
import { registerRules, startRules } from './rules.tsx'
import { registerRedaction, startRedaction } from './redact.ts'
import { registerObservers } from './observers.ts'
import { registerPanel, startPanel } from './panel.tsx'
import { registerMemory } from './memory.ts'
import { refreshStatus } from './status.ts'
import { registerSecretTool, startSecretTool } from './secret-tool.ts'
import { registerAgents, startAgents } from './agents.ts'

export const register: Register = on => {
  // Primeiro: o despachante dos eventos partilhados é o hook mais exterior (ver observers.ts).
  registerObservers(on)
  registerApproval(on)
  registerRules(on)
  registerRedaction(on)
  registerCommands(on)
  registerPanel(on)
  registerBrake(on)
  registerSecretTool(on)

  // Único session.start sem matcher do módulo: cada funcionalidade expõe a sua função de arranque.
  on('session.start', async ($, e, next) => {
    await startRedaction($)
    await startCommands($)
    await startPanel($)
    await startBrake($)
    await startAuditTrail($)
    await startSecretTool($)
    await startAgents($)
    await startRules($)
    await refreshStatus($)
    return next(e)
  })

  registerAgents(on)
  registerMemory(on)
}

import type { Register } from 'claude-code'
import { registerApproval } from './approval.tsx'
import { registerCommands, startCommands } from './commands.ts'
import { registerRedaction, startRedaction } from './redact.ts'
import { registerFriday } from './friday.ts'
import { registerMemory } from './memory.ts'
import { refreshStatus } from './status.ts'

export const register: Register = on => {
  registerApproval(on)
  registerRedaction(on)
  registerCommands(on)

  // Único session.start sem matcher do módulo: cada funcionalidade expõe a sua função de arranque.
  on('session.start', async ($, e, next) => {
    await startRedaction($)
    await startCommands($)
    await refreshStatus($)
    return next(e)
  })

  registerFriday(on)
  registerMemory(on)
}

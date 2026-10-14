import type { On } from 'claude-code'
import { fridaySessionEnd, fridayStop, fridayToolCall } from './friday.ts'
import { brakeMeasure, brakeStop, brakeToolCall, brakeTurnComplete, brakeTurnStart } from './brake.ts'
import { panelAgentSpawn, panelMeasure, panelTurnComplete, panelTurnStart } from './panel.tsx'

// O validador aceita um único hook sem matcher por evento e módulo, e só segue o `$` por
// funções nomeadas. Os eventos partilhados por várias funcionalidades entram aqui, num só hook
// por evento, que encadeia os tratadores pela ordem fixa friday, painel, travão, auditoria:
// cada um chama o seguinte através do seu `next`.
export function registerObservers(on: On): void {
  on('tool.call', ($, e, next) => fridayToolCall($, e, e1 => brakeToolCall($, e1, next)))
  on('classic.Stop', ($, e, next) => fridayStop($, e, e1 => brakeStop($, e1, next)))
  on('turn.start', ($, e, next) => panelTurnStart($, e, e1 => brakeTurnStart($, e1, next)))
  on('turn.complete', ($, e, next) => panelTurnComplete($, e, e1 => brakeTurnComplete($, e1, next)))
  on('session.measure', ($, e, next) => panelMeasure($, e, e1 => brakeMeasure($, e1, next)))
  on('agent.spawn', ($, e, next) => panelAgentSpawn($, e, next))
  on('session.end', ($, e, next) => fridaySessionEnd($, e, next))
}

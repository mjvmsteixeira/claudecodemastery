import type { On } from 'claude-code'
import { fridaySessionEnd, fridayStop, fridayToolCall } from './friday.ts'
import { auditSessionEnd, auditToolCall } from './audit-trail.ts'
import { brakeMeasure, brakeStop, brakeStopCaught, brakeToolCall, brakeTurnComplete, brakeTurnStart } from './brake.ts'
import { panelAgentSpawn, panelMeasure, panelTurnComplete, panelTurnStart } from './panel.tsx'

// O validador aceita um único hook sem matcher por evento e módulo, e só segue o `$` por
// funções nomeadas. Os eventos partilhados por várias funcionalidades entram aqui, num só hook
// por evento, que encadeia os tratadores pela ordem fixa friday, painel, travão, auditoria:
// cada um chama o seguinte através do seu `next`. O register.tsx regista isto primeiro, para o
// despachante ser o hook mais exterior e a auditoria e o travão verem também as recusas e as
// respostas dos outros hooks do próprio prumo-guard.
export function registerObservers(on: On): void {
  on('tool.call', ($, e, next) => fridayToolCall($, e, e1 => brakeToolCall($, e1, e2 => auditToolCall($, e2, next))))
  // O Stop decide (o travão anula o re-prompt do ralph em pausa): se a cadeia falhar, o .catch
  // aplica o veto em vez de deixar decidir os hooks de baixo.
  on('classic.Stop', ($, e, next) => fridayStop($, e, e1 => brakeStop($, e1, next))).catch(($, e, next) => brakeStopCaught($, e, next))
  on('turn.start', ($, e, next) => panelTurnStart($, e, e1 => brakeTurnStart($, e1, next)))
  on('turn.complete', ($, e, next) => panelTurnComplete($, e, e1 => brakeTurnComplete($, e1, next)))
  on('session.measure', ($, e, next) => panelMeasure($, e, e1 => brakeMeasure($, e1, next)))
  on('agent.spawn', ($, e, next) => panelAgentSpawn($, e, next))
  on('session.end', ($, e, next) => fridaySessionEnd($, e, e1 => auditSessionEnd($, e1, next)))
}

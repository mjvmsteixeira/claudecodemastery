import type { On } from 'claude-code'
import { auditSessionEnd, auditToolCall } from './audit-trail.ts'
import { brakeMeasure, brakeToolCall, brakeTurnComplete, brakeTurnStart } from './brake.ts'
import { panelAgentSpawn, panelMeasure, panelTurnComplete, panelTurnStart } from './panel.tsx'

// O validador aceita um único hook sem matcher por evento e módulo, e só segue o `$` por
// funções nomeadas. Os eventos partilhados por várias funcionalidades entram aqui, num só hook
// por evento, que encadeia os tratadores pela ordem fixa painel, travão, auditoria:
// cada um chama o seguinte através do seu `next`. O register.tsx regista isto primeiro, para o
// despachante ser o hook mais exterior e a auditoria e o travão verem também as recusas e as
// respostas dos outros hooks do próprio prumo-guard.
export function registerObservers(on: On): void {
  on('tool.call', ($, e, next) => brakeToolCall($, e, e1 => auditToolCall($, e1, next)))
  on('turn.start', ($, e, next) => panelTurnStart($, e, e1 => brakeTurnStart($, e1, next)))
  on('turn.complete', ($, e, next) => panelTurnComplete($, e, e1 => brakeTurnComplete($, e1, next)))
  on('session.measure', ($, e, next) => panelMeasure($, e, e1 => brakeMeasure($, e1, next)))
  on('agent.spawn', ($, e, next) => panelAgentSpawn($, e, next))
  on('session.end', ($, e, next) => auditSessionEnd($, e, next))
}

import type { Register } from 'claude-code'
import { loadConfig } from './config.ts'

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const cfg = await loadConfig($)
    $.ui.status(`prumo-guard · orçamento ${cfg.brake.usdBudget} USD`)
    return next(e)
  })
}

import type { EngineInterface } from 'claude-code'
import { prumoHome } from './config.ts'

export type PrumoMode = 'prod' | 'dev' | 'lab'

async function exists($: EngineInterface, path: string): Promise<boolean> {
  try {
    await $.fs.stat(path)
    return true
  } catch {
    return false
  }
}

// Mesmas regras que prumo_mode (base/lib/prumo-common.sh): ambiente primeiro, depois ~/.prumo/mode,
// lab só com o marker, qualquer outro valor cai em prod.
export async function readMode($: EngineInterface): Promise<PrumoMode> {
  const home = await prumoHome($)
  let mode = (await $.env.get('PRUMO_OPERATING_MODE'))?.replace(/\s/g, '')
  if (!mode) {
    try {
      mode = (await $.fs.read(`${home}/mode`)).replace(/\s/g, '')
    } catch {
      mode = 'prod'
    }
  }
  if (mode === 'lab') return (await exists($, `${home}/lab-mode`)) ? 'lab' : 'prod'
  return mode === 'dev' ? 'dev' : 'prod'
}

export async function writeMode($: EngineInterface, mode: PrumoMode): Promise<void> {
  const home = await prumoHome($)
  await $.fs.write(`${home}/mode`, `${mode}\n`)
  if (mode === 'lab') await $.fs.write(`${home}/lab-mode`, 'ativado por /prumo-guard-mode\n')
  else await $.process.run(['rm', '-f', `${home}/lab-mode`])
}

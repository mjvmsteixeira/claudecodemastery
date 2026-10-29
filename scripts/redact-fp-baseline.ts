// Conta quantas linhas dos ficheiros versionados a redação de segredos tocaria.
// Exclui guard/tests/ e base/tests/: os fixtures de segredo são positivos de propósito. Serve de regressão para falsos positivos: se o total sobe, uma regra ficou mais larga.
// Uso: node scripts/redact-fp-baseline.ts [--list]   (imprime só o total sem --list)
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { redactText } from '../guard/hooks/redact-patterns.ts'

const opts = { pii: false, internalIps: false, extra: [] }
const files = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n').filter(f => f && !/^(?:guard|base)\/tests\//.test(f))
let total = 0
const lines: string[] = []
for (const f of files) {
  let text: string
  try { text = readFileSync(f, 'utf8') } catch { continue }
  text.split('\n').forEach((l, i) => {
    const n = redactText(l, opts).hits
    if (n > 0) { total += n; lines.push(`${f}:${i + 1}: ${l.slice(0, 160)}`) }
  })
}
if (process.argv.includes('--list')) console.log(lines.join('\n'))
console.log(`total ${total}`)

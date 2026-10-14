import { test, expect } from 'claude-code/testing'
import { parseGateDenial } from '../hooks/approval-parse.ts'

const ID = 'a'.repeat(64)

test('lê nível e id da mensagem do approval-gate', () => {
  const text = `PreToolUse:Bash hook error: [x]: [prumo-secops/approval-gate] Operação N2 detectada:\n  psql -c ...\n\napproval-id: ${ID}\n`
  expect(parseGateDenial(text)).toEqual({ id: ID, level: 'N2' })
})

test('sem approval-id devolve null', () => {
  expect(parseGateDenial('[prumo-secops/approval-gate] Operação N1 detectada:\n x')).toBe(null)
})

test('outro hook devolve null', () => {
  expect(parseGateDenial(`[prumo-base/self-guard] Bloqueado: x\napproval-id: ${ID}`)).toBe(null)
})

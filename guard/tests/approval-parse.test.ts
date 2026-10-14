import { test, expect } from 'claude-code/testing'
import { approvalIdOf, parseGateDenial, quoteCommand } from '../hooks/approval-parse.ts'

const ID = 'a'.repeat(64)

test('lê o nível do banner quando o texto traz o id esperado', () => {
  const text = `PreToolUse:Bash hook error: [x]: [prumo-secops/approval-gate] Operação N2 detectada:\n  psql -c ...\n\napproval-id: ${ID}\n`
  expect(parseGateDenial(text, ID)).toEqual({ id: ID, level: 'N2' })
})

test('sem approval-id devolve null', () => {
  expect(parseGateDenial('[prumo-secops/approval-gate] Operação N1 detectada:\n x', ID)).toBe(null)
})

test('outro hook devolve null', () => {
  expect(parseGateDenial(`[prumo-base/self-guard] Bloqueado: x\napproval-id: ${ID}`, ID)).toBe(null)
})

test('um id que não é o do comando devolve null, mesmo sendo o primeiro do texto', () => {
  const other = 'b'.repeat(64)
  const text = `[prumo-secops/approval-gate] Operação N1 detectada:\n  x approval-id: ${other}\n\napproval-id: ${ID}\n`
  expect(parseGateDenial(text, other.replace('b', 'c'))).toBe(null)
  expect(parseGateDenial(text, ID)).toEqual({ id: ID, level: 'N1' })
})

test('approvalIdOf normaliza como o gate: quebras finais saem, tabs e quebras viram espaço', async () => {
  // printf '%s' 'echo a b c' | shasum -a 256 — o gate chega a este texto a partir de "echo a\tb\nc\n\n".
  const want = '6b98580d3e2411234e985797fb11df725b252e483deee3508051d56cf1de236c'
  expect(await approvalIdOf('echo a\tb\nc\n\n')).toBe(want)
  expect(await approvalIdOf('echo a b c')).toBe(want)
  expect(await approvalIdOf('npm test')).toBe('328e123c63857fd8473bd4bd3581e655b08b7440d7f5d2c31cc375607582f539')
})

test('quoteCommand: uma linha, sem crases, no máximo 200 caracteres', () => {
  expect(quoteCommand('a`b\n\nc\td')).toBe("a'b c d")
  expect(quoteCommand('x'.repeat(300)).length).toBe(200)
})

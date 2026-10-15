import { test, expect } from 'claude-code/testing'
import { parseRulesFile } from '../hooks/rules.tsx'

const H = 'a'.repeat(64)
const LEVEL = { id: 'r-0123456789ab', kind: 'level', level: 'N1', createdAt: '2026-10-15T15:00:00.000Z' }
const COMMAND = { id: 'r-ba9876543210', kind: 'command', level: 'N1', commandId: H, command: 'git push -f', createdAt: '2026-10-15T15:01:00.000Z' }
const file = (rules: unknown[], project = '/p') => JSON.stringify({ project, rules })

test('parseRulesFile aceita regras level e command do projeto certo', () => {
  expect(parseRulesFile(file([LEVEL, COMMAND]), '/p')).toEqual([LEVEL, COMMAND])
  expect(parseRulesFile(file([]), '/p')).toEqual([])
})

test('parseRulesFile recusa o ficheiro inteiro quando algo não bate', () => {
  expect(parseRulesFile('{', '/p')).toBeNull()
  expect(parseRulesFile(file([LEVEL], '/outro'), '/p')).toBeNull()
  expect(parseRulesFile(file([{ ...LEVEL, level: 'N2' }]), '/p')).toBeNull()
  expect(parseRulesFile(file([{ ...COMMAND, commandId: 'abc' }]), '/p')).toBeNull()
  expect(parseRulesFile(file([{ ...LEVEL, id: 'x' }]), '/p')).toBeNull()
  expect(parseRulesFile(file([{ ...LEVEL, kind: 'path' }]), '/p')).toBeNull()
  expect(parseRulesFile(JSON.stringify({ project: '/p', rules: 'x' }), '/p')).toBeNull()
})

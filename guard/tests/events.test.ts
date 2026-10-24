import { test, expect } from 'claude-code/testing'
import { register } from '../hooks/register.tsx'

// Lista justificada de classic.* que o mod pode registar. No tier user (cache do marketplace) o
// guard integrado passa estes eventos adiante sem chamar o mod: um handler aqui é código morto
// que só gera avisos «was skipped». Para acrescentar um, escreve o motivo ao lado.
const CLASSIC_ALLOWED: string[] = []

test('o módulo não regista handlers classic.* fora da lista justificada', () => {
  const names: string[] = []
  const chain = { catch: () => chain }
  register(((name: string) => { names.push(name); return chain }) as never, {} as never)
  expect(names.length).toBeGreaterThan(0)
  expect(names.filter(n => n.startsWith('classic.') && !CLASSIC_ALLOWED.includes(n))).toEqual([])
})

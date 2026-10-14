import { test, expect } from 'claude-code/testing'
import { emptyRepeat, trackCall, trackEdit, trackTest } from '../hooks/repeat.ts'

test('mesma chamada com o mesmo resultado N vezes dispara', () => {
  let s = emptyRepeat()
  let trip: string | null = null
  for (let i = 0; i < 4; i++) ({ s, trip } = trackCall(s, 'Bash:ls', 'h1', 4))
  expect(trip).toContain('4 vezes')
})

test('resultado diferente reinicia a contagem', () => {
  let s = emptyRepeat()
  ;({ s } = trackCall(s, 'Bash:x', 'h1', 3))
  ;({ s } = trackCall(s, 'Bash:x', 'h2', 3))
  const { trip } = trackCall(s, 'Bash:x', 'h2', 3)
  expect(trip).toBe(null)
})

test('limite 0 desliga a deteção de chamadas repetidas', () => {
  let s = emptyRepeat()
  let trip: string | null = null
  for (let i = 0; i < 10; i++) ({ s, trip } = trackCall(s, 'Bash:ls', 'h1', 0))
  expect(trip).toBe(null)
})

test('mesmo teste a falhar com a mesma assinatura', () => {
  let s = emptyRepeat()
  let trip: string | null = null
  for (let i = 0; i < 4; i++) ({ s, trip } = trackTest(s, 2, 'sig', 4))
  expect(trip).toContain('falhou')
  ;({ s, trip } = trackTest(s, 0, '', 4))
  expect(s.failCount).toBe(0)
})

test('assinatura diferente reinicia a contagem de falhas', () => {
  let s = emptyRepeat()
  ;({ s } = trackTest(s, 1, 'a', 3))
  ;({ s } = trackTest(s, 1, 'a', 3))
  const r = trackTest(s, 1, 'b', 3)
  expect(r.s.failCount).toBe(1)
  expect(r.trip).toBe(null)
})

test('edições que se desfazem', () => {
  let s = emptyRepeat()
  let trip: string | null = null
  for (let i = 0; i < 3; i++) {
    ;({ s } = trackEdit(s, 'a.rb', 'x', 'y'))
    ;({ s, trip } = trackEdit(s, 'a.rb', 'y', 'x'))
  }
  expect(trip).toContain('desfizeram')
})

test('edições a ficheiros diferentes não se desfazem entre si', () => {
  let s = emptyRepeat()
  let trip: string | null = null
  for (let i = 0; i < 4; i++) {
    ;({ s } = trackEdit(s, 'a.rb', 'x', 'y'))
    ;({ s, trip } = trackEdit(s, 'b.rb', 'y', 'x'))
  }
  expect(trip).toBe(null)
})

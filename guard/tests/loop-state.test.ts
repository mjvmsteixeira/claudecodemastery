import { test, expect } from 'claude-code/testing'
import { parseRalphState } from '../hooks/loop-state.ts'

test('frontmatter completo', () => {
  const t = '---\nactive: true\niteration: 7\nmax_iterations: 20\ncompletion_promise: "DONE"\n---\nprompt'
  expect(parseRalphState(t)).toEqual({ iteration: 7, maxIterations: 20 })
})

test('frontmatter sem max_iterations', () => {
  expect(parseRalphState('---\niteration: 2\n---\nx')).toEqual({ iteration: 2, maxIterations: null })
})

test('sem frontmatter', () => {
  expect(parseRalphState('só texto')).toBe(null)
})

test('valores não numéricos', () => {
  expect(parseRalphState('---\niteration: abc\nmax_iterations: x\n---\n')).toEqual({ iteration: null, maxIterations: null })
})

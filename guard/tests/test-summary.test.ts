import { test, expect } from 'claude-code/testing'
import { failureSignature, isTestCommand, parseTestSummary, shortHash } from '../hooks/test-summary.ts'

test('reconhece comandos de teste', () => {
  for (const c of ['bundle exec rspec', 'bin/rails test', 'pytest -q', 'npx vitest run', 'npm test', 'go test ./...', 'cargo test', 'yarn jest']) {
    expect(isTestCommand(c)).toBe(true)
  }
  expect(isTestCommand('ls -la')).toBe(false)
})

test('rspec', () => {
  expect(parseTestSummary('Finished in 2.1 seconds\n43 examples, 2 failures')).toEqual({ passed: 41, failed: 2 })
})

test('pytest', () => {
  expect(parseTestSummary('==== 3 failed, 40 passed in 1.2s ====')).toEqual({ passed: 40, failed: 3 })
  expect(parseTestSummary('==== 40 passed in 1.2s ====')).toEqual({ passed: 40, failed: 0 })
})

test('jest/vitest', () => {
  expect(parseTestSummary('Tests:       2 failed, 41 passed, 43 total')).toEqual({ passed: 41, failed: 2 })
  expect(parseTestSummary(' Tests  41 passed | 2 failed (43)')).toEqual({ passed: 41, failed: 2 })
})

test('cargo e rails test', () => {
  expect(parseTestSummary('test result: FAILED. 41 passed; 2 failed; 0 ignored')).toEqual({ passed: 41, failed: 2 })
  expect(parseTestSummary('43 runs, 120 assertions, 2 failures, 0 errors, 0 skips')).toEqual({ passed: 41, failed: 2 })
})

test('go test', () => {
  expect(parseTestSummary('--- FAIL: TestX (0.00s)\nFAIL\tpkg/a\t0.01s\nok  \tpkg/b\t0.02s')).toEqual({ passed: 1, failed: 1 })
})

test('saída truncada: resumo na cauda', () => {
  const tail = '[output-filter] Truncated 900 earlier lines from 1400 total.\n...\n43 examples, 2 failures'
  expect(parseTestSummary(tail)).toEqual({ passed: 41, failed: 2 })
})

test('assinatura ignora tempos', () => {
  const a = failureSignature('rspec ./spec/a_spec.rb:88 # A falha\nFinished in 2.1 seconds')
  const b = failureSignature('rspec ./spec/a_spec.rb:88 # A falha\nFinished in 3.4 seconds')
  expect(a).toBe(b)
  expect(shortHash('abc')).toMatch(/^[0-9a-f]{8}$/)
})

import { test, expect } from 'claude-code/testing'
import { checkArgv, maskSecrets, parseSecretRef, shellQuote } from '../hooks/secret-exec.ts'

const ALLOW = ['psql', 'curl', 'gh']

test('recusa shells e interpretadores mesmo com caminho', () => {
  expect(checkArgv(['/bin/sh', '-c', 'x'], [...ALLOW, 'sh'])).toContain('interpretador')
  expect(checkArgv(['./python3', 'x.py'], ALLOW)).toContain('interpretador')
  expect(checkArgv(['env', 'X=1', 'psql'], ALLOW)).toContain('interpretador')
})

test('fora da allowlist', () => {
  expect(checkArgv(['rm', '-rf', '/'], ALLOW)).toContain('allowlist')
  expect(checkArgv(['psql', '-c', 'select 1'], ALLOW)).toBe(null)
  expect(checkArgv([], ALLOW)).toContain('vazio')
})

test('mascara valor cru, URL-encoded e com newline', () => {
  const s = { DB_PASSWORD: 'p@ss w0rd' }
  const out = maskSecrets('a=p@ss w0rd b=p%40ss%20w0rd c=p@ss w0rd\n', s)
  expect(out).toBe('a=[SEGREDO:DB_PASSWORD] b=[SEGREDO:DB_PASSWORD] c=[SEGREDO:DB_PASSWORD]\n')
})

test('valores curtos não são mascarados (evita destruir o output)', () => {
  expect(maskSecrets('abc abc', { X: 'abc' })).toBe('abc abc')
})

test('referências e quoting', () => {
  expect(parseSecretRef('secret/projects/x#db_password')).toEqual({ path: 'secret/projects/x', field: 'db_password' })
  expect(parseSecretRef('sem-campo')).toBe(null)
  expect(shellQuote(['psql', '-c', "select 'a'"])).toBe(`psql -c 'select '"'"'a'"'"''`)
})

import { test, expect } from 'claude-code/testing'
import { redactText, compileExtra, countPlaceholders } from '../hooks/redact-patterns.ts'

const ALL = { pii: true, internalIps: false, extra: [] }
const SECRETS_ONLY = { pii: false, internalIps: false, extra: [] }

test('segredos com forma conhecida', () => {
  const t = [
    'Authorization: Bearer abcdefghijklmnopqrstuvwxyz012345',
    'VAULT_TOKEN=hvs.CAESIJxAbCdEfGhIjKlMnOpQrStUv',
    'aws AKIAABCDEFGHIJKLMNOP',
    'gh ghp_' + 'a'.repeat(36),
    'jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl',
    'password=hunter2hunter2',
  ].join('\n')
  const r = redactText(t, SECRETS_ONLY)
  expect(r.text).toContain('Bearer [prumo:TOKEN]')
  expect(r.text).toContain('VAULT_TOKEN=[prumo:VAULT-TOKEN]')
  expect(r.text).toContain('[prumo:AWS-KEY]')
  expect(r.text).toContain('[prumo:GITHUB-TOKEN]')
  expect(r.text).toContain('[prumo:JWT]')
  expect(r.text).toContain('password=[prumo:SEGREDO]')
  expect(r.hits).toBe(6)
})

test('chave privada inteira', () => {
  const t = '-----BEGIN OPENSSH PRIVATE KEY-----\nabc\ndef\n-----END OPENSSH PRIVATE KEY-----'
  expect(redactText(t, SECRETS_ONLY).text).toBe('[prumo:CHAVE-PRIVADA]')
})

test('NIF válido redigido, número de 9 dígitos inválido mantido', () => {
  expect(redactText('nif 123456789', ALL).text).toBe('nif [prumo:NIF]')
  expect(redactText('ficheiro com 123456788 bytes', ALL).text).toBe('ficheiro com 123456788 bytes')
})

test('email, telefone com indicativo e IBAN com mod 97', () => {
  const r = redactText('a@b.pt · +351 912 345 678 · PT50 0002 0123 1234 5678 9015 4', ALL)
  expect(r.text).toBe('[prumo:EMAIL] · [prumo:TELEFONE] · [prumo:IBAN]')
})

test('telefone sem indicativo nem grupos não é redigido', () => {
  expect(redactText('id 912345678', ALL).text).toBe('id 912345678')
})

test('PII desligado mantém email e NIF', () => {
  expect(redactText('a@b.pt 123456789', SECRETS_ONLY).text).toBe('a@b.pt 123456789')
})

test('IPs internos só com opt-in', () => {
  expect(redactText('host 192.168.11.6', ALL).text).toBe('host 192.168.11.6')
  expect(redactText('host 192.168.11.6', { ...ALL, internalIps: true }).text).toBe('host [prumo:IP-INTERNO]')
})

test('padrões da organização', () => {
  const { patterns, errors } = compileExtra({ patterns: [{ name: 'HOST-INTERNO', regex: '\\b[a-z0-9-]+\\.exemplo\\.internal\\b', flags: 'gi' }, { name: 'MAU', regex: '(' }] })
  expect(errors.length).toBe(1)
  expect(redactText('ssh app1.exemplo.internal', { ...ALL, extra: patterns }).text).toBe('ssh [prumo:HOST-INTERNO]')
})

test('contagem de marcadores', () => {
  expect(countPlaceholders('x [prumo:EMAIL] y [prumo:NIF]')).toBe(2)
})

test('segredos em JSON, com prefixo de variável e em URLs', () => {
  const casos: [string, string][] = [
    ['{"password": "hunter2hunter2"}', '{"password": "[prumo:SEGREDO]"}'],
    ['"token":"abcdefghij"', '"token":"[prumo:SEGREDO]"'],
    ['DB_PASSWORD=hunter2hunter2', 'DB_PASSWORD=[prumo:SEGREDO]'],
    ['GITHUB_TOKEN=abcdefghijkl', 'GITHUB_TOKEN=[prumo:SEGREDO]'],
    ['AWS_SECRET_ACCESS_KEY=abcdefghijkl', 'AWS_SECRET_ACCESS_KEY=[prumo:SEGREDO]'],
    ['postgres://admin:s3cretpass@db.local/x', 'postgres://admin:[prumo:SEGREDO]@db.local/x'],
  ]
  for (const [entrada, saida] of casos) {
    const r = redactText(entrada, SECRETS_ONLY)
    expect(r.text).toBe(saida)
    expect(r.hits).toBe(1)
  }
})

test('URL sem credenciais e valores já redigidos não são tocados', () => {
  expect(redactText('https://exemplo.pt:8080/x', SECRETS_ONLY).hits).toBe(0)
  expect(redactText('token: [prumo:SEGREDO]', SECRETS_ONLY).hits).toBe(0)
})

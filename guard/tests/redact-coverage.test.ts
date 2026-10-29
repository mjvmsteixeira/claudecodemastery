import { test, expect } from 'claude-code/testing'
import { redactText } from '../hooks/redact-patterns.ts'
import { positives, leaks, SECRETS_ONLY, V, W, STRIPE } from './coverage-cases.ts'

for (const p of positives) {
  test(`cobertura: caso ${p.n} é redigido`, () => {
    const r = redactText(p.text, SECRETS_ONLY)
    for (const v of p.values) expect(leaks(r.text, v)).toBe(false)
    for (const c of p.cls) expect(r.classes).toContain(c)
  })
}

test('cobertura: caso 9, aspas mantidas e conteúdo trocado', () => {
  const r = redactText('password="' + 'correct horse' + ' battery"', SECRETS_ONLY)
  expect(r.text).toBe('password="[prumo:SEGREDO]"')
})

test('cobertura: caso 17, as duas linhas ficam redigidas', () => {
  const r = redactText('DB_PASS=' + W + '\nSTRIPE_KEY=' + STRIPE, SECRETS_ONLY)
  expect(r.text.split('\n').every(l => l.includes('[prumo:'))).toBe(true)
  expect(r.hits).toBe(2)
})

test('cobertura: caso 7, o valor inteiro sai incluindo o ponto e vírgula', () => {
  expect(redactText('password=' + 'Ab;cd' + '#1234', SECRETS_ONLY).text).toBe('password=[prumo:SEGREDO]')
})

test('cobertura: valor termina em ponto e vírgula seguido de espaço', () => {
  const r = redactText('password=abc123; ls', SECRETS_ONLY)
  expect(r.text).toBe('password=[prumo:SEGREDO]; ls')
})

test('cobertura: sort_key minúsculo não é segredo', () => {
  expect(redactText('sort_key=created_at', SECRETS_ONLY).hits).toBe(0)
})

const negatives: Array<[string, string]> = [
  ['N1', '// run_with_secret: ' + 'desligado até a pessoa o ligar'],
  ['N2', "'run_with_secret: " + "pedido de aprovação aberto ao humano'"],
  ['N3', 'API_KEY = ' + 'process.env.API_KEY'],
  ['N4a', 'password=' + '$DB_PASSWORD'],
  ['N4b', 'token: ' + '${TOKEN}'],
  ['N5a', 'password = ' + "os.environ['DB_PASSWORD']"],
  ['N5b', 'token = ' + "ENV['GH_TOKEN']"],
  ['N6a', 'password: ' + 'string'],
  ['N6b', 'password: ' + 'str'],
  ['N6c', 'token: ' + 'null'],
  ['N6d', 'secret=' + 'true'],
  ['N6e', 'password: ' + 'required'],
  ['N7a', 'the password is required'],
  ['N7b', 'password reset sent'],
  ['N7c', 'reset the token now'],
  ['N8a', 'compass: northeast'],
  ['N8b', 'bypass=enabled'],
  ['N9a', 'task-' + 'a'.repeat(30)],
  ['N9b', 'risk-assessment-for-the-quarterly-report'],
  ['N10a', 'password: ' + '{{ vault_password }}'],
  ['N10b', 'password=' + '<PASSWORD>'],
  ['N12a', 'passport was 12345 ok'],
  ['N12b', 'secretary is Maria1'],
  ['N12c', 'passage is 12345'],
]

for (const [id, text] of negatives) {
  test(`cobertura: ${id} fica intacto`, () => {
    const r = redactText(text, SECRETS_ONLY)
    expect(r.hits).toBe(0)
    expect(r.text).toBe(text)
  })
}

test('cobertura: texto já redigido não é redigido outra vez', () => {
  const t = 'password=' + '[prumo' + ':SEGREDO]'
  expect(redactText(t, SECRETS_ONLY).hits).toBe(0)
})

test('cobertura: N11, PIN de 4 dígitos não é coberto de propósito', () => {
  expect(redactText('o PIN é 4821', SECRETS_ONLY).hits).toBe(0)
})

const falsePositives: Array<[string, string]> = [
  ['P1a', 'the password is required.'],
  ['P1b', 'the password was null.'],
  ['P1c', 'the token expires.'],
  ['P1d', 'Run `vault token renew`'],
  ['P1e', 'token (optional)'],
  ['P1f', 'Token requirement**: policy'],
  ['P1g', 'pass rate was 99.5%'],
  ['P1h', 'vault write -field=token auth/approle/login'],
  ['P2', 'pass "all tests passed"'],
  ['P3a', 'secret 2>/dev/null'],
  ['P3b', 'jq -r .root_token ~/vault/vault-init.json'],
  ['P3c', '/bin/pwd (realpath)'],
  ['P3d', 'secret/ já é kv-v2.'],
]

for (const [id, text] of falsePositives) {
  test(`cobertura: ${id} pontuação, aspas e shell ficam intactos`, () => {
    const r = redactText(text, SECRETS_ONLY)
    expect(r.hits).toBe(0)
    expect(r.text).toBe(text)
  })
}

test('cobertura: ponto final depois do valor fica fora do marcador', () => {
  expect(redactText('a senha do servidor é ' + V + '.', SECRETS_ONLY).text).toBe('a senha do servidor é [prumo:SEGREDO].')
})

test('cobertura: valor entre aspas sem espaços depois de palavra solta é redigido', () => {
  expect(redactText('a senha é "' + V + '"', SECRETS_ONLY).text).toBe('a senha é "[prumo:SEGREDO]"')
})

test('cobertura: PRIMARY_KEY= é redigido (limite conhecido, ver README)', () => {
  expect(redactText('PRIMARY_KEY=id_col', SECRETS_ONLY).hits).toBe(1)
})

const reposicao: Array<[string, string, string]> = [
  ['R1a', 'password "' + 'correct horse battery"', 'horse'],
  ['R1b', 'a senha é "' + 'correct horse battery"', 'horse'],
  ['R1c', 'pass "' + 'Xk9 mPq2"', 'mPq2'],
  ['R1d', 'pass "' + 'Xk9mPq2vL$x"', 'mPq2'],
  ['R2a', 'senha: abc!' + 'def', 'abc!'],
  ['R2b', 'senha: Correct.' + 'Horse.Battery', 'Horse'],
  ['R2c', 'the password is Correct.' + 'Horse', 'Horse'],
  ['R3', 'password=' + '99%abc', '99%a'],
  ['R4', 'API_KEY=' + '\\$abc123def', 'abc1'],
]

for (const [id, text, value] of reposicao) {
  test(`cobertura: ${id} voltou a ser redigido`, () => {
    const r = redactText(text, SECRETS_ONLY)
    expect(r.hits).toBe(1)
    expect(r.text.includes(value)).toBe(false)
  })
}

const reposicaoVar: Array<[string, string, string]> = [
  ['R5a', 'password "' + 'Xk9mPq2vL$xy"', 'mPq2'],
  ['R5b', 'pass "' + 'Xk9mPq2vL$xy"', 'mPq2'],
  ['R5c', 'a senha é "' + 'Xk9mPq$Ab1"', 'mPq'],
  ['R5d', 'the password is "' + 'Xk9mPq$xyz"', 'mPq'],
]

for (const [id, text, value] of reposicaoVar) {
  test(`cobertura: ${id} $ dentro do valor não é variável`, () => {
    const r = redactText(text, SECRETS_ONLY)
    expect(r.hits).toBe(1)
    expect(r.text.includes(value)).toBe(false)
  })
}

const aspasDaPalavra: Array<[string, string]> = [
  ['Q1', 'echo "token" "next phrase here"'],
  ['Q2', 'run "secret" "my value here"'],
  ['Q3', 'jq ".token" "file name.json"'],
  ['Q4', 'check "password" "must be long enough"'],
]

for (const [id, text] of aspasDaPalavra) {
  test(`cobertura: ${id} aspa de fecho da palavra-chave não abre a frase seguinte`, () => {
    const r = redactText(text, SECRETS_ONLY)
    expect(r.hits).toBe(0)
    expect(r.text).toBe(text)
  })
}

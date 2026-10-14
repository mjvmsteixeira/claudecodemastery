import { test, expect } from 'claude-code/testing'
import { checkArgv, checkEnvName, maskSecrets, parseSecretRef, protectedArg, protectedDir, secretCallLine, secretCallText, shellQuote } from '../hooks/secret-exec.ts'

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

test('recusa caminhos mesmo com nome na allowlist', () => {
  expect(checkArgv(['/tmp/evil/curl', 'https://x'], ALLOW)).toContain('caminho')
  expect(checkArgv(['./psql'], ALLOW)).toContain('caminho')
})

test('mascara segredo com newline final pelo valor aparado', () => {
  expect(maskSecrets('tok=abcd1234 fim', { T: 'abcd1234\n' })).toBe('tok=[SEGREDO:T] fim')
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

const ALL = ['psql', 'mysql', 'curl', 'gh', 'git', 'docker', 'kubectl']

test('opções e subcomandos que correm código são recusados; os usos comuns passam', () => {
  for (const argv of [
    ['git', '-c', 'core.pager=sh', 'log'],
    ['git', '--config-env=core.pager=X', 'log'],
    ['git', '--exec-path=/tmp/x', 'status'],
    ['git', '-C', '/p', 'config', 'alias.x', '!sh'],
    ['git', 'clone', '-u', 'sh -c x', 'repo'],
    ['git', 'clone', '--template=/tmp/t', 'repo'],
    ['git', 'fetch', '--upload-pack=sh', 'origin'],
    ['git', 'clone', 'ext::sh -c x', 'd'],
    ['git', 'grep', '-Ovim', 'x'],
    ['curl', '-sK', 'cfg', 'https://x'],
    ['curl', '--config=cfg', 'https://x'],
    ['docker', 'exec', 'c', 'sh'],
    ['docker', '--config', '/tmp/d', 'ps'],
    ['kubectl', '--kubeconfig=/tmp/k', 'get', 'pods'],
    ['kubectl', 'debug', 'node/x'],
    ['gh', 'alias', 'set', 'x', '!sh'],
    ['gh', 'extension', 'install', 'x/y'],
    ['psql', '-c', '\\! printf %s "$PGPASSWORD" | base64'],
    ['psql', '-c', 'select 1 \\g |sh'],
    ['psql', '-f', 'x.sql'],
    ['mysql', '-e', 'system sh'],
    ['mysql', '--pager=sh'],
  ]) expect(checkArgv(argv, ALL, true)).toContain('correr código')
  for (const argv of [
    ['git', 'switch', '-c', 'nova'],
    ['git', '-C', '/p', 'push', '-u', 'origin', 'main'],
    ['curl', '-sSL', '-H', 'Key: v', 'https://x'],
    ['curl', '-HKey: v', 'https://x'],
    ['docker', 'login', '-u', 'x', '--password-stdin'],
    ['kubectl', 'get', 'pods', '-n', 'x'],
    ['gh', 'api', 'repos/x/alias'],
    ['psql', '-c', 'select 1'],
    ['mysql', '-e', 'select 1'],
  ]) expect(checkArgv(argv, ALL, true)).toBe(null)
})

test('git, docker, kubectl e mongosh recusam mesmo listados, salvo allowRisky', () => {
  for (const argv of [['git', 'status'], ['docker', 'ps'], ['kubectl', 'get', 'pods'], ['mongosh', 'db']]) {
    const bin = argv[0] as string
    expect(checkArgv(argv, [bin])).toContain('allowRisky')
    expect(checkArgv(argv, [bin], true)).toBe(null)
  }
  expect(checkArgv(['redis-cli', 'ping'], ['redis-cli'])).toBe(null)
})

test('psql e mysql: qualquer \\! num argumento e system no início de uma instrução recusam', () => {
  for (const argv of [
    ['mysql', '-e', 'do 1\\!id'],
    ['mysql', '--execute=select 1\\!id'],
    ['psql', '-c', 'select 1\\!id'],
    ['psql', '-c', 'system id'],
    ['psql', '-c', 'select 1;\nSYSTEM id'],
    ['mysql', '-e', 'select 1; system id'],
  ]) expect(checkArgv(argv, ['psql', 'mysql'])).toContain('correr código')
  expect(checkArgv(['psql', '-c', 'select system from t'], ['psql'])).toBe(null)
  expect(checkArgv(['mysql', '-e', 'select systemd from t'], ['mysql'])).toBe(null)
})

test('texto canónico da chamada: referências por nome, argv e cwd tal como vêm', () => {
  expect(secretCallText(['psql', '-c', 'a'], { B: 'p#b', A: 'p#a' }, '/p')).toBe(
    'run_with_secret\n{"argv":["psql","-c","a"],"secrets":[["A","p#a"],["B","p#b"]],"cwd":"/p"}',
  )
})

test('linha para a pessoa: argv inteiro em JSON, sem quebras nem caracteres invisíveis', () => {
  const line = secretCallLine(['psql', '-c', 'a\nb\u202ec\u200bd\u0085'], { B: 'p#b', A: 'p#a' }, '/p')
  expect(line).toBe('run_with_secret ["psql","-c","a\\nb\\u202ec\\u200bd\\u0085"] · segredos {"A":"p#a","B":"p#b"} · cwd "/p"')
})

test('nomes de variável que mudam o carregamento ou o comportamento são recusados', () => {
  for (const n of ['PATH', 'IFS', 'BASH_ENV', 'ENV', 'LD_PRELOAD', 'DYLD_INSERT_LIBRARIES', 'GIT_SSH_COMMAND', 'NODE_OPTIONS', 'PRUMO_APPROVE', 'PAGER']) {
    expect(checkEnvName(n)).toContain(n)
  }
  expect(checkEnvName('lower')).toContain('inválido')
  expect(checkEnvName('PGPASSWORD')).toBe(null)
  expect(checkEnvName('GH_TOKEN')).toBe(null)
})

test('curl: clusters de opções curtas que acabam em K recusam; os que levam valor antes do K passam', () => {
  for (const argv of [
    ['curl', '-aK', 'cfg', 'https://x'],
    ['curl', '-BK', 'cfg', 'https://x'],
    ['curl', '-MK', 'cfg', 'https://x'],
    ['curl', '-hK', 'cfg', 'https://x'],
    ['curl', '-VK', 'cfg', 'https://x'],
    ['curl', '-K', 'cfg', 'https://x'],
  ]) expect(checkArgv(argv, ['curl'])).toContain('correr código')
  // -H leva valor: o `K` colado é o valor do cabeçalho, não a flag --config.
  expect(checkArgv(['curl', '-HKey: v', 'https://x'], ['curl'])).toBe(null)
  expect(checkArgv(['curl', '-sSL', 'https://x'], ['curl'])).toBe(null)
})

test('psql: -f em cluster (-qf, -Atf, -1f) e \\getenv recusam; usos comuns passam', () => {
  for (const argv of [
    ['psql', '-qf', 'x.sql'],
    ['psql', '-Atf', 'x.sql'],
    ['psql', '-1f', 'x.sql'],
    ['psql', '-c', '\\getenv v PGPASSWORD'],
    ['psql', '-c', 'select 1 \\getenv x HOME'],
  ]) expect(checkArgv(argv, ['psql'])).toContain('correr código')
  expect(checkArgv(['psql', '-c', 'select 1'], ['psql'])).toBe(null)
  expect(checkArgv(['psql', '-At', '-c', 'select 1'], ['psql'])).toBe(null)
})

test('mysql: system/source depois de -e ou --execute= recusam; select systemd passa', () => {
  for (const argv of [
    ['mysql', '--execute=system id'],
    ['mysql', '-esystem id'],
    ['mysql', '--execute=source /tmp/f'],
    ['mysql', '-esource /tmp/f'],
  ]) expect(checkArgv(argv, ['mysql'])).toContain('correr código')
  expect(checkArgv(['mysql', '-e', 'select 1'], ['mysql'])).toBe(null)
  expect(checkArgv(['mysql', '--execute=select systemd'], ['mysql'])).toBe(null)
})

test('gh: --jq/-q que lê o ambiente recusa; acesso a campo e jq normal passam', () => {
  for (const argv of [
    ['gh', 'api', 'user', '--jq', 'env.GH_TOKEN'],
    ['gh', 'api', 'user', '--jq=env.GH_TOKEN|@base64'],
    ['gh', 'api', 'user', '-q', 'env'],
    ['gh', 'api', 'user', '-qenv.GH_TOKEN'],
    ['gh', 'api', 'user', '--jq', '.foo | env'],
  ]) expect(checkArgv(argv, ['gh'])).toContain('correr código')
  expect(checkArgv(['gh', 'api', 'user', '--jq', '.environment.name'], ['gh'])).toBe(null)
  expect(checkArgv(['gh', 'api', 'user', '--jq', '.login'], ['gh'])).toBe(null)
  expect(checkArgv(['gh', 'api', 'repos/x/alias'], ['gh'])).toBe(null)
})

test('mascara o segredo também codificado em hex e base64 (defesa em profundidade)', () => {
  const raw = 'p4ssw0rd-secreto'
  const hex = [...new TextEncoder().encode(raw)].map(b => b.toString(16).padStart(2, '0')).join('')
  let bin = ''
  for (const b of new TextEncoder().encode(raw)) bin += String.fromCharCode(b)
  const b64 = btoa(bin)
  expect(maskSecrets(`cru=${raw} hex=${hex} b64=${b64}`, { T: raw })).toBe('cru=[SEGREDO:T] hex=[SEGREDO:T] b64=[SEGREDO:T]')
})

test('caminhos protegidos em argumentos e em cwd', () => {
  expect(protectedArg(['-o', '/u/.prumo/mode'], '/u/.prumo')).toBe('/u/.prumo/mode')
  expect(protectedArg(['--output=/U/.Prumo/approvals/x'], '/u/.prumo')).toBe('--output=/U/.Prumo/approvals/x')
  expect(protectedArg(['-o', '/opt/prumo/guard.json'], '/opt/prumo')).toBe('/opt/prumo/guard.json')
  expect(protectedArg(['-o', 'proj/.claude/settings.json'], '/u/.prumo')).toBe('proj/.claude/settings.json')
  expect(protectedArg(['-o', 'out.txt', 'https://x/.prumo-docs'], '/u/.prumo')).toBe(null)
  expect(protectedDir('/u/.prumo/approvals', '/u/.prumo')).toBe(true)
  expect(protectedDir('/p/.claude', '/u/.prumo')).toBe(true)
  expect(protectedDir('/p/src', '/u/.prumo')).toBe(false)
})

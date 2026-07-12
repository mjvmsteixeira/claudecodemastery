---
name: security-scan
description: Auditoria de segurança do projecto actual — dependências vulneráveis (multi-stack, cruzadas com CVE), OWASP Top 10 no código, secrets/credenciais expostas, Infrastructure as Code e configuração de runtime. Linguagem-agnóstico. Dispara em "audita a segurança", "security scan", "vulnerabilidades", "scan de secrets", "OWASP", "verifica injection/XSS/auth", "este projecto é seguro?". Read-only por defeito; auto-fix só com --auto-fix-safe ou confirmação. NÃO confundir com auditoria de infra operacional (skill infra-audit) nem de qualidade de código (skill code-quality).
---

# security-scan

Auditoria de segurança linguagem-agnóstica. Read-only por defeito.

## Trigger

- `/security-scan [flags]`
- `"audita a segurança disto"`, `"security scan"`, `"vulnerabilidades"`, `"scan de secrets"`, `"OWASP"`

## Parâmetros (passados pelo command ou inferidos do pedido)

- `scope` — um ou mais de `dependencies|code|secrets|config|iac`. Default: todos.
- `min-severity` — `critical|high|medium`. Default: reportar tudo.
- `auto-fix-safe` — aplicar fixes não-disruptivos automaticamente. Default: off.
- `ci` — modo CI. Ver `${CLAUDE_PLUGIN_ROOT}/shared/ci-mode.md`. Default: off.
- `export-report` — gravar relatório em ficheiro. Ver `${CLAUDE_PLUGIN_ROOT}/shared/report-format.md`.

## Metodologia

### 0. Deteção de tooling

Os scanners externos são opcionais. No início, detectar quais existem e reportá-lo
ao utilizador (uma linha), degradando graciosamente para análise do modelo quando
faltarem — nunca assumir que um scanner está instalado, nunca crashar por ausência.

```bash
echo "── Tooling de segurança detectado ──"
for t in semgrep gitleaks trufflehog trivy grype hadolint pip-audit npm; do
  command -v "$t" >/dev/null 2>&1 && echo "  ✓ $t" || echo "  ✗ $t (ausente — fallback)"
done
```

Regra: cada scanner ausente degrada a sua dimensão para **análise do modelo** (grep/leitura
com os patterns das references), marcando os findings dessa dimensão com `engine:"grep"`/
`engine:"llm"`. Um scan sem nenhum scanner externo é válido (fallback total) mas o relatório
deve dizê-lo explicitamente ("scanners ausentes — análise estática do modelo").

### 1. Detectar stack

Procurar manifests para identificar linguagens e ferramentas. Indicadores:
`requirements.txt`/`pyproject.toml`/`Pipfile` (Python), `package.json`/lockfiles (Node),
`go.mod` (Go), `Cargo.toml` (Rust), `pom.xml`/`build.gradle` (Java), `Gemfile` (Ruby),
`composer.json` (PHP), `*.csproj`/`*.sln` (.NET), `mix.exs` (Elixir), `Dockerfile*`/
`docker-compose*.yml` (Docker), `*.tf` (Terraform), `*.yaml` com `apiVersion:`+`kind:`
(Kubernetes), `playbooks/`/`roles/`/`inventories/` (Ansible), `.github/workflows/`
(GitHub Actions), `.gitlab-ci.yml` (GitLab CI).

**Auto-load de references por sinal** (carregar em adição às de scope, sem novos scopes CLI):

| Sinal detectado | Reference a carregar |
|-----------------|----------------------|
| `.github/workflows/*.yml`, `.gitlab-ci.yml` | `references/cicd-supply-chain.md` |
| `Dockerfile*`, `docker-compose*.yml` | `references/container-image.md` |
| Rotas REST / controllers / schema GraphQL / OpenAPI | `references/owasp-api-top10.md` |
| SDK `anthropic`/`openai`/`langchain`, prompts, agentes | `references/owasp-llm-top10.md` |

Estas references são conteúdo de análise, não scopes — carregam-se automaticamente
quando o sinal existe, e degradam para análise do modelo se a ferramenta associada faltar.

### 2. Carregar regras do projecto

Se existir `rules/audit/security.md` na raiz do projecto auditado, ler e incorporar nas
verificações (paths de Vault esperados, convenções de naming de secrets, IPs/domínios
trusted, excepções autorizadas, compliance específico). Se não existir, prosseguir só
com o baseline universal.

### 3. Carregar references conforme o scope e correr os scans

Para cada scope activo, carregar a reference e aplicar as verificações:

| Scope | Reference | Foco |
|-------|-----------|------|
| `dependencies` | `references/dependency-scanners.md` | Scanners multi-stack, dependências fantasma, classificação de risco |
| `code` | `references/owasp-top10.md` | A01–A10, patterns por linguagem |
| `secrets` | `references/secrets-patterns.md` | Tabela de providers, gitleaks/trufflehog, git history |
| `iac` | `references/iac-checks.md` | Terraform/Ansible/K8s/Compose |
| `config` | `references/runtime-config.md` | Headers, TLS, rate limiting, .gitignore |

**Motor de `code` (preferir AST a grep):**

Se `command -v semgrep`, é o motor primário — cobre A01–A10 com regras AST (menos
falsos-positivos que grep):

```bash
semgrep --config p/owasp-top-ten --config p/secrets --sarif --quiet . > /tmp/semgrep.sarif 2>/dev/null
```

Converter cada resultado SARIF num finding: `file`/linha do `physicalLocation`, `rule`
do `ruleId`, `severity` mapeada (`ERROR→high|critical`, `WARNING→medium`, `INFO→low`),
`cwe` das `tags`/`properties` da regra (Semgrep expõe CWE nos metadados), `engine:"semgrep"`.

**Sem semgrep → fallback:** aplicar os patterns de grep de `references/owasp-top10.md`,
marcando `engine:"grep"`. O fallback grep é mais ruidoso — a verificação do Passo 3c é
ainda mais importante nesse caso.

Para o scope `code`, lançar agentes em paralelo (um por grupo de subsecções OWASP) se o
codebase for grande.

**Motor de `secrets` (preferir scanners verificados a regex):**

Se `command -v gitleaks` ou `command -v trufflehog`, são o motor primário — reduzem
falsos-positivos porque validam a credencial:

```bash
# gitleaks — filesystem + git history, redacted
command -v gitleaks >/dev/null 2>&1 && \
  gitleaks detect --no-banner --redact --report-format json --report-path /tmp/gitleaks.json 2>/dev/null

# trufflehog — só o que confirma como vivo (--only-verified)
command -v trufflehog >/dev/null 2>&1 && \
  trufflehog filesystem . --only-verified --json 2>/dev/null > /tmp/trufflehog.json
```

Converter cada resultado num finding com `engine:"gitleaks"` ou `engine:"trufflehog"`,
`severity:"critical"` (credencial confirmada é sempre critical), `cwe:"CWE-798"`
(Use of Hard-coded Credentials). Um secret `--only-verified` já vem `verified:true`.

**Sem nenhum scanner → fallback:** aplicar a tabela de regexes de
`references/secrets-patterns.md` (`engine:"grep"`), que é mais ruidosa — cada match precisa
de confirmação manual (é um placeholder? um exemplo? uma chave revogada?) antes de reportar
como critical. **Secrets nunca são auto-corrigidos** — rotação + remoção do git history é
sempre acção humana.

### 3b. Verificação ao vivo (opcional, via `chrome-live`)

Se a skill `chrome-live` estiver disponível **e** houver uma tab relevante aberta,
complementar o scan estático com sinais de **runtime** que só existem na página viva.
Aditivo — sem Chrome/tab, ignorar e seguir estático.

```bash
GUARD="$(find ~/.claude/plugins/cache -path '*/prumo-devkit/*/skills/chrome-live/scripts/cdp-guard.sh' -print -quit 2>/dev/null)"
[ -n "$GUARD" ] && bash "$GUARD" list
```

Receitas em `chrome-live/references/verbs.md`: cookies de sessão visíveis a JS (falta
`HttpOnly`), handlers inline (CSP fraca), CSP via meta-tag, password fields sem
`autocomplete` seguro. **Read-only** (`html`, `net`) corre directo; sinais que exigem
`eval`/`evalraw` (ex.: `document.cookie`, captura de headers via `Network.*`) são verbos
**active** — gateados por modo e bloqueados em contexto de audit sem `PRUMO_AUDIT_APPLY=1`.
Marcar cada finding ao vivo como tal (URL/tab) para distinguir dos estáticos. Nunca tratar
a verificação ao vivo como substituto do scan estático.

### 3c. Verificação adversarial de findings

Antes de reportar, cada candidato passa por verificação — um pattern-match não é uma
vulnerabilidade. Para cada finding, tentar **refutá-lo**:

1. **Reachability:** o input do atacante chega ao sink? Traçar a origem do dado
   (parâmetro de request, ficheiro, env) até ao sink (query, `eval`, comando). Se o
   valor é constante/interno controlado pelo código, não é injeção real.
2. **Exclusão de contexto não-produtivo:** o finding está em `test/`, `spec/`,
   `__tests__/`, `fixtures/`, `examples/`, `vendor/`, `node_modules/`, ou num ficheiro
   `*.example`? Então é ruído — dropar ou marcar `severity:low` com nota.
3. **Já mitigado:** existe sanitização/validação/prepared-statement/escaping no caminho
   antes do sink? Existe um decorator de auth acima do endpoint? Se sim, dropar.

Resultado por finding: `verified:true` (sobrevive à refutação) ou `verified:false`
(não sobrevive). **Regra dura:** nenhum finding `verified:false` é apresentado como
CRITICAL ou HIGH — ou é despromovido a `low` com a razão, ou é dropado. `confidence`
∈ `high|medium|low` reflecte a força da verificação.

**Codebases grandes:** verificar em paralelo — um agente por lote de findings, cada um
instruído a refutar (não a confirmar). Só sobrevive o que resistir. Isto espelha a
verificação adversarial dos hooks de segurança.

### 4. Scoring

Calcular o score por dimensão e total conforme `${CLAUDE_PLUGIN_ROOT}/shared/scoring.md`.
As dimensões são os scopes avaliados.

### 5. Relatório

- Modo interactivo: estrutura de `${CLAUDE_PLUGIN_ROOT}/shared/report-format.md`.
- Modo `ci`: comportamento de `${CLAUDE_PLUGIN_ROOT}/shared/ci-mode.md` — JSON sempre,
  SARIF adicional (audit de código), exit code conforme severidade, sem auto-fix.
- Com `export-report`: gravar em `docs/security/SECURITY_REPORT_<YYYY-MM-DD>.md`.

Cada finding no relatório mostra o `cwe` (quando conhecido) e o estado de verificação
(`verified`/`confidence`) — findings `verified:false` aparecem sempre despromovidos, nunca
como CRITICAL/HIGH.

### 5b. Estado (loop de feedback — Fase 04)

Depois de produzir os findings, dar-lhes estado entre corridas (novo/recorrente/
corrigido) e suprimir falsos-positivos já aceites:

1. Emitir os findings desta corrida como **JSONL** para um ficheiro temporário — uma
   linha por finding, com os campos obrigatórios: `audit` (=`"security-scan"`), `file`,
   `rule` (id estável do tipo de vuln, ex.: `A03-injection`), `severity`
   (`critical|high|medium|low`), `title`. Opcionais: `cwe` (ex.: `"CWE-89"` — usar
   sempre que conhecido, melhora dedup e SARIF), `symbol` (função/classe), `detail`,
   `verified` (`true|false` do Passo 3c), `confidence` (`high|medium|low`),
   `engine` (`semgrep|grep|gitleaks|trufflehog|hadolint|trivy|actionlint|llm`). Exemplo:
   `{"audit":"security-scan","file":"src/auth.py","rule":"A03-injection","cwe":"CWE-89","symbol":"get_user","severity":"high","title":"SQLi via f-string","verified":true,"confidence":"high","engine":"semgrep"}`

2. Localizar e correr o reconciliador (store committed no repo auditado, `.prumo-audit/`):
   ```bash
   RECON="$(find ~/.claude/plugins/cache -path '*/prumo-devkit/*/lib/audit-reconcile.sh' -print -quit 2>/dev/null)"
   [ -n "$RECON" ] && bash "$RECON" --audit security-scan --findings <ficheiro.jsonl>
   ```

3. O **output reconciliado** do script (novos/recorrentes/corrigidos + métricas) é o
   que se apresenta ao utilizador e o que `export-report` grava — em vez de uma foto
   crua. Os findings marcados `accepted` no store são suprimidos automaticamente.

4. Para aceitar um falso-positivo (suprime-o dali em diante e documenta-o em
   `rules/audit/security.md`):
   ```bash
   ACCEPT="$(find ~/.claude/plugins/cache -path '*/prumo-devkit/*/lib/audit-accept.sh' -print -quit 2>/dev/null)"
   [ -n "$ACCEPT" ] && bash "$ACCEPT" <fp> "<razão>"
   ```
   O `<fp>` de cada finding aparece no relatório reconciliado.

### 6. Correcções

**Antes de aplicar qualquer correcção, executar os gates de
`${CLAUDE_PLUGIN_ROOT}/shared/safe-apply.md`** (modo, sample-detection,
acções destrutivas).

- `auto-fix-safe`: aplicar só fixes **não-disruptivos e não-destrutivos** — updates de
  patch sem breaking changes e adição de headers de segurança em falta. Mostrar o diff
  de cada correcção. **Excluído de auto-fix-safe** (mesmo sendo "pequeno"): editar
  `.gitignore`, `.gitattributes`, `.env*`, `filter_parameter_logging.rb`, e qualquer
  ficheiro coberto pelo Gate 3 — estes passam pelo prompt de confirmação individual.
- Sem `auto-fix-safe` e fora de `ci`: depois do relatório, perguntar
  "Queres que corrija os CRITICAL e HIGH? [s/n/seleccionar]". Resposta default: `n`.
- Em `ci`: nunca corrigir.

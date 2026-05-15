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

### 1. Detectar stack

Procurar manifests para identificar linguagens e ferramentas. Indicadores:
`requirements.txt`/`pyproject.toml`/`Pipfile` (Python), `package.json`/lockfiles (Node),
`go.mod` (Go), `Cargo.toml` (Rust), `pom.xml`/`build.gradle` (Java), `Gemfile` (Ruby),
`composer.json` (PHP), `*.csproj`/`*.sln` (.NET), `mix.exs` (Elixir), `Dockerfile*`/
`docker-compose*.yml` (Docker), `*.tf` (Terraform), `*.yaml` com `apiVersion:`+`kind:`
(Kubernetes), `playbooks/`/`roles/`/`inventories/` (Ansible), `.github/workflows/`
(GitHub Actions), `.gitlab-ci.yml` (GitLab CI).

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

Para o scope `code`, lançar agentes em paralelo (um por grupo de subsecções OWASP) se o
codebase for grande.

### 4. Scoring

Calcular o score por dimensão e total conforme `${CLAUDE_PLUGIN_ROOT}/shared/scoring.md`.
As dimensões são os scopes avaliados.

### 5. Relatório

- Modo interactivo: estrutura de `${CLAUDE_PLUGIN_ROOT}/shared/report-format.md`.
- Modo `ci`: comportamento de `${CLAUDE_PLUGIN_ROOT}/shared/ci-mode.md` — JSON sempre,
  SARIF adicional (audit de código), exit code conforme severidade, sem auto-fix.
- Com `export-report`: gravar em `docs/security/SECURITY_REPORT_<YYYY-MM-DD>.md`.

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

# Changelog — wire-devkit

Formato: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versionamento: [SemVer](https://semver.org/spec/v2.0.0.html).

## [0.2.0] — 2026-05-15

### Added

- **`smoke.sh`** — sanity check read-only chamado pelo `/wire-smoke` do `wire-base`. Testa: plugin.json válido, ficheiros `shared/*` presentes (scoring, ci-mode, report-format), 8 skills + 7 commands + 1 agent na árvore esperada, wire-base detectado na cache (para /ngrok-expose), ollama/qwen3-coder e ngrok CLI presentes. Funciona em cache (post-install) e source tree (dev/CI).

## [0.1.0] — 2026-05-15

Versão inicial do plugin no marketplace `jump2new`.

### Added

- **6 audit skills** no modelo B+C (brain `SKILL.md` + references com progressive disclosure + thin command wrapper):
  - `full-audit` — orquestrador paralelo (corre as outras 4-5 audits, consolida, scoring unificado, auto-fix fora de `--ci`). Integração MemPalace opcional.
  - `security-scan` — OWASP Top 10, secrets/credentials, IaC, dependências vulneráveis multi-stack. Absorve o antigo `/dep-audit`.
  - `infra-audit` — Docker, Kubernetes, systemd, reverse proxy, Ansible, Terraform, CI/CD.
  - `ux-audit` — WCAG 2.1 AA, 10 heurísticas de Nielsen, responsividade, design system.
  - `code-quality` — dead code, arquitectura, complexidade ciclomática, cobertura de testes (expandido ao nível dos audits maduros).
  - `performance-audit` — bundle size, N+1 queries, I/O bloqueante, queries lentas, resource leaks (N+1 movido do code-quality original).
- **Agent `local-reviewer`** + skill-trigger fina — segunda opinião de code review via Ollama qwen3-coder local, read-only, sem cloud.
- **Command + skill `ngrok-expose`** — túnel ngrok HTTPS público com authtoken obtido do Vault via `wire-base` (`find` dinâmico do `lib/vault-env.sh`).
- **`shared/scoring.md`**, **`shared/ci-mode.md`**, **`shared/report-format.md`** — convenções cross-cutting (rubrica X.X/10 unificada, JSON/SARIF + exit codes em `--ci`, formato canónico de relatório). Referenciadas por todas as skills via `${CLAUDE_PLUGIN_ROOT}/shared/`.
- **Hook SessionStart** `check-recommends.sh` — avisa se `wire-base` em falta.

### Depends on

- **`wire-base@jump2new`** (recomendado) — `/ngrok-expose` precisa do `lib/vault-env.sh`. Os 5 audits e o `local-reviewer` funcionam standalone.

### Optional runtime

- **Ollama local** (qwen3-coder) — para o `local-reviewer`. Degrada para análise própria se indisponível.
- **MemPalace** (`.mempalace/` no projecto auditado) — `/full-audit` enriquece com histórico de issues se disponível.

### Notes

- O modo `--ci` produz JSON sempre, SARIF adicional nos audits de código (`security-scan`, `code-quality`), exit code `0`/`1`/`2` conforme severidade máxima encontrada — para usar em pre-commit hooks e pipelines.
- Versão inicial após reset do histórico git ("clean slate") do repositório do marketplace.

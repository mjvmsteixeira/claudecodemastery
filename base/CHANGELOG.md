# Changelog — wire-base

Formato: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versionamento: [SemVer](https://semver.org/spec/v2.0.0.html).

## [0.2.0] — 2026-05-15

Iteração focada em **upgrade story**, **smoke tests** e **vault policy templating**. Sem breaking changes.

### Added

- **Command + skill `wire-upgrade`** — verifica versões instaladas (cache local) vs. remotas (raw GitHub do marketplace). Comparação semver via `sort -V`. Para cada plugin com update disponível, emite a linha `/plugin install <plugin>@jump2new` para colar. Read-only — não auto-instala.
- **Command + skill `wire-vault-policy`** — gera template HCL parametrizado para uma nova policy Vault. Flags: `--kv-read`, `--kv-write`, `--kv-full`, `--transit-key`, `--ssh-role`, `--dest`. Escreve em `$VAULT_HOME/policies/<nome>-policy.hcl` para revisão; não aplica.
- **Command + skill `wire-smoke`** — orquestra `smoke.sh` shippados em cada plugin. Argumento `base|secops|devkit|all`. Exit `0`/`1`/`2` (ok/fail/degraded-warns). Read-only. ~2s por plugin.
- **`smoke.sh`** em cada plugin (wire-base, wire-secops, wire-devkit) — sanity check de install correctness. Funciona tanto a partir da cache (post-install) como da source tree (dev/CI) via fallback.

### Changed

- **`/wire-onboard`** · Passo 3 reescrito para sugerir `/wire-smoke` em vez de smoke tests manuais. Smokes operacionais (`/vault-list`, `/wire-stack-doctor`, `/full-audit --ci`) ficam como sugestões secundárias.
- **`scripts/validate.sh`** · nova secção `smoke.sh (per plugin)` — valida bit de execução e shebang em cada `smoke.sh`.

## [0.1.0] — 2026-05-15

Versão inicial do plugin no marketplace `jump2new`.

### Added

- **Skill `mempalace-doctor`** — diagnóstico de saúde do tool MemPalace (drawers SQLite, HNSW, KG, idade de backups, jobs launchd/systemd).
- **Skill `claude-deep-audit`** — auditoria profunda de uma instalação Claude Code via 10 sub-agentes paralelos (CLAUDE.md, settings, skills, hooks, MCPs, memory, plugins, x-refs).
- **Skill `vault-toolkit`** — trigger fino que roteia intenções "segredos / Vault" para os 5 commands `/vault-*`.
- **Command + skill `wire-onboard`** — setup wizard do ecossistema: detecta plugins instalados (base/secops/devkit), emite linhas `/plugin install` para gaps e sugere smoke tests por plugin. Idempotente.
- **Command + skill `wire-doctor`** — meta-doctor read-only. Orquestra `mempalace-doctor`, `claude-deep-audit`, `/vault-audit` e (se `wire-secops` instalado) `/wire-vault-doctor` em paralelo; consolida num relatório único com status por componente e top acções priorizadas.
- **Command + skill `wire-mode`** — interface slash para o `WIRE_OPERATING_MODE`. Lê/escreve `~/.wire/mode` e gere o marker `~/.wire/lab-mode` (obrigatório para activar `lab`). Suporta `prod | dev | lab | status`.
- **Command + skill `wire-context-pack`** — cheat-sheet curado por scope (`ir | release | audit | all`) com skills, commands, agents, paths Vault, AppRoles, logs e one-liners relevantes. Não corre live data — é mapa. Marca itens de plugins não instalados com `(plugin em falta)`.
- **Commands** `/vault-list`, `/vault-set`, `/vault-audit`, `/vault-backup`, `/vault-integrate`.
- **Hook SessionStart** `vault-session-check.sh` — auto-unseal opcional do Vault local (lê `~/vault/vault-init.json`) e injecta nota de contexto.
- **Lib partilhada** `lib/vault-env.sh` — `V()` (native/docker abstraction), `vault_ready`, `vault_unseal`, `vault_container_up`, `vault_arrange_up`. Source-able por outros plugins.
- **Lib partilhada** `lib/wire-common.sh` — `wire_mode`, `wire_scope`, `wire_log`, `wire_backup`, `wire_fail_or_warn`, `wire_require`, `wire_is_prod/dev/lab`. Estabelece `WIRE_OPERATING_MODE` (prod/dev/lab) que plugins downstream respeitam.

### Notes

- O `vault-toolkit` **detecta** instalações existentes em `~/vault/` e adapta-se — nunca migra estrutura.
- Versão inicial após reset do histórico git ("clean slate") do repositório do marketplace.

# Changelog — wire-base

Formato: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versionamento: [SemVer](https://semver.org/spec/v2.0.0.html).

## [0.1.0] — 2026-05-15

Versão inicial do plugin no marketplace `jump2new`.

### Added

- **Skill `mempalace-doctor`** — diagnóstico de saúde do tool MemPalace (drawers SQLite, HNSW, KG, idade de backups, jobs launchd/systemd).
- **Skill `claude-deep-audit`** — auditoria profunda de uma instalação Claude Code via 10 sub-agentes paralelos (CLAUDE.md, settings, skills, hooks, MCPs, memory, plugins, x-refs).
- **Skill `vault-toolkit`** — trigger fino que roteia intenções "segredos / Vault" para os 5 commands `/vault-*`.
- **Command + skill `wire-onboard`** — setup wizard do ecossistema: detecta plugins instalados (base/secops/devkit), emite linhas `/plugin install` para gaps e sugere smoke tests por plugin. Idempotente.
- **Commands** `/vault-list`, `/vault-set`, `/vault-audit`, `/vault-backup`, `/vault-integrate`.
- **Hook SessionStart** `vault-session-check.sh` — auto-unseal opcional do Vault local (lê `~/vault/vault-init.json`) e injecta nota de contexto.
- **Lib partilhada** `lib/vault-env.sh` — `V()` (native/docker abstraction), `vault_ready`, `vault_unseal`, `vault_container_up`, `vault_arrange_up`. Source-able por outros plugins.
- **Lib partilhada** `lib/wire-common.sh` — `wire_mode`, `wire_scope`, `wire_log`, `wire_backup`, `wire_fail_or_warn`, `wire_require`, `wire_is_prod/dev/lab`. Estabelece `WIRE_OPERATING_MODE` (prod/dev/lab) que plugins downstream respeitam.

### Notes

- O `vault-toolkit` **detecta** instalações existentes em `~/vault/` e adapta-se — nunca migra estrutura.
- Versão inicial após reset do histórico git ("clean slate") do repositório do marketplace.

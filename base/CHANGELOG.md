# Changelog — prumo-base

Formato: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versionamento: [SemVer](https://semver.org/spec/v2.0.0.html).

## v0.5.0 — 2026-07-06

**BREAKING — rebranding wire → prumo.** O plugin passa a chamar-se `prumo-base` no marketplace `prumo`.

- Renomeados: comandos `/wire-*` → `/prumo-*`, skills, `lib/wire-common.sh` → `lib/prumo-common.sh`, funções `wire_*` → `prumo_*`, env vars `WIRE_*` → `PRUMO_*`, estado `~/.wire/` → `~/.prumo/`
- Bridge de migração: na primeira execução, `~/.wire/mode` (e `lab-mode`) é copiado para `~/.prumo/` automaticamente
- Owner passa a mjvmst · mjvmst@gmail.com; licença "Proprietary - uso interno"
- Upgrade: `/plugin uninstall wire-base@jump2new` seguido de `/plugin install prumo-base@prumo`

## v0.4.0 — 2026-05-26

### Adicionado

- **`/wire-style` (command + skill)** — activa/remove um estilo de output conciso e directo, injectando um bloco versionado e delimitado por marcadores (`<!-- wire-style BEGIN vN -->` / `<!-- wire-style END -->`) num `CLAUDE.md`. Inspirado no [talk-normal](https://github.com/hexiecs/talk-normal) (MIT), mas no canal nativo do Claude Code em vez de `AGENTS.md`. `/wire-style` (status) · `/wire-style on [--user]` · `/wire-style off [--user]`. Scope **projecto** por default (`./CLAUDE.md`); `--user` para `~/.claude/CLAUDE.md`. Idempotente (substitui versão antiga em vez de duplicar), uninstall cirúrgico (só remove entre marcadores), backup automático em `~/.wire/backups/` antes de qualquer escrita via `wire_backup`. Não é hook nem reescrita runtime — injecção de config; não respeita `WIRE_OPERATING_MODE`.
- `base/smoke.sh`: assert do novo command.

## v0.3.0 — 2026-05-19

### ⚠ Upgrade · OBRIGATÓRIO desinstalar a versão antiga antes de instalar v0.3.0

Claude Code não actualiza plugins in-place de forma fiável; cache da versão antiga pode coexistir com a nova e provocar comportamento inconsistente (commands antigos chamados, hook antigo activo). Faz **sempre**:

```
/plugin uninstall wire-base@jump2new
/plugin install wire-base@jump2new
```

Depois recarrega a sessão (nova janela ou Ctrl-D + abrir) para os hooks novos entrarem em vigor.

Verifica com `/plugin list` que aparece `wire-base · 0.3.0 · user` (e que **não** há entrada duplicada).

### Adicionado

- **`/wire-vault-bootstrap`** — provisiona infra Vault genérica (audit device em `/vault/audit/audit.log`, kv-v2 em `secret/`, approle auth, transit engine, ssh engine). Idempotente. Padrão `--plan` (default) / `--apply`. Valida policy='root' antes de qualquer escrita (defesa em profundidade contra allowlist do hook secops). Refuse-and-redirect para `/wire-vault-kv-migrate` se detectar kv-v1 com dados.

- **`/wire-vault-kv-migrate`** — migra `secret/` de kv-v1 para kv-v2. Destrutivo, fluxo em 3 etapas exclusivas: `--plan` (walker recursivo, conta paths+keys, não escreve), `--backup` (exporta para `~/vault/backups/kv-v1-<ts>.json` em JSONL com chmod 600, valida JSON), `--apply` (exige backup <24h, faz disable→re-enable v2→re-import, gate por env-var `WIRE_VAULT_MIGRATE_CONFIRM=migrate-now`).

- `base/smoke.sh`: asserts dos 2 novos commands.

### Fonte

Plano: `docs/superpowers/plans/2026-05-19-wire-vault-bootstraps/`.
Resolve findings #1, #2 e parte de #4 do `/wire-vault-doctor`.

## [0.2.1] — 2026-05-15

### Added

- **`hooks/pre-tool-audit-guard.sh`** — PreToolUse hook que dá defense-in-depth ao `wire-devkit`. Activa-se quando `~/.wire/audit-active` existe ou `WIRE_AUDIT_ACTIVE=1` está definida (skill marca o início da Fase 4 com apply); bloqueia tools `Bash|Write|Edit|MultiEdit|NotebookEdit` se o tool input é destrutivo (`rm` fora de `/tmp`, `git rm`, SQL `DROP/ALTER/TRUNCATE/DELETE`, Edit/Write a `.gitignore`/`.env*`/`config/initializers/`/`spec/`/`test/`/`.github/workflows`/`filter_parameter_logging.rb`/`backtrace_silencers.rb`) a menos que `WIRE_AUDIT_APPLY=1` esteja exportada (skill aprovou explicitamente após gates). Em prod fail-closed (exit 2), em dev warn-only via `wire_fail_or_warn`. Registado em `hooks.json` com matcher conjunto. Silencioso fora de contexto de audit — não interfere com qualquer outro uso de Claude Code.

### Notes

- Este hook torna efectiva a política `shared/safe-apply.md` do `wire-devkit` mesmo se o agente decidir ignorar a metodologia da skill — a defesa é dupla: contractual (skill) + enforcement (hook).
- Sem `wire-devkit` instalado o hook é no-op (marker file e env nunca aparecem).

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

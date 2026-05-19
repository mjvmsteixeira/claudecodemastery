# Changelog — wire-secops

Formato: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versionamento: [SemVer](https://semver.org/spec/v2.0.0.html).

## v0.3.0 — 2026-05-19

### ⚠ Upgrade · OBRIGATÓRIO desinstalar a versão antiga antes de instalar v0.3.0

O hook `pre-tool-vault-ttl.sh` ganhou patterns novos na allowlist. Se a cache do v0.2.x ficar lado-a-lado da v0.3.0, o hook antigo pode bloquear comandos que a v0.3.0 já allowlistou — comportamento inconsistente.

```
/plugin uninstall wire-secops@jump2new
/plugin install wire-secops@jump2new
```

Recarrega a sessão Claude Code para o hook novo entrar em vigor. `/plugin list` deve mostrar `wire-secops · 0.3.0 · user` (uma entrada apenas).

### Adicionado

- **`/wire-secops-bootstrap`** — provisiona conteúdo Wire-specific no Vault assumindo infra base já provisionada. Inclui: 7 policies wire-* via split do `vault-policies.hcl` shipado, 7 AppRoles com TTLs hardcoded (espelham comentários do HCL), `transit/keys/forensics`, `ssh/config/ca`, `ssh/roles/wire-srv-role` + `ssh/roles/wire-ir-role`. Popula macOS Keychain + `~/vault/approle-credentials.json` (chmod 600) por cada AppRole. Idempotente, `--plan` (default) / `--apply`. Marca rotações de secret-id como `⟳` no plano para confirmação explícita.

### Alterado

- `hooks/pre-tool-vault-ttl.sh`: adicionados 3 patterns à `ALLOWLIST_PATTERNS` (`wire-vault-bootstrap`, `wire-secops-bootstrap`, `wire-vault-kv-migrate`) para resolver o chicken-and-egg de bootstrap (precisa de root pre-AppRole). Defesa em profundidade: cada comando valida policy='root' internamente; allowlist sozinha não autoriza nada destrutivo.

- `smoke.sh`: asserts do novo command + presença dos 3 patterns no hook.

### Adicionado (validate.sh)

- Nova secção 7c em `scripts/validate.sh` que verifica a presença dos 3 patterns na allowlist do hook.

### Fonte

Plano: `docs/superpowers/plans/2026-05-19-wire-vault-bootstraps/`.
Resolve findings #3 e parte de #4 do `/wire-vault-doctor`.

## [0.2.0] — 2026-05-15

### Added

- **`smoke.sh`** — sanity check read-only chamado pelo `/wire-smoke` do `wire-base`. Testa: plugin.json válido, `_lib.sh` expõe `wire_fail_or_warn` (real ou stub), wire-base detectado na cache, hooks executáveis, allowlist do `pre-tool-vault-ttl.sh` passa um `ls` sem token, `CLAUDE.md` presente, ollama/qwen3-coder disponíveis. Funciona em cache (post-install) e source tree (dev/CI).

## [0.1.0] — 2026-05-15

Versão inicial do plugin no marketplace `jump2new`.

### Added

- **6 agents** `wire-*-01`: `wire-monitor-01` (Wazuh+Fortigate+Zabbix), `wire-ir-saas-01` (IR multi-tenant), `wire-tenant-01` (isolamento), `wire-srv-saas-01` (servidores Rails nativos), `wire-deploy-01` (release gate Capistrano), `wire-compliance-01` (NIS2 + RGPD).
- **6 skills** `wire-*`: `wire-tenant-isolation`, `wire-saas-monitoring` (correlação Wazuh↔Fortigate↔Zabbix), `wire-ir-multitenant`, `wire-release-safety`, `wire-compliance-provider`, `wire-cliente-dossier`.
- **9 commands** `/wire-*`:
  - Operação: `/wire-saas-health`, `/wire-tenant-audit`, `/wire-incident-spread`, `/wire-release-gate`, `/wire-cliente-dossier`, `/wire-compliance-snapshot`.
  - Diagnóstico: `/wire-stack-doctor`, `/wire-vault-doctor`, `/wire-ollama-doctor`.
- **Hook chain**:
  - SessionStart: `check-recommends.sh` — avisa se `wire-base` em falta.
  - PreToolUse Bash: `vault-ttl` (allowlist + TTL ≥ 60s), `pii-redact` (NIF/email/IBAN/CC/IP), `approval-gate` (N1/N2/N3), `second-opinion` (Ollama qwen3-coder local).
  - PreToolUse Write|Edit: `pii-redact`.
  - PostToolUse: `cef-wazuh` (emissão CEF → Wazuh SIEM).
  - Stop: `vault-revoke` (revoga token AppRole).
- **`vault-policies.hcl`** — policies HCL para AppRoles `wire-{monitor,ir,tenant,srv,deploy,compliance,cowork-reporting}` e SSH roles `wire-{srv,ir}-role`.
- **`hooks/_lib.sh`** — shim que carrega `wire-common.sh` do `wire-base` (via find no plugin cache) ou define stubs de fallback prod-fail-closed.

### Depends on

- **`wire-base@jump2new`** (recomendado). Os hooks usam `wire_log`/`wire_mode`/`wire_fail_or_warn` da `wire-common.sh` para respeitarem `WIRE_OPERATING_MODE` (prod=block, dev=warn, lab=silent). Sem o base, os hooks correm com stubs de fallback (prod-fail-closed).

### Notes

- O hook `pre-tool-vault-ttl.sh` mantém o padrão "fail-open para diagnóstico, fail-closed para ops privilegiadas" — allowlist explícita para doctors, health checks e ops sobre ficheiros locais.
- Versão inicial após reset do histórico git ("clean slate") do repositório do marketplace.

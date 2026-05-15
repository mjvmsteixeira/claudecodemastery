# Changelog — wire-secops

Formato: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versionamento: [SemVer](https://semver.org/spec/v2.0.0.html).

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

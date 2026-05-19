# Changelog — wire-secops

Formato: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versionamento: [SemVer](https://semver.org/spec/v2.0.0.html).

## [0.4.0] - 2026-05-19 ("Honest")

### ⚠ Upgrade · OBRIGATÓRIO uninstall + reinstall

v0.4.0 corrige **três hooks que estavam funcionalmente partidos em v0.3.x** (timeouts ignorados, approval-gate broken stdin, pii-redact no-op). **Cache antiga lado-a-lado da nova provoca comportamento inconsistente.** Faz sempre:

```
/plugin uninstall wire-secops@jump2new
/plugin install wire-secops@jump2new
```

Recarrega a sessão Claude Code para os hooks novos entrarem em vigor.

### ⚠ Behavior change · hooks deixam de ser bypassed

Em v0.3.x, alguns workflows podiam estar a depender de operações destrutivas passarem silenciosamente (hooks broken). Em v0.4.0:

- `pre-tool-approval-gate.sh` bloqueia ops destrutivas até **`WIRE_APPROVE=N1/N2/N3`** ser exportada
- `pre-tool-pii-redact.sh` bloqueia tool calls com PII detectado (NIF, IBAN PT, CC PT, email, telefone PT 9 dígitos)
- `/wire-vault-doctor` exige `VAULT_ADDR` explícita (sem fallback silencioso para localhost)
- Hooks usam `${WIRE_LOG_DIR:-$HOME/.wire/log}` em vez de `/var/log/` root-owned

Se tinhas workflows que dependiam de bypass, agora precisam de autorização explícita. Vê secção "Variáveis de ambiente do plugin" em `CLAUDE.md`.

### Adicionado

- **20 templates `references/*.md`** em todas as 6 skills (progressive disclosure funcional):
  - `wire-ir-multitenant/references/`: severity-matrix, timeline-template, distribuicao-classificacao
  - `wire-compliance-provider/references/`: mapping-nis2, mapping-iso27001, anexoII-template, dpia-template, caiq-pre-filled
  - `wire-saas-monitoring/references/`: wazuh-rules, wazuh-fortigate-pairs, zabbix-canonical-templates, runbook-correlacao
  - `wire-tenant-isolation/references/`: template-cliente, queries-evidencia, painel-template
  - `wire-release-safety/references/`: canary-plan-template, rollback-template, changelog-template
  - `wire-cliente-dossier/references/`: dossier-template, sla-calculation
- **Convenção `WIRE_*` env vars** documentada em `CLAUDE.md` ("Variáveis de ambiente do plugin")
- **`/wire-vault-doctor`** fail-fast quando `VAULT_ADDR` não exportada (mensagem pedagógica com prod e dev endpoints)
- **`smoke.sh`** cobertura expandida: hooks.json schema, vault-policies.hcl policies count, negative allowlist test, references count per skill
- **Skills · bloco "Pré-requisitos"** em 4 skills explicita Vault AppRole + env vars + cross-links a `references/*.md`

### Corrigido

- **Hook timeout schema**: `timeout_ms` → `timeout` em segundos em todas as 7 entradas de `hooks.json` (Claude Code schema)
- **`pre-tool-approval-gate.sh`** reescrito — env var `WIRE_APPROVE=N1/N2/N3` (substitui `read` interactivo broken). Aceita combinações de flags (`-rfv`, `-fr`), trailing args (`cap production deploy --branch X`), SQL comments (`DROP/**/TABLE`), `git push -f`, payloads multi-line, `--force-with-lease`
- **`pre-tool-pii-redact.sh`** reescrito — fail-closed-on-detected-PII com regex calibradas (NIF, IBAN PT 25 chars, CC PT, email, **telefone PT 9 dígitos** — corrigido de 8). Skip binary content portable (BSD grep compatible)
- **`pre-tool-second-opinion.sh`** — `OLLAMA_HOST` e `OLLAMA_MODEL` env vars (consistente com doctor), JSON construído via `jq --arg` (sem injection), verdict regex aceita preamble LLM-comum
- **`pre-tool-vault-ttl.sh`** — `rm` allowlist tightened, exclui `$HOME/<x>` excepto `$HOME/.wire/`
- **`post-tool-cef-wazuh.sh`** — log path `${WIRE_LOG_DIR:-$HOME/.wire/log}/cef.log` (em vez de `/var/log/` root-owned); `shasum -a 256` em vez de `sha256sum` (macOS-compat); namespace `WIRE_WAZUH_HOST`; graceful fallback se LOG_DIR unwritable
- **`post-tool-vault-revoke.sh`** — source de `VAULT_*` env via `find ... | sort -V` (em vez de glob lexicográfico); Linux-only `shred` guarded
- **`/wire-vault-doctor`** — temp files via `mktemp` (não `/tmp/*.json` fixos); `wire-secops-login` dead refs substituídos por instruções concretas de AppRole login (Keychain → `vault write auth/approle/login`)
- **`/wire-ollama-doctor`** — `wire-secops-login` ref substituída; default `OLLAMA_MODEL=qwen3-coder:30b`
- **`/wire-stack-doctor`** — env vars críticas (`WIRE_WAZUH_HOST`, `FORTIGATE_HOST`, `ZABBIX_URL`) com fail-fast `: "${X:?msg}"`; GitHub URL agora parseado de `marketplace.json` em vez de hardcoded
- **`/wire-secops-bootstrap`** — TLS fail-fast (HTTPS sem CA cert é hard-fail, não silent fallback)
- **`vault-policies.hcl`** — comment "Seis AppRoles" → "Sete AppRoles (6 + Cowork external)"; justificações inline para `sys/audit-hash/*` (wire-ir) e `sys/policies/acl/*` (wire-tenant)
- **`CLAUDE.md`** — commands section actualizada para 10 commands (inclui `/wire-secops-bootstrap`); AppRoles table marca Cowork como external; backends list expandida com `secret/data/db/schemas/*` e `sys/policies/acl/*`
- **`README.md`** — nova tabela "Commands (resumo)" com 10 entries; links `/wire-vault-bootstrap` annotados como `(wire-base)`
- **Skills curl inline** — 4 skills (`wire-saas-monitoring`, `wire-ir-multitenant`, `wire-tenant-isolation`, `wire-cliente-dossier`) com bloco "Pré-requisitos" + exemplo curl directo com auth Vault (sem wrappers fantasma)
- **Agents** — `wire-monitor-01` perde `WebFetch` (read-only enforcement explícito); `wire-tenant-01` ganha capability "metadata fetch para dossiers"; hardcoded paths substituídos por env vars (`WIRE_FORENSICS_DIR`, `WIRE_EPHEMERAL_KEY_DIR`, `WIRE_RAILS_DEPLOY_BASE`)
- **Cosign clarification** — `wire-deploy-01.md` explicita que cosign aplica-se a containers (Vault HA, Wazuh); apps Rails Capistrano usam checksum equivalente (CTRL-W-R-008b a definir na Wire SaaS)
- **Typo**: "deligar" → "desligar" em `wire-release-safety/SKILL.md`

### Removido

- `WebFetch` tool grant de `wire-monitor-01` (não usado; remoção de scope desnecessário)

### Fonte

- Plano: `docs/superpowers/plans/2026-05-19-wire-secops-v0.4/`
- Spec: `docs/superpowers/specs/2026-05-19-wire-secops-v0.4-honest-design.md`
- Audit base: 2 subagents paralelos sobre `secops/` (9 Critical + 12 Important findings); code reviewer encontrou +5 bugs de bypass durante implementação, todos resolvidos

---

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

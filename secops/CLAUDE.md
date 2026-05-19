# Wire · SecOps AI

Plataforma SaaS multi-tenant para 170+ autarquias. Servidores nativos (VMs) com Ruby on Rails em várias versões. Vault broker. Operação 24x7. Zero secrets em ficheiros.

## Topologia
- **Code** (CLI): operacional. 6 subagentes especializados. Hooks fazem cumprir N1/N2/N3.
- **Cowork** (`ai-rep-01`): documental, confinado a `/shared/reports/`. Nunca toca em Vault privilegiado.
- **Vault HA Raft (3 nós)**: AppRoles, SSH CA, transit. Audit → Wazuh.
- **Wazuh**: SIEM mestre. Recebe CEF/syslog de Fortigate, logs lograge de Rails, audit Vault, OTel.
- **Fortigate**: perímetro (anti-DDoS, IPS, WAF). Syslog para Wazuh.
- **Zabbix**: monitorização activa (agentes, equipamentos, triggers, templates).
- **OpenTelemetry**: traces/metrics dos serviços wire* Rails.

## Vault

Este projecto usa HashiCorp Vault como **broker central de credenciais**. Toda a operação privilegiada passa pelo Vault — nunca por ficheiros locais, nunca por `.env`, nunca por chaves estáticas em disco.

**Endpoint:**     `https://vault.wire.internal:8200` (produção) · `http://127.0.0.1:8200` (dev)
**Auth:**         AppRole (`auth/approle/role/wire-<subagent>`)
**Token TTL:**    15-30 min consoante subagent (ver `vault-policies.hcl`)
**Audit:**        toda a operação Vault → Wazuh SIEM (socket file audit device)

### Backends em uso

- `secret/data/observability/*` — credenciais Wazuh, Zabbix, Prometheus, OTel
- `secret/data/srv/inventory/*` — inventário Ansible de servidores Rails
- `secret/data/srv/winrm/*` — credenciais WinRM (serviços Windows auxiliares)
- `secret/data/cicd/*` — credenciais GitLab/GitHub, cosign, SBOM
- `secret/data/tenants/metadata/*` — metadados de tenants (sem payload)
- `secret/data/compliance/*` — evidência regulatória
- `secret/data/ir/*` — case files de Incident Response
- `secret/data/db/schemas/*` — schemas e metadados para validation de RLS (acesso: wire-tenant)
- `sys/policies/acl/*` — read-only para audit cross-policy (acesso: wire-tenant)
- `transit/encrypt/forensics` · `transit/decrypt/forensics` — cifra de evidência IR
- `ssh/sign/wire-srv-role` — certificados SSH efémeros (TTL=15m) para servidores
- `ssh/sign/wire-ir-role` — certificados SSH efémeros para IR

### AppRoles activos

| AppRole | Subagent | TTL | Max TTL |
|---------|----------|-----|---------|
| `wire-monitor` | `wire-monitor-01` | 30m | 1h |
| `wire-ir` | `wire-ir-saas-01` | 15m | 1h |
| `wire-tenant` | `wire-tenant-01` | 15m | 30m |
| `wire-srv` | `wire-srv-saas-01` | 15m | 30m |
| `wire-deploy` | `wire-deploy-01` | 15m | 30m |
| `wire-compliance` | `wire-compliance-01` | 30m | 1h |
| `wire-cowork-reporting` | Cowork `ai-rep-01` *(externo — sem subagent neste plugin)* | 60m | 2h |

Policies HCL completas em `vault-policies.hcl`. Versionado em git, code review obrigatório.

### Hooks que dependem de Vault

- `pre-tool-vault-ttl.sh` — **allowlist-based**. Diagnósticos (`vault status`, `vault token lookup`, `wire-*-doctor`, endpoints públicos `sys/health`/`sys/seal-status`, comandos read-only de sistema) **passam sem token**. Tudo o resto exige `VAULT_TOKEN` válido com TTL ≥ 60s (fail-closed).
- `post-tool-vault-revoke.sh` — revoga token no fim da sessão; limpa keys efémeras em tmpfs
- `pre-tool-second-opinion.sh` — em ops destrutivas, valida com Ollama qwen3-coder local

### Quando o Vault não está acessível

Ops privilegiadas **falham-fechadas**. Sem fallback inseguro. Os **doctors do plugin continuam a correr** (allowlist) — corre `/wire-vault-doctor` primeiro para identificar o que está em down. Recovery: `vault token renew` ou re-login com `role_id` + `secret_id`. Em dev, `export VAULT_TOKEN=dev-only-root`.

### Bootstrap (uma única vez por ambiente)

```bash
vault secrets enable -version=2 -path=secret kv
vault auth enable approle
vault secrets enable transit && vault write -f transit/keys/forensics
vault secrets enable -path=ssh ssh
vault write ssh/config/ca generate_signing_key=true

# Aplicar todas as policies do ficheiro HCL
for policy in $(grep -oE 'wire-[a-z]+' vault-policies.hcl | sort -u); do
  vault policy write "$policy" vault-policies.hcl
done
```

## Servidores wire* (pool nativo, sem orquestrador)
| Produto | Versão Rails | Pool |
|---------|--------------|------|
| wirePAPER | Rails 6.1 | A |
| wireDESK | Rails 7.1 | A |
| wireSTUDIO | Rails 7.2 | A |
| wireCITYapp | Rails 7.0 | A |
| wireRECRUIT | Rails 7.2 | A |
| wireDOCS | Rails 7.0 | B |
| wireMEET | Rails 7.1 | B |
| wireFORMS | Rails 6.1 | B |
| wireVOICE | Rails 7.1 | B |
| wireCONNECT | Rails 7.0 | B |

Stack runtime: Puma + systemd + Capistrano. Sem orquestrador de containers.

## Subagentes (em `.claude/agents/`)
`wire-monitor-01` Wazuh+Fortigate+Zabbix · `wire-ir-saas-01` IR multi-tenant · `wire-tenant-01` isolamento · `wire-srv-saas-01` servidores Rails nativos · `wire-deploy-01` release gate (Capistrano) · `wire-compliance-01` compliance

## Princípios não-negociáveis
- Zero secrets em ficheiros. AppRole + response wrapping em runtime.
- SSH = Vault CA cert (TTL ≤ 15min). Nunca chaves estáticas. Nem `secrets.yml` em git.
- Isolamento multi-tenant é o controlo crítico nº 1. Tenant-key obrigatório em todas as queries (escopo via PostgreSQL RLS).
- Operações cross-tenant exigem N2; desligar produto exige N3.
- Second-opinion (Ollama qwen3-coder local) gate-eia ops destrutivas (`DROP`, `cap deploy:rollback`, `systemctl stop puma`). Fail-closed se o modelo cair.
- Toda a tool call → CEF → Wazuh. Token revogado pós-sessão.
- Releases têm gate. Nenhum `cap production deploy` sem `/wire-release-gate` aprovado e canary multi-tenant.
- Monitorização Zabbix tem que ser auditada: hosts sem agente, sem template adequado, alertas silenciosos > 90d são tratados como dívida operacional.

## Variáveis de ambiente do plugin

Convenção `WIRE_*` + alguns `OLLAMA_*`/`WAZUH_*` legacy aceites. Defaults sensatos para o stack Wire; override apenas onde necessário.

| Var | Default | Propósito |
|-----|---------|-----------|
| `WIRE_OPERATING_MODE` | `prod` | prod/dev/lab — fail-closed em prod, warn-only em dev, bypass em lab |
| `WIRE_LOG_DIR` | `$HOME/.wire/log` | Audit logs locais do plugin (cef.log, approvals.log, pii-blocks.log) |
| `WIRE_APPROVE` | (unset) | N1/N2/N3 — autorização explícita para ops destrutivas (ver `pre-tool-approval-gate.sh`) |
| `WIRE_FORENSICS_DIR` | `$HOME/forensics` | Case files de Incident Response (timeline, artefactos, queries) |
| `WIRE_EPHEMERAL_KEY_DIR` | `/dev/shm` (Linux) / `$(mktemp -d)` (macOS) | SSH cert temp storage; auto-fallback macOS |
| `WIRE_RAILS_DEPLOY_BASE` | `/var/www` | Capistrano `deploy_to` root. Path final: `${WIRE_RAILS_DEPLOY_BASE}/<produto>/current/` |
| `WIRE_WAZUH_HOST` | `wazuh-manager.wire.internal` | Endpoint Wazuh manager (namespace canónico; legacy `WAZUH_HOST` ainda aceite) |
| `WIRE_PII_DISABLE` | (unset) | `=1` em dev desactiva `pre-tool-pii-redact.sh`. NÃO recomendado em prod (uso é audit-tracked) |
| `WIRE_SECOND_OPINION_BYPASS` | (unset) | `=1` salta `pre-tool-second-opinion.sh` se Ollama down. Audit-tracked |
| `WIRE_VAULT_AUTO_UP` | (unset) | Auto-up do Vault Docker em prod (override do default off) |
| `OLLAMA_HOST` | `http://127.0.0.1:11434` | Endpoint Ollama (second-opinion hook + `/wire-ollama-doctor`) |
| `OLLAMA_MODEL` | `qwen3-coder:30b` | Modelo Ollama com tag explícita |
| `VAULT_ADDR` | (sem default — exigido) | Endpoint Vault. `/wire-vault-doctor` fails-fast se ausente |
| `VAULT_TOKEN` | (sem default — exigido) | Token Vault, ou login via AppRole |
| `VAULT_CACERT` | (depende do mode) | Cert CA Vault em prod (HTTPS) |
| `FORTIGATE_HOST`, `ZABBIX_URL` | (sem default) | Endpoints Fortigate/Zabbix; `/wire-stack-doctor` fails-loud se ausentes |

**Override em prod:** export persistente via `~/.zshrc`/`~/.bashrc` ou systemd unit ENV. Em dev: shell ad hoc.

**Auditoria:** `WIRE_APPROVE`, `WIRE_PII_DISABLE`, `WIRE_SECOND_OPINION_BYPASS` são audit-tracked em `${WIRE_LOG_DIR}/`.

## Slash commands (em `commands/`)

**Operação:**
`/wire-saas-health` · `/wire-tenant-audit <municipio>` · `/wire-incident-spread <id>` · `/wire-release-gate <release>` · `/wire-cliente-dossier <municipio>` · `/wire-compliance-snapshot`

**Diagnóstico (doctors):**
`/wire-stack-doctor` (global) · `/wire-vault-doctor` · `/wire-ollama-doctor`

**Provisioning (v0.3.0+):**
`/wire-secops-bootstrap` — 7 policies + 7 AppRoles + transit/keys/forensics + ssh CA + ssh roles + macOS Keychain. Idempotente. Requer `wire-base` e `/wire-vault-bootstrap` corrido antes.

Total: **10 commands** (6 operação + 3 diagnóstico + 1 provisioning).

## Skills (em `skills/`)
`wire-tenant-isolation` · `wire-saas-monitoring` (Wazuh+Fortigate+Zabbix) · `wire-ir-multitenant` · `wire-release-safety` · `wire-compliance-provider` · `wire-cliente-dossier`

## Produtos wire* protegidos
wirePAPER · wireDESK · wireSTUDIO · wireCITYapp · wireVOICE · wireDOCS · wireMEET · wireFORMS · wireRECRUIT · wireCONNECT

## Documentos de referência
- `WIRE.POL.SEC.001` — Política SecOps
- `WIRE.ARQ.SEC.002` — Arquitectura (servidores nativos Rails)
- `WIRE.PRC.AUD.004` — Auditoria
- `WIRE.PRC.IRT.005` — IR multi-tenant
- `WIRE.MTZ.SEC.006` — RACI + CTRL-W-*

## Estilo
- Português europeu, registo técnico-institucional.
- Output compresso. Decide proactivamente.
- Cita enquadramento legal quando relevante: NIS2 (DL 20/2025) enquanto fornecedor crítico, RGPD Art. 28 enquanto subcontratante.

## Notas para o agente
- Quando o utilizador pedir "saúde", correlaciona sempre as três fontes: Wazuh (alertas/eventos), Fortigate (perímetro), Zabbix (saúde activa).
- Quando o utilizador falar de "deploy", a referência é Capistrano (`cap production deploy`), não kubectl.
- Quando o utilizador falar de "monitorização", verifica também a saúde da monitorização — não só o que ela reporta, mas o que ela está ou não a observar (hosts sem agent Zabbix, templates desactualizados, triggers obsoletos).

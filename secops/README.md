# prumo-secops

Plugin Claude Code · SecOps com Agentes IA especializado para a **Wire** enquanto fornecedora SaaS de eGovernment local (170+ autarquias portuguesas).

**Versão:** 0.5.0 · **Data:** 2026-07-06 · **Autor:** mjvmst · mjvmst@gmail.com

---

## Dependências

Recomenda **`prumo-base`** — os hooks deste plugin usam `prumo_log` / `prumo_mode` / `prumo_fail_or_warn` da `prumo-common.sh` para respeitarem `PRUMO_OPERATING_MODE` (prod/dev/lab). Sem o base instalado, os hooks correm com stubs de fallback (modo prod-fail-closed por defeito).

```
/plugin install prumo-base@prumo
/plugin install prumo-secops@prumo
```

---

## Para que serve

A Wire é o fornecedor SaaS por trás de 170+ autarquias portuguesas. Está sujeita à **NIS2** enquanto fornecedor crítico de entidades essenciais (DL 20/2025) e ao **Art. 28 do RGPD** enquanto subcontratante de dados pessoais por conta dos municípios. Este plugin codifica a operação SecOps Wire em seis subagentes especializados, seis skills, slash commands e hooks de aprovação.

---

## Arquitectura

```
prumo-secops/
├── .claude-plugin/
│   └── plugin.json
├── skills/                       # 6 skills + 20 templates references/ (progressive disclosure)
│   ├── prumo-tenant-isolation/       (+ references/: template-cliente, queries-evidencia, painel-template)
│   ├── prumo-saas-monitoring/        (+ references/: wazuh-rules, wazuh-fortigate-pairs, zabbix-canonical-templates, runbook-correlacao)
│   ├── prumo-ir-multitenant/         (+ references/: severity-matrix, timeline-template, distribuicao-classificacao)
│   ├── prumo-release-safety/         (+ references/: canary-plan-template, rollback-template, changelog-template)
│   ├── prumo-compliance-provider/    (+ references/: mapping-nis2, mapping-iso27001, anexoII-template, dpia-template, caiq-pre-filled)
│   └── prumo-cliente-dossier/        (+ references/: dossier-template, sla-calculation)
├── agents/                       # 6 subagentes (Claude Code)
│   ├── prumo-monitor-01.md
│   ├── prumo-ir-saas-01.md
│   ├── prumo-tenant-01.md
│   ├── prumo-srv-saas-01.md
│   ├── prumo-deploy-01.md
│   └── prumo-compliance-01.md
├── commands/                     # 10 slash commands (todos prefixados wire-)
│   ├── prumo-saas-health.md           # operação
│   ├── prumo-tenant-audit.md          # operação
│   ├── prumo-incident-spread.md       # operação
│   ├── prumo-release-gate.md          # operação
│   ├── prumo-cliente-dossier.md       # operação
│   ├── prumo-compliance-snapshot.md   # operação
│   ├── prumo-stack-doctor.md          # diagnóstico · global
│   ├── prumo-vault-doctor.md          # diagnóstico · Vault
│   ├── prumo-ollama-doctor.md         # diagnóstico · Ollama
│   └── prumo-secops-bootstrap.md      # provisioning · 7 policies + 7 AppRoles + transit + ssh + Keychain (v0.3.0)
├── hooks/                        # 4 pre + 1 post + 1 stop + 1 SessionStart (+ _lib.sh shim)
│   ├── hooks.json
│   ├── pre-tool-vault-ttl.sh         # PreToolUse · gate TTL Vault (allowlist diagnósticos)
│   ├── pre-tool-approval-gate.sh     # PreToolUse · PRUMO_APPROVE=N1/N2/N3 em ops destrutivas
│   ├── pre-tool-pii-redact.sh        # PreToolUse · fail-closed em PII (NIF/IBAN/CC/email/tel PT)
│   ├── pre-tool-second-opinion.sh    # PreToolUse · Ollama qwen3-coder valida ops destrutivas
│   ├── post-tool-cef-wazuh.sh        # PostToolUse · CEF → Wazuh
│   ├── post-tool-vault-revoke.sh     # Stop · revoga token + limpa keys efémeras
│   └── check-recommends.sh           # SessionStart · hint se prumo-base ausente
├── CHANGELOG.md
├── CLAUDE.md                      # runtime context (Vault topology, AppRoles, env vars)
├── vault-policies.hcl             # 7 policies (6 subagent + Cowork external)
└── README.md
```

---

## Princípios não-negociáveis

1. **Zero secrets em ficheiros.** Todas as credenciais via Vault AppRole com TTL ≤ 30 min.
2. **Isolamento multi-tenant.** Todo o acesso a dados de cliente requer tenant-key explícito e justificação.
3. **Operações cross-tenant exigem aprovação N2.** Qualquer query, export ou correlação que toque em mais de um município passa por hook humano.
4. **SSH = Vault CA cert (TTL ≤ 15min).** Nunca chaves estáticas em produção.
5. **Second-opinion em ops destrutivas.** Ollama qwen3-coder local valida hipóteses antes de execução.
6. **Observabilidade total.** Todas as tool calls → CEF/OTLP → Wazuh. Tokens revogados pós-sessão.
7. **Releases têm gate.** Nenhum deploy em produção sem `/prumo-release-gate` aprovado e dry-run multi-tenant.

---

## Stack assumido (Wire real)

- **Vault HA (Raft, 3 nós)** — broker de credenciais, AppRoles, SSH CA, transit.
- **Wazuh** — SIEM mestre. Recebe syslog/CEF do Fortigate, logs lograge dos Rails, audit Vault, OTel.
- **Fortigate** — perímetro (anti-DDoS, IPS, WAF). Toda a telemetria reencaminhada para Wazuh.
- **Zabbix** — monitorização activa de hosts/serviços; agentes Zabbix nos VMs Rails.
- **Servidores nativos (VMs)** — pools com múltiplas versões Ruby on Rails (6.1, 7.0, 7.1, 7.2) sobre Puma + systemd + Capistrano. **Sem orquestrador de containers.**
- **PostgreSQL** — schema-per-tenant com Row-Level Security activa.
- **GitLab / GitHub** — CI/CD com release gates Capistrano-driven.
- **OpenTelemetry** — traces/metrics dos serviços wire* Rails.

---

## Como instalar

```bash
# 1. Adicionar o marketplace
/plugin marketplace add mjvmsteixeira/claudecodemastery

# 2. Instalar os plugins (base primeiro — prumo-secops assume-o)
/plugin install prumo-base@prumo
/plugin install prumo-secops@prumo

# 3. Bootstrap automático (v0.3.0+) — uma única corrida cria policies, AppRoles, transit, ssh CA, ssh roles, Keychain
export VAULT_TOKEN=$(jq -r .root_token ~/vault/vault-init.json)
/prumo-vault-bootstrap --plan && /prumo-vault-bootstrap --apply        # (prumo-base) infra Vault genérica: audit, kv-v2, approle, transit, ssh
/prumo-secops-bootstrap --plan && /prumo-secops-bootstrap --apply       # (prumo-secops) 7 policies + 7 AppRoles + transit/keys/forensics + ssh/config/ca + ssh roles + Keychain

# 3b. (Alternativa pre-v0.3.0 · manual, em vias de ficar legacy)
# vault write auth/approle/role/wire-monitor   token_ttl=30m token_max_ttl=1h
# vault write auth/approle/role/wire-ir        token_ttl=15m token_max_ttl=1h
# vault write auth/approle/role/wire-tenant    token_ttl=15m token_max_ttl=30m
# vault write auth/approle/role/wire-srv       token_ttl=15m token_max_ttl=30m
# vault write auth/approle/role/wire-deploy    token_ttl=15m token_max_ttl=30m
# vault write auth/approle/role/wire-compliance token_ttl=30m token_max_ttl=1h
```

---

## Skills (resumo)

| Skill | Quando dispara | Output |
|-------|----------------|--------|
| **tenant-isolation** | Pedido para auditar isolamento entre clientes | Relatório com matriz de cruzamentos, scoring CTRL-T-001..016 |
| **saas-monitoring** | Saúde da plataforma + correlação Wazuh ↔ Fortigate + auditoria Zabbix (agentes, templates, triggers) | Dashboard ASCII, alertas correlacionados, relatório cobertura Zabbix com propostas |
| **ir-multitenant** | Incidente que toca em ≥2 municípios | Timeline cruzada Wazuh+Fortigate, identificação de vector (perímetro vs interno), blast radius, notificações CNCS/clientes |
| **release-safety** | Antes de qualquer deploy em produção | Checklist gate com critérios bloqueantes + recomendações |
| **compliance-provider** | Auditorias NIS2/RGPD, dossiers Art. 28 | Mapping de controlos, gaps, plano de remediação |
| **cliente-dossier** | "Quero ver tudo do município X" | Dossier consolidado por cliente: produtos activos, SLA, incidentes 12m, DPIA |

Cada skill tem o seu `SKILL.md` em `skills/<nome>/SKILL.md`.

---

## Commands (resumo)

| Command | Tipo | Quando |
|---------|------|--------|
| `/prumo-saas-health` | operação | Início do turno; correlação Wazuh+Fortigate+Zabbix |
| `/prumo-tenant-audit <municipio>` | operação | Auditoria de isolamento por cliente |
| `/prumo-incident-spread <id>` | operação | IR multi-tenant; blast radius + comunicação |
| `/prumo-release-gate <release>` | operação | Pré-deploy gate Capistrano |
| `/prumo-cliente-dossier <municipio>` | operação | Dossier 360° por cliente |
| `/prumo-compliance-snapshot` | operação | NIS2 / RGPD / ISO 27001 evidence snapshot |
| `/prumo-stack-doctor` | diagnóstico | Health check global (Wazuh+Fortigate+Zabbix+Vault+Ollama) |
| `/prumo-vault-doctor` | diagnóstico | Vault de PRODUÇÃO (fail-fast se `VAULT_ADDR` ausente) |
| `/prumo-ollama-doctor` | diagnóstico | Ollama + modelo qwen3-coder para second-opinion |
| `/prumo-secops-bootstrap` | provisioning | Provisiona 7 policies + AppRoles + transit + ssh CA + Keychain (v0.3.0+) |

Total: **10 commands** (6 operação · 3 diagnóstico · 1 provisioning).

---

## Cadência operacional

- **Diária:** `/prumo-saas-health` no início do turno; revisão de alertas Wazuh; fecho de turno com relatório.
- **Semanal:** revisão drift de servidores, dossiers de clientes com SLA degradado.
- **Quinzenal:** `/prumo-release-gate` para cada release planeado.
- **Mensal:** `/prumo-compliance-snapshot` com mapping de controlos.
- **Trimestral:** revisão de AppRoles, rotação de keys de tenant, simulacro de IR multi-tenant.
- **Anual:** auditoria externa (ISO 27001 + ENS), revisão da política completa.

---

## Documentos de referência

- `WIRE.POL.SEC.001` — Política SecOps Wire (a redigir, baseada em GIN.POL.SEC.001 adaptada)
- `WIRE.ARQ.SEC.002` — Arquitectura técnica multi-tenant
- `WIRE.PRC.AUD.004` — Procedimento de auditoria e conformidade
- `WIRE.PRC.IRT.005` — Procedimento IR multi-tenant
- `WIRE.MTZ.SEC.006` — Matriz RACI + controlos numerados CTRL-W-001..080

---

## Notas de adopção

1. **Pensado de raiz para fornecedor SaaS.** Não é adaptação de pacote cliente; é desenhado para a Wire enquanto subcontratante crítico, com foco em multi-tenancy e operações 24x7.
2. **Cowork em modo confinado** mantém-se: relatórios institucionais e dossiers de cliente são produzidos em `/shared/reports/output/` por `ai-rep-01` (herdado).
3. **Período de pilotagem recomendado:** 12 semanas (ver roadmap no deck de formação).
4. **Métricas de sucesso:** MTTD <5min em alertas P1, MTTR <30min em incidentes multi-tenant, 0 incidentes de cross-tenant data leak, 100% de releases gated.

---

© 2026 prumo · Uso interno · Versão 0.5.0

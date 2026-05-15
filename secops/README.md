# wire-secops

Plugin Claude Code · SecOps com Agentes IA especializado para a **Wire** enquanto fornecedora SaaS de eGovernment local (170+ autarquias portuguesas).

**Versão:** 0.1.0 · **Data:** 2026-05-15 · **Autor:** jump2new · geral@jump2new.pt

---

## Para que serve

A Wire é o fornecedor SaaS por trás de 170+ autarquias portuguesas. Está sujeita à **NIS2** enquanto fornecedor crítico de entidades essenciais (DL 20/2025) e ao **Art. 28 do RGPD** enquanto subcontratante de dados pessoais por conta dos municípios. Este plugin codifica a operação SecOps Wire em seis subagentes especializados, seis skills, slash commands e hooks de aprovação.

---

## Arquitectura

```
wire-secops/
├── .claude-plugin/
│   └── plugin.json
├── skills/                       # Skills especializadas, disparam por contexto
│   ├── wire-tenant-isolation/
│   ├── wire-saas-monitoring/
│   ├── wire-ir-multitenant/
│   ├── wire-release-safety/
│   ├── wire-compliance-provider/
│   └── wire-cliente-dossier/
├── agents/                       # Subagentes (Claude Code)
│   ├── wire-monitor-01.md
│   ├── wire-ir-saas-01.md
│   ├── wire-tenant-01.md
│   ├── wire-srv-saas-01.md
│   ├── wire-deploy-01.md
│   └── wire-compliance-01.md
├── commands/                     # Slash commands (todos prefixados wire-)
│   ├── wire-saas-health.md           # operação
│   ├── wire-tenant-audit.md          # operação
│   ├── wire-incident-spread.md       # operação
│   ├── wire-release-gate.md          # operação
│   ├── wire-cliente-dossier.md       # operação
│   ├── wire-compliance-snapshot.md   # operação
│   ├── wire-stack-doctor.md          # diagnóstico · global
│   ├── wire-vault-doctor.md          # diagnóstico · Vault
│   └── wire-ollama-doctor.md         # diagnóstico · Ollama
├── hooks/
│   └── hooks.json                # Pre-tool e post-tool
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
7. **Releases têm gate.** Nenhum deploy em produção sem `/wire-release-gate` aprovado e dry-run multi-tenant.

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

# 2. Instalar os plugins (base primeiro — wire-secops assume-o)
/plugin install wire-base@jump2new
/plugin install wire-secops@jump2new

# 3. Configurar AppRoles Vault (uma vez)
vault write auth/approle/role/wire-monitor   token_ttl=30m token_max_ttl=1h
vault write auth/approle/role/wire-ir        token_ttl=15m token_max_ttl=1h
vault write auth/approle/role/wire-tenant    token_ttl=15m token_max_ttl=30m
vault write auth/approle/role/wire-srv       token_ttl=15m token_max_ttl=30m
vault write auth/approle/role/wire-deploy    token_ttl=15m token_max_ttl=30m
vault write auth/approle/role/wire-compliance token_ttl=30m token_max_ttl=1h
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

## Cadência operacional

- **Diária:** `/wire-saas-health` no início do turno; revisão de alertas Wazuh; fecho de turno com relatório.
- **Semanal:** revisão drift de servidores, dossiers de clientes com SLA degradado.
- **Quinzenal:** `/wire-release-gate` para cada release planeado.
- **Mensal:** `/wire-compliance-snapshot` com mapping de controlos.
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

© 2026 jump2new · Uso interno · Versão 0.1.0

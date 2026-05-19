# Matriz de Severidade — Incidentes Multi-Tenant Wire

**Skill:** `wire-ir-multitenant` · **Versão:** v0.4.0 · **Última actualização:** 2026-05-19

> Template referenciado pela skill `wire-ir-multitenant`. Baseado em NIS2 DL 20/2025 Anexo II,
> ISO/IEC 27035-1:2023 e NIST SP 800-61r2. Adapta-se ao contexto da sessão; marca `[CONFIRMAR]`
> campos que dependem de decisões Wire-specific ainda não tomadas.

A matriz tem **quatro eixos primários** combinados num único veredicto S1/S2/S3/S4:

1. **Blast radius** — 1 tenant / multi-tenant / SaaS-wide.
2. **Tenants impacted** — contagem absoluta + presença de munícipios críticos `[CONFIRMAR — lista canónica em secret/data/tenants/metadata/critical]`.
3. **RTO violado** — tempo até restauro vs objectivo contratado.
4. **RPO violado** — janela de perda de dados vs objectivo contratado.
5. **Classificação de dados tocados** — público / restrito / confidencial / segredo (modelo Wire alinhado com NIS2 Anexo II §3).

## Os 4 níveis

### S1 — Crítica

Incidente que cumpre **uma** das seguintes condições:

- Blast radius SaaS-wide (≥ 1 componente partilhado degradado: Vault, IdP central, LB, DB plataforma).
- Dados **confidenciais** ou **segredo** expostos a terceiros não autorizados (confirmado ou alta suspeita).
- RTO ≤ 30 min violado em produto wire* crítico.
- ≥ 3 munícipios marcados como críticos `[CONFIRMAR]` com serviço degradado em simultâneo.
- Vazamento cross-tenant confirmado (RLS bypass, key reuse, cache poisoning).

**Escalation imediata:** SecOps Lead → CISO → DPO em ≤ 15 min. CTO informado em ≤ 30 min.
**Notificação CNCS:** obrigatória ≤ 24 h após detecção (DL 20/2025 Art. 23 §1).
**Comunicação a clientes afectados:** ≤ 4 h via canal contratado (RGPD Art. 33 §2).
**Bridge CSIRT permanente** até downgrade ou closure.

### S2 — Alta

Incidente que cumpre **uma** das seguintes:

- Blast radius multi-tenant (2-3 munícipios) sem componente partilhado degradado.
- Dados **restritos** expostos com vector de exfiltração credível mas não confirmado.
- RTO ≤ 4 h violado em produto wire* não-crítico.
- HA degraded em Vault (1 nó Raft sealed/unreachable) — operação prossegue, mas perda de redundância.
- Detecção de exploit attempt activo contra CVE conhecido em dependency wire* sem patch aplicado.

**Escalation:** SecOps Lead → CISO em ≤ 30 min. DPO informado se dados pessoais.
**Notificação CNCS:** opcional consoante critérios DL 20/2025 Art. 23 §2 (impacto transfronteiriço ou ≥ 1 milhão de utilizadores) — Wire raramente atinge, mas avaliar.
**Comunicação a clientes afectados:** ≤ 24 h.

### S3 — Média

- Blast radius single-tenant com mitigação parcial em curso.
- Indicadores de comprometimento sem evidência confirmada.
- Backup falhado para 1 cliente; restore window ainda dentro de RPO.
- Vulnerabilidade dependency com CVSS 7.0-8.9 sem exploitability pública.

**Escalation:** SecOps team interno; SecOps Lead notificado em ≤ 2 h.
**Comunicação ao cliente:** ≤ 72 h se houver risco residual; opcional se contido sem impacto.
**CNCS:** não-aplicável.

### S4 — Baixa

- Anomalia isolada, auto-mitigada, sem evidência de comprometimento.
- Alerta Wazuh transiente fora de janela operacional sem follow-up signal.
- Patch routine de baixa severidade (CVSS < 7.0) sem exploitability.

**Escalation:** registo em IR backlog. Triage no próximo daily SecOps.
**Comunicação:** não-aplicável.

## Decision tree para classificar incidente

```
                  ┌─ Dados confidenciais/segredo expostos? ──── SIM ──► S1
                  │                                              NÃO ─┐
                  │                                                   │
INÍCIO ──────────►│─ Componente SaaS-wide degradado? ─── SIM ──► S1   │
                  │                                       NÃO ───────┘
                  │
                  ├─ Cross-tenant data leak confirmado/alta suspeita? ── SIM ──► S1
                  │                                                       NÃO ─┐
                  │                                                            │
                  ├─ ≥3 munícipios críticos com serviço degradado? ─── SIM ──► S1
                  │                                                    NÃO ───┘
                  │
                  ├─ 2-3 tenants afectados OU HA degraded OU exploit active? ─ SIM ─► S2
                  │                                                            NÃO ─┐
                  │                                                                 │
                  ├─ Single tenant afectado OU IoC sem evidência? ──── SIM ──► S3   │
                  │                                                    NÃO ────────┘
                  │
                  └─ Default ──► S4
```

A classificação pode **escalar durante o incidente** (S2 → S1 quando exploitability confirmada). A timeline (`timeline-template.md`) regista a mudança de `severity_at_event`.

## Escalation path por severity

| Severity | T+0 | T+15 min | T+30 min | T+60 min | T+24 h |
|----------|-----|----------|----------|----------|--------|
| **S1** | SecOps Lead + scribe iniciam timeline | CISO + DPO informados | CTO informado, bridge aberta | Comms a 1.º cliente afectado prep | Notificação CNCS submetida |
| **S2** | SecOps Lead notificado | CISO informado | Bridge SecOps aberta | DPO se PII | Comms a clientes afectados |
| **S3** | SecOps team triage | — | — | SecOps Lead next daily | Comms opcional |
| **S4** | Registo backlog | — | — | — | Daily triage |

## Exemplos preenchidos

| Cenário | Classificação | Justificação |
|---------|---------------|--------------|
| Vault sealed em 1 nó Raft (2/3 nós operacionais) | **S2** | HA degraded; sem impacto cliente directo, mas perda de redundância crítica. |
| RLS bypass cross-tenant em wirePAPER (query cruza 2 munícipios) | **S1** | Dados confidenciais entre tenants — disparador absoluto S1 mesmo com 2 tenants. |
| DDoS perímetro SaaS-wide com 5 munícipios offline > 10 min | **S1** | Blast SaaS-wide + impacto multi-cliente. |
| Backup nightly falhado para 1 cliente, próxima execução em 6 h | **S3** | Não-bloqueante; restore window ainda dentro de RPO contratado. |
| CVE-2026-XXXX dependency em wireDESK, CVSS 8.5, sem PoC público | **S3** | Vulnerabilidade séria mas sem exploitability — patch em janela normal. |
| CVE-2026-XXXX dependency em wireDESK, CVSS 8.5, exploit publicado, scan attempts em logs Fortigate | **S2** | Exploit attempts activos elevam a classificação. |
| Capistrano deploy a wireSTUDIO degrada response time em 12 munícipios | **S2** | Multi-tenant sem componente partilhado degradado; mitigar via rollback. |
| Phishing report de funcionário município — sem credentials submetidas | **S4** | Tentativa contida pelo utilizador; awareness ticket. |
| Suspeita de exfiltração de PII via wireFORMS export endpoint, 1 município | **S2** | Single tenant mas dados pessoais com vector credível — escalar para S1 se confirmado. |
| Vault root token rotado, AppRoles re-issued, sem evidência de uso indevido | **S3** | Operação preventiva controlada; registar mas sem impacto. |

## Critérios para downgrade durante o incidente

Um incidente só desce de severity quando:

- Contenção verificada por evidência independente (não só "parou de alertar").
- Blast radius confirmado menor do que estimativa inicial após investigação.
- Vector descartado por análise forense (ex: falso positivo Wazuh em rule específica).

**Nunca** descer S1 → S2 antes de comunicar a clientes — a comunicação é por classificação no momento da decisão, não retroactiva.

---

## Fontes

- **NIS2 / DL n.º 20/2025** Anexo II — critérios de severidade para entidades essenciais e fornecedores críticos.
- **ISO/IEC 27035-1:2023** — Information security incident management, principles and process.
- **NIST SP 800-61r2** — Computer Security Incident Handling Guide.
- **ENISA Guidelines for Reporting Significant Incidents** (2024) — critérios complementares.
- WIRE.PRC.IRT.005 — Procedimento IR Wire (referência interna).

## Como usar este template em sessão Claude Code

A skill `wire-ir-multitenant` invoca este template quando precisa de classificar um incidente em curso ou justificar a classificação em escalation/notificação CNCS. Esperar como output: classificação S1-S4 + justificação por critério + escalation path activado. O user pode override manualmente se tiver informação que a sessão não vê (ex: contexto comercial sobre criticidade de um município) — basta indicar a classificação pretendida.

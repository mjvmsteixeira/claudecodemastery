# Runbook — Correlação Wazuh + Fortigate + Zabbix

**Skill:** `prumo-saas-monitoring` · **Versão:** v0.4.0 · **Última actualização:** 2026-05-19

> Template referenciado pela skill `prumo-saas-monitoring`. Heurísticas operacionais para
> correlação cruzada entre as três fontes Wire. Baseado em experiência operacional documentada
> em WIRE.PRC.IRT.005 e em padrões de NIST SP 800-92 (Guide to Computer Security Log Management).

A premissa fundamental: **nenhuma fonte sozinha tem visão completa**. Wazuh vê eventos internos
(autenticação, logs aplicacionais, audit). Fortigate vê perímetro (tráfego, anomalia, WAF, IPS).
Zabbix vê saúde activa (latência, saturação, disponibilidade). Decisões operacionais Wire
exigem **triangulação obrigatória**.

## Heurísticas — quando correlacionar 3 fontes

### Trigger 1 — Degradação detectada por Zabbix

Se Zabbix dispara trigger de severidade ≥ High (latência, error rate, saturação):

```
1. Correlacionar Wazuh ±15min:
   - Existem alertas rule_id 100030-100049 (Rails)?
   - Existem alertas 100010-100029 (DB / RLS)?
   - Existem alertas 100100-100199 (deploy / FS change)?

2. Correlacionar Fortigate ±15min:
   - Anomalia de tráfego (DDoS, scan, geo)?
   - WAF/IPS hits no produto afectado?
   - Mudança recente em policies (humano)?

3. Veredicto:
   a. Wazuh + Fortigate consistentes → ataque externo confirmado, contenção via Fortigate
   b. Apenas Wazuh → vector interno OU supply chain → IR triage urgente
   c. Apenas Fortigate → ataque a tentar entrar, mitigação efectiva, monitor
   d. Apenas Zabbix → degradação operacional não-segurança (capacity, bug, dep externa) → engenharia
```

### Trigger 2 — Alerta de segurança Wazuh

Para alertas Wazuh level ≥ 10:

```
1. Correlacionar Fortigate ±15min:
   - Há contexto perímetro? (origem do request)
   - Há outras tentativas do mesmo srcip / mesma sig?

2. Correlacionar Zabbix ±15min:
   - O host afectado mostra anomalia de saúde?
   - Triggers operacionais activos?

3. Veredicto:
   a. Fortigate confirma origem externa + Zabbix shows impact → S2/S1 — escalation
   b. Sem Fortigate, sem Zabbix impact → false positive PROVÁVEL — review rule
   c. Sem Fortigate, com Zabbix impact → red flag — possível supply chain
   d. Fortigate confirma, sem Zabbix impact → tentativa que não chegou a degradar — monitor
```

### Trigger 3 — Anomalia Fortigate

Para events Fortigate críticos (DDoS, WAF block sustained, geo anomaly):

```
1. Correlacionar Wazuh ±15min:
   - Algum payload chegou ao Rails app?
   - Auth events relacionados?

2. Correlacionar Zabbix:
   - Saturação de recursos?
   - Triggers de capacity?

3. Veredicto: ver Par 1-4 em wazuh-fortigate-pairs.md
```

## Decision tree consolidada

```
        ┌─ Zabbix critical/disaster? ─────► Trigger 1
        │
INÍCIO ─┼─ Wazuh level ≥10 alert? ────────► Trigger 2
        │
        ├─ Fortigate critical event? ─────► Trigger 3
        │
        └─ Multi-source simultâneo? ──────► IR escalation immediate
                                            (não aguardar correlação manual)
```

## Anti-patterns — false positive cascades

### Cascade A — Deploy janela

Capistrano deploy gera:
- Zabbix: dip momentâneo em puma.workers.busy (drain), seguido de spike
- Wazuh: rule 100100 (deploy started), 100102 (success), possíveis 100030 (request anomaly durante warm-up)
- Fortigate: tráfego momentâneo elevado se warm-up envolve cache rebuild

**Anti-pattern:** alertar todas as três fontes. Filtrar com **deploy_window correlation**:
- Wazuh 100100 visto em ±5min → suprimir triggers correlatos do mesmo produto durante 10min após.
- `/prumo-saas-health` exibe estado especial "deploy in progress" e suprime warnings.

### Cascade B — Maintenance window

Patching mensal de OS:
- Zabbix: trigger `Service down` por restart systemd
- Wazuh: rules de mudança de FS (100150+) por package install

**Anti-pattern:** alertar como incident. Mitigation: maintenance window declarado em Zabbix
(`zabbix_api -m maintenance.create`) suprime alertas operacionais. Wazuh agent recebe whitelist
de paths de package install (`/var/lib/dpkg/`, `/var/cache/apt/`).

### Cascade C — Backup / restore drill

Backups noturnos:
- PostgreSQL: write activity spike no DB primary
- Zabbix: spike em IO, possível trigger `Replication lag high` se backup é em replica
- Wazuh: AppRole `wire-backup` auth events

**Anti-pattern:** alertar replication lag como incident. Configurar **backup_window** macro:
`{$BACKUP_WINDOW_START}` e `{$BACKUP_WINDOW_END}` suprimem triggers replication-related.

### Cascade D — Tenant onboarding

Quando um novo município é provisionado:
- DDL queries criam novas RLS policies → Wazuh 100020+ pode disparar se rule estiver mal afinada
- Zabbix LLD descobre novo tenant → temporariamente sem baseline
- Fortigate vê tráfego inicial elevado durante data migration

**Anti-pattern:** confundir onboarding com data leak. Mitigation: tenant onboarding é op N2 explicit, gera audit event marcado. Correlação automática suprime alertas durante 2h após onboarding.

## Padrões positivos

### Padrão 1 — IR triage rápido

Em S1/S2 incident:
```
T+0     Wazuh dispara level 12+
T+5s    /prumo-saas-health auto-invocado pelo subagent prumo-monitor-01
T+5s    Output: Wazuh + Fortigate ±15min + Zabbix triggers do host
T+10s   Subagent classifica: ataque externo / interno / operacional
T+30s   Notificação a SecOps de plantão com contexto pré-correlacionado
```

### Padrão 2 — Daily health summary

Diariamente às 09:00 UTC `/prumo-saas-health --daily`:
- Top 10 hosts por Zabbix triggers do dia anterior
- Top 10 Wazuh rule_ids do dia
- Anomalias Fortigate
- Correlação cross-source automatic (3-source incidents)
- Gaps detectados (host sem agent, template desactualizado, rule sem hits)

### Padrão 3 — Audit mensal de qualidade

`/prumo-saas-health --quality-audit` mensal verifica:
- False positive rate por rule Wazuh: target < 5% para level ≥ 10.
- Trigger flapping em Zabbix: target zero triggers flapping > 5 ciclos.
- Alertas Fortigate sem investigação: target < 10% backlog.
- 3-source correlation effectiveness: % de incidents onde correlação foi automática vs manual.

## Heurística de severity rollup

Quando 3 fontes alertam simultaneamente para mesmo target:

```
Severity_final = max(Zabbix, Wazuh_max_level / 2, Fortigate_severity) + correlation_bonus

correlation_bonus:
  - 3 fontes alertam: +1
  - 2 fontes alertam + tenant_id consistente: +1
  - Multi-tenant impact: +1
```

Exemplo: Wazuh level 12, Zabbix Average, Fortigate Critical, mesmo tenant → final = max(3, 6, 5) + 1 = 7 ≈ S2.

## Quando NÃO correlacionar

- **Eventos administrativos planeados** dentro de janela de manutenção declarada.
- **Onboarding/offboarding de tenant** com audit event marcado.
- **Deploys autorizados** com `cap deploy` rastreado em logs.
- **DR drill** com flag em SecOps calendar.
- **Wazuh rules em modo "tuning"** explicitamente marcadas (não disparam alertas, só registam).

---

## Fontes

- **NIST SP 800-92** — Guide to Computer Security Log Management.
- **NIST SP 800-61r2** §3.2 — Detection and Analysis.
- **MITRE ATT&CK** — correlation across data sources.
- **Wazuh correlation engine** documentation.
- WIRE.PRC.IRT.005, WIRE.PRC.AUD.004.

## Como usar este template em sessão Claude Code

A skill `prumo-saas-monitoring` invoca este runbook em `/prumo-saas-health`, ao triagar alertas, e durante post-mortem de incidente para validar se a correlação automática funcionou. Esperar como output: classificação do evento (3-source consistent / partial / false positive likely) + acção recomendada + supressões aplicáveis. O user pode forçar override — a sessão regista o override e razão para audit.

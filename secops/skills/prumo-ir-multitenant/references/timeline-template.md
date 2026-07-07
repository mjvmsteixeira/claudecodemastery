# Timeline Template — Incidente Multi-Tenant Wire

**Skill:** `prumo-ir-multitenant` · **Versão:** v0.4.0 · **Última actualização:** 2026-05-19

> Template referenciado pela skill `prumo-ir-multitenant`. Baseado em NIST SP 800-61r2 §3
> (Detection and Analysis) e ISO/IEC 27035-2:2023 §6.4 (Incident logging). Adapta-se ao contexto
> da sessão; marca `[CONFIRMAR]` campos que dependem de decisões Wire-specific ainda não tomadas.

A timeline é a **fonte primária de verdade factual** sobre o incidente. Tudo o que entrar
em relatório CNCS, comms a clientes, post-mortem, ou audit log deriva daqui. Regra de ouro:
**se não está na timeline, não aconteceu.**

## Header da timeline

Obrigatório no topo de cada timeline (ficheiro `${PRUMO_FORENSICS_DIR}/wire-<incident-ID>/timeline.md`):

```markdown
# Incidente wire-ir-2026-0519-001

- **incident_id:** wire-ir-2026-0519-001
- **severity (current):** S1
- **severity (initial):** S2
- **opened_at:** 2026-05-19T08:32:14Z
- **closed_at:** TBD
- **scribe:** mjvmst (primary) · ana.silva (backup)
- **ir_lead:** carlos.rocha
- **products_affected:** wirePAPER, wireDESK
- **tenants_affected:** 5 (NIPCs 501234567, 502345678, 503456789, 504567890, 505678901)
- **vector (suspected):** supply-chain — Ruby gem `rack-attack` v6.7.1
- **vault_case_path:** secret/data/ir/wire-ir-2026-0519-001
```

`incident_id` formato: `wire-ir-YYYY-MMDD-NNN` (NNN sequencial dentro do dia, começa em 001).

## Formato das rows

Cada evento é uma row markdown numa única tabela:

```markdown
| UTC                  | source        | sev | action                                                                  | actor              | status         |
|----------------------|---------------|-----|-------------------------------------------------------------------------|--------------------|----------------|
| 2026-05-19T08:32:14Z | Wazuh         | S2  | Alert rule_id 100012 — PSQL auth fails > threshold em wirePAPER (5 ten) | prumo-monitor-01    | investigating  |
| 2026-05-19T08:35:01Z | human         | S2  | Pivot → S1: pattern matches CVE-2026-XXXX explotation                   | carlos.rocha       | escalated      |
| 2026-05-19T08:40:55Z | Fortigate     | S1  | Block applied: src IP 1.2.3.4 rate-limit em todas as regiões            | prumo-srv-saas-01   | contained      |
| 2026-05-19T08:45:12Z | vault-audit   | S1  | Token `s.xxx` revoked; AppRole `wire-tenant` secret-id rotated          | mjvmst             | contained      |
| 2026-05-19T09:10:00Z | communication | S1  | Comms inicial enviado a 5 munícipios via canal contratado               | DPO                | communicated   |
| 2026-05-19T09:25:33Z | human         | S1  | Decision: rollback wirePAPER para v3.14.2 (versão pré-CVE)              | ir_lead            | recovering     |
```

## Colunas

| Coluna | Descrição | Domínio |
|--------|-----------|---------|
| `UTC` | Timestamp ISO-8601 com `Z`. Nunca local time. | `YYYY-MM-DDTHH:MM:SSZ` |
| `source` | Origem do evento | `Wazuh` / `Fortigate` / `Zabbix` / `human` / `synthetic` / `vault-audit` / `communication` / `capistrano` |
| `sev` | Severity **no momento do evento** (pode mudar) | `S1` / `S2` / `S3` / `S4` |
| `action` | Frase factual, 1 linha. Sem opinião. Sem culpa. | texto livre, ≤ 200 chars |
| `actor` | Quem fez a acção (humano ou agente) | username, `wire-*-01`, ou sistema |
| `status` | Estado do incidente após este evento | `open` / `investigating` / `escalated` / `contained` / `eradicated` / `recovering` / `closed` / `communicated` |

## Convenções

### Granularidade

- **Eventos automatizados (Wazuh/Fortigate/Zabbix/vault-audit):** uma row por evento canónico (rule_id + janela). Não inundar — agregar bursts pelo `same_field` da rule.
- **Eventos humanos:** uma row por **decisão** ou **acção significativa**. Discussões em bridge não vão para a timeline; só o veredicto.
- **Comunicações:** uma row por audiência distinta (interno-wire, cliente-X, CNCS, parceiro-Y).

### Anonimização

- Em timelines **internas:** NIPCs e nomes de munícipios em claro.
- Em timelines **partilhadas com cliente:** apenas o próprio NIPC do cliente em claro; outros como `tenant-A`, `tenant-B`.
- Em timelines **para CNCS:** todos os NIPCs em claro (autoridade competente vê tudo).
- **Nunca** colocar PII de cidadãos finais (nomes, NIFs individuais, moradas) na timeline. Esses ficam em `evidence/<artefact-hash>.enc` cifrados via `transit/encrypt/forensics`.

### UTC strict

Toda a maquinaria Wire (Wazuh, Fortigate, Zabbix, Vault, servidores Rails) corre em UTC. NTP sync verificado em `/prumo-stack-doctor`. Se um actor humano em Portugal escrever "10:32 da manhã", o scribe converte para UTC antes de registar.

### Severity rollover

Quando a severity muda, uma row dedicada regista a mudança com `action` na forma `"Pivot S2 → S1: <razão de uma frase>"`. As rows subsequentes usam o novo valor.

## Status state machine

```
open ──► investigating ──► contained ──► eradicated ──► recovering ──► closed
                │                                          │
                └──► escalated ──► (re-entry em investigating com nova severity)
                                                           │
                            communicated  ◄─────────────────┘ (paralelo, qualquer fase)
```

`communicated` não termina a state machine — é evento paralelo. Não usar `closed` antes de **todas as comms regulatórias** estarem submetidas (CNCS, CNPD se aplicável, clientes afectados).

## Exemplo preenchido (excerto)

```markdown
# Incidente wire-ir-2026-0519-001

- **incident_id:** wire-ir-2026-0519-001
- **severity (current):** S1
- **severity (initial):** S2
- **opened_at:** 2026-05-19T08:32:14Z
- **closed_at:** 2026-05-19T14:22:50Z
- **scribe:** mjvmst
- **ir_lead:** carlos.rocha
- **products_affected:** wirePAPER
- **tenants_affected:** 5

| UTC                  | source      | sev | action                                                                   | actor            | status        |
|----------------------|-------------|-----|--------------------------------------------------------------------------|------------------|---------------|
| 2026-05-19T08:32:14Z | Wazuh       | S2  | Rule 100012 — PSQL auth fails 50+ em wirePAPER (5 tenants distintos)     | prumo-monitor-01  | investigating |
| 2026-05-19T08:33:50Z | Fortigate   | S2  | IPS hit srcip 1.2.3.4 sig "rack-attack-bypass-attempt" 14 ocorrências    | prumo-monitor-01  | investigating |
| 2026-05-19T08:35:01Z | human       | S2  | Pivot → S1: Wazuh+Fortigate match CVE-2026-XXXX exploit pattern          | carlos.rocha     | escalated     |
| 2026-05-19T08:36:30Z | human       | S1  | Bridge CSIRT aberta; DPO + CISO online                                   | carlos.rocha     | escalated     |
| 2026-05-19T08:40:55Z | Fortigate   | S1  | Block src 1.2.3.4 + /24 aplicado nas 3 regiões perímetro                 | prumo-srv-saas-01 | contained     |
| 2026-05-19T08:45:12Z | vault-audit | S1  | Rotated secret-id AppRole wire-tenant; tokens activos revoked            | mjvmst           | contained     |
| 2026-05-19T09:10:00Z | comms       | S1  | Email inicial a 5 munícipios via canal contratado (template-cliente)     | DPO              | communicated  |
| 2026-05-19T09:25:33Z | human       | S1  | Decision: rollback wirePAPER para v3.14.2 (Capistrano)                   | ir_lead          | recovering    |
| 2026-05-19T09:48:01Z | capistrano  | S1  | cap production deploy:rollback wirePAPER concluído                       | prumo-deploy-01   | recovering    |
| 2026-05-19T10:15:00Z | Zabbix      | S1  | Triggers wirePAPER back to OK em 5/5 tenants                             | prumo-monitor-01  | recovering    |
| 2026-05-19T12:00:00Z | comms       | S1  | Notificação CNCS submetida (early warning, ref CNCS-2026-0519-001)       | DPO              | communicated  |
| 2026-05-19T14:22:50Z | human       | S1  | Closure: 72h monitor reforçado activado; post-mortem agendado 2026-05-22 | carlos.rocha     | closed        |
```

---

## Fontes

- **NIST SP 800-61r2** §3.2.4 — Incident documentation.
- **ISO/IEC 27035-2:2023** §6.4 — Incident logging requirements.
- **ISO 8601:2019** — formato de timestamps UTC.
- WIRE.PRC.IRT.005 — Procedimento IR Wire (referência interna).

## Como usar este template em sessão Claude Code

A skill `prumo-ir-multitenant` invoca este template no início de um incidente para criar `${PRUMO_FORENSICS_DIR}/wire-<id>/timeline.md` e em cada evento subsequente para adicionar rows. Esperar como output: timeline auto-actualizada após cada decisão ou alert agregado. O user mantém controlo total — qualquer row pode ser editada manualmente, mas alterações pós-closure exigem `audit-note` na própria timeline.

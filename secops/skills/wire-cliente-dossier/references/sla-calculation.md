# Cálculo de SLA — Fórmulas e Exclusões Wire

**Skill:** `wire-cliente-dossier` · **Versão:** v0.4.0 · **Última actualização:** 2026-05-19

> Template referenciado pela skill `wire-cliente-dossier`. Define como Wire calcula uptime,
> MTTR, MTTD e exclusões contratuais. Baseado em práticas SRE (SLI/SLO/SLA) e ITIL 4 service
> management. Marca `[CONFIRMAR]` campos Wire-specific.

A medição de SLA é fonte de penalizações contratuais e de confiança — tem de ser **defensável,
auditável e reproduzível**. As fórmulas abaixo são as canónicas; os dados vêm do Zabbix
(disponibilidade activa) cruzado com Wazuh (eventos) e timeline de incidentes (`wire-ir-*`).

## Definições base

| Termo | Definição |
|-------|-----------|
| **SLI** | Service Level Indicator — métrica medida (ex: uptime real). |
| **SLO** | Service Level Objective — alvo interno (ex: 99.95%). |
| **SLA** | Service Level Agreement — compromisso contratual (ex: 99.9%, com penalização). |
| **MTTD** | Mean Time To Detect — tempo médio entre início de falha e detecção. |
| **MTTR** | Mean Time To Recover — tempo médio entre detecção e restauro completo. |
| **Downtime** | Período em que o serviço está indisponível ou degradado abaixo do limiar contratado. |

Convenção Wire: SLO é sempre **mais apertado** que SLA (margem de segurança). Reportamos SLI
real ao cliente; alertamos internamente quando SLI se aproxima do SLO.

## Uptime

### Fórmula

```
uptime% = (período_total - downtime_total) / período_total × 100
```

Onde:
- `período_total` = duração do mês de medição em minutos (ex: 30 dias = 43200 min).
- `downtime_total` = soma de todos os períodos de indisponibilidade contável (após exclusões).

### Exemplo

```
Mês de Maio 2026 (31 dias): período_total = 44640 min
Downtime contável: 27 min (1 incidente S2)
uptime = (44640 - 27) / 44640 × 100 = 99.9395% ≈ 99.94%
```

### Tabela de equivalência (downtime mensal permitido)

| SLA alvo | Downtime/mês (31d) | Downtime/ano |
|----------|---------------------|---------------|
| 99.0% | 446 min (7h26m) | 87.6h |
| 99.5% | 223 min (3h43m) | 43.8h |
| 99.9% | 44.6 min | 8.76h |
| 99.95% | 22.3 min | 4.38h |
| 99.99% | 4.46 min | 52.6 min |

Wire SLA típico: 99.9% para produtos standard, 99.5% para produtos low-criticality (ex: wireMEET)
`[CONFIRMAR — alvos contratuais reais por produto]`.

## MTTD — Mean Time To Detect

```
MTTD = Σ(detecção_i - início_falha_i) / N_incidentes
```

- `início_falha`: timestamp do primeiro evento da falha (do Zabbix/Wazuh, não da reclamação).
- `detecção`: timestamp do primeiro alerta accionável (rule Wazuh level ≥ 10 ou trigger Zabbix High+).

Reportar **P50** (mediana) e **P95**:

```
MTTD P50: mediana dos tempos de detecção
MTTD P95: 95º percentil (worst-case típico)
```

Exemplo:
```
Incidentes 12m com tempos de detecção (min): [2, 4, 6, 6, 8, 14, 22]
MTTD P50 = 6 min
MTTD P95 = ~20 min (interpolado)
```

Alvo Wire: MTTD P95 ≤ 15 min para S1/S2 `[CONFIRMAR]`.

## MTTR — Mean Time To Recover

```
MTTR = Σ(recuperação_completa_i - detecção_i) / N_incidentes
```

- `detecção`: igual a MTTD.
- `recuperação_completa`: timestamp do status `recovering → closed` na timeline, confirmado por
  Zabbix triggers de volta a OK.

Reportar **P50** e **P95**:

```
MTTR P50: mediana
MTTR P95: 95º percentil
```

Exemplo:
```
Incidentes 12m com tempos de recuperação (min): [22, 45, 47, 60, 72, 125, 240]
MTTR P50 = 60 min
MTTR P95 = ~210 min
```

Alvo Wire SLA: MTTR ≤ 4h (240 min) para produtos standard.

## Exclusões do downtime contável

Nem todo o downtime conta para o SLA. Exclusões (têm de estar no contrato):

### 1. Janelas de manutenção planeada

- Aviso prévio ≥ **48h** ao município.
- Dentro de janela de baixo tráfego acordada `[CONFIRMAR — janela canónica, ex: domingo 02:00-06:00 UTC]`.
- Limitada a [N] horas/mês `[CONFIRMAR]`.
- **Não conta** como downtime se cumprir aviso prévio + janela acordada.

### 2. Força maior

- Falha de infraestrutura de terceiros fora do controlo Wire (ex: outage AWS region-wide
  documentado, falha de telecom nacional).
- Ataques DDoS de escala excepcional além da capacidade de mitigação contratada `[CONFIRMAR —
  threshold]`.
- Requer documentação + comunicação ao cliente.

### 3. Causa do cliente

- Indisponibilidade causada por configuração/integração do lado do município.
- Uso fora dos termos de utilização.

### 4. Degradação parcial vs indisponibilidade total

Política Wire: degradação que mantém o serviço **funcional mas lento** (ex: P95 latency 2x
baseline) conta como **downtime parcial** com peso `[CONFIRMAR — fórmula de weighting, ex:
0.5× minutos]`. Indisponibilidade total (5xx, timeout) conta a 1.0×.

## Fórmula consolidada de downtime contável

```
downtime_contável = downtime_total
                  - manutenção_planeada_avisada
                  - força_maior_documentada
                  - causa_cliente
                  × peso_degradação_parcial
```

## Cálculo de penalização contratual

Quando SLI < SLA:

```
Se uptime_real < SLA_contratado:
  déficit = SLA_contratado - uptime_real
  penalização = tabela_contratual(déficit)
```

Exemplo de tabela típica `[CONFIRMAR — valores contratuais reais]`:

| Déficit de uptime | Penalização (% mensalidade) |
|--------------------|------------------------------|
| 0.0% - 0.1% | 0% (dentro de tolerância) |
| 0.1% - 0.5% | 5% |
| 0.5% - 1.0% | 10% |
| > 1.0% | 25% + revisão de contrato |

## Fontes de dados (rastreabilidade)

| Métrica | Fonte primária | Fonte de validação |
|---------|----------------|---------------------|
| Uptime | Zabbix synthetic checks + `wire.puma.workers.total` | Wazuh availability events |
| Início de falha | Zabbix trigger timestamp | Wazuh first alert |
| Detecção | Wazuh rule ≥10 OR Zabbix High+ | timeline `investigating` |
| Recuperação | timeline `closed` + Zabbix OK | Wazuh recovery confirmation |
| Downtime parcial | Zabbix latency/error triggers | OTel traces |

Toda a medição é arquivada mensalmente em `secret/data/compliance/sla/<NIPC>/<YYYY-MM>.json`
com os dados-fonte para auditoria.

## Reconciliação

Discrepâncias entre fontes resolvem-se por hierarquia:
1. Timeline de incidente (`wire-ir-*`) — fonte de verdade para início/fim de incidentes manuais.
2. Zabbix — fonte para disponibilidade contínua automatizada.
3. Wazuh — fonte para detecção.

Se Zabbix diz "down" mas não há incidente registado, investigar (silent failure de monitorização
ou falso positivo). Esta reconciliação é parte do report SLA mensal.

## Anti-patterns

- **Calcular uptime sem excluir manutenção** — penaliza Wire por janelas legítimas.
- **Usar tempo de reclamação como início de falha** — infla MTTD; usar primeiro evento Zabbix/Wazuh.
- **Reportar só média de MTTR** — esconde caudas; reportar P50 + P95.
- **Excluir downtime sem documentação** — quebra confiança e auditabilidade.
- **Confundir SLO (interno) com SLA (contratual)** — reportar SLI real, comparar com SLA.

---

## Fontes

- **Google SRE Book** — Service Level Objectives chapter (SLI/SLO/SLA, error budgets).
- **ITIL 4** — Service Level Management practice.
- **ISO/IEC 20000-1:2018** — Service management system requirements.
- WIRE.MTZ.SEC.006, contratos-tipo Wire `[CONFIRMAR — referência]`.

## Como usar este template em sessão Claude Code

A skill `wire-cliente-dossier` invoca este template em `/wire-cliente-dossier <municipio>` (secção SLA) ou em report SLA mensal. Esperar como output: uptime/MTTD/MTTR calculados com fontes-dados rastreáveis + comparação vs SLA contratado + penalização aplicável. O user revê exclusões antes de comunicar ao cliente; a sessão sinaliza qualquer exclusão sem documentação suficiente.

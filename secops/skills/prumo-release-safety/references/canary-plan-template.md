# Canary Plan Template — Release Multi-Tenant Wire

**Skill:** `prumo-release-safety` · **Versão:** v0.4.0 · **Última actualização:** 2026-05-19

> Template referenciado pela skill `prumo-release-safety`. Baseado em práticas de progressive
> delivery (canary releases) adaptadas a Capistrano + VMs nativas (sem orquestrador). Marca
> `[CONFIRMAR]` campos Wire-specific.

A Wire não tem Kubernetes — o canary é feito por **rollout faseado de pools de servidores e
de munícipios**, com gates explícitos entre cada fase. Nenhum `cap production deploy` global
sem este plano aprovado por `/prumo-release-gate`.

## Princípio

```
1% → 10% → 50% → 100%
```

Mas em vez de "% de tráfego" (que exigiria service mesh), Wire mede em **% de munícipios** e
**pools de servidores**:

- **Fase 0 (canary interno):** staging multi-tenant com 5 munícipios sentinel sintéticos.
- **Fase 1 (1%):** 1-2 munícipios voluntários low-risk (não-críticos).
- **Fase 2 (10%):** ~17 munícipios, mistura de tier.
- **Fase 3 (50%):** ~87 munícipios, ambos os pools (A e B) parcialmente.
- **Fase 4 (100%):** todos os 174 munícipios.

## Cabeçalho do plano

```markdown
# Canary Plan — wire[PRODUCT] v[VERSION]

**Produto:** wire[PRODUCT]
**Versão actual:** v[CURRENT]
**Versão alvo:** v[TARGET]
**Pool:** [A/B]
**Rails version:** [VERSION]
**Deploy method:** Capistrano (cap production deploy)
**Migrations incluídas:** [SIM/NÃO — se SIM, ver rollback-template.md §reversibilidade]
**Release manager:** [NOME]
**Aprovação gate:** [/prumo-release-gate ref]
**Data início:** [TIMESTAMP_UTC]
```

## Gates entre fases

Cada transição de fase exige **todos** os gates verdes durante a janela de observação:

| Gate | Métrica | Threshold | Janela observação |
|------|---------|-----------|-------------------|
| **SLO uptime** | Disponibilidade do produto na fase | ≥ 99.9% | 30 min mínimo |
| **Error rate 5xx** | Rails 5xx rate (Zabbix `wire.rails.requests.5xx.rate`) | ≤ baseline + 0.5pp | 30 min |
| **P95 latency** | `wire.rails.requests.p95_ms` | ≤ baseline × 1.2 | 30 min |
| **P99 latency** | `wire.rails.requests.p99_ms` | ≤ baseline × 1.5 | 30 min |
| **P1 alerts** | Wazuh level ≥ 12 relacionados ao produto | 0 | toda a fase |
| **Customer issues** | Tickets abertos por munícipios da fase | 0 críticos | toda a fase |
| **DB health** | Replication lag, pool exhaustion (Zabbix Wire-DB) | nominal | toda a fase |
| **Tenant isolation** | Wazuh rule 100020-100029 (RLS bypass) | 0 | toda a fase |

Se **qualquer** gate falhar → **HOLD** automático. Se gate falhar com degradação → **ROLLBACK**
(ver `rollback-template.md`).

## Fases detalhadas

### Fase 0 — Canary interno (staging)

```markdown
## Fase 0 — Staging multi-tenant

- Ambiente: staging.wire.internal
- Tenants: 5 sentinel sintéticos (dados representativos, sem PII real)
- Duração mínima: 1h
- Validações:
  - [ ] Migrations aplicam e revertem limpo (dry-run reversibility)
  - [ ] Smoke test funcional por produto
  - [ ] RLS sentinel queries devolvem baseline esperado
  - [ ] Zero regressões em test suite (CI verde)
  - [ ] SBOM gerado, dependency scan sem CVE crítico novo
- Gate de saída: todos os checks ✓ + aprovação SecOps (N1)
```

### Fase 1 — 1% (munícipios voluntários)

```markdown
## Fase 1 — 1% (1-2 munícipios low-risk)

- Tenants: [NIPC_A], [NIPC_B] (voluntários, tier não-crítico)
- Servidores: 1 servidor do pool isolado para estes tenants [CONFIRMAR — viabilidade routing]
- Duração mínima: 2h (incluindo pico de uso esperado)
- Comunicação prévia: munícipios avisados da janela (canary opt-in)
- Gates: todos os 8 da tabela
- Gate de saída: 8 gates verdes em 2h + zero customer issues + aprovação SecOps (N1)
```

### Fase 2 — 10%

```markdown
## Fase 2 — 10% (~17 munícipios)

- Tenants: mistura de tiers, ambos os pools
- Duração mínima: 4h (cobrir período de pico)
- Gates: todos os 8
- Atenção especial: comparar métricas Fase 1 vs Fase 2 — degradação relativa indica problema
  que só aparece com escala
- Gate de saída: 8 gates verdes em 4h + comparação OK vs Fase 1 + aprovação SecOps (N1)
```

### Fase 3 — 50%

```markdown
## Fase 3 — 50% (~87 munícipios)

- Tenants: ~50% de cada pool
- Duração mínima: 8h (ciclo diário completo + overnight batch)
- Gates: todos os 8 + DB capacity headroom check (pool não saturado)
- Atenção: background jobs queue não deve crescer; batch nocturno deve correr limpo
- Gate de saída: 8 gates verdes em 8h incluindo overnight + aprovação SecOps Lead (N2 — cross-tenant)
```

### Fase 4 — 100%

```markdown
## Fase 4 — 100% (174 munícipios)

- Tenants: todos
- Duração observação reforçada: 72h pós-deploy
- Gates: todos os 8 + monitorização reforçada
- Comunicação: changelog publicado (ver changelog-template.md)
- Gate de saída: 72h estáveis → release marcada como "stable", canary plan arquivado
```

## Critérios de HOLD vs ROLLBACK

| Situação | Acção |
|----------|-------|
| Gate latência marginalmente excedido, sem impacto cliente | HOLD — investigar antes de avançar |
| Error rate elevado mas auto-recuperando | HOLD — observar mais 30 min |
| P1 alert (Wazuh ≥12) relacionado | ROLLBACK imediato |
| Customer issue crítico (serviço indisponível para tenant) | ROLLBACK |
| RLS bypass signal (rule 100020+) | ROLLBACK + IR triage |
| DB pool exhaustion sustained | ROLLBACK |
| Migration irreversível com problema | escalation N3 (CTO) — rollback pode não ser possível |

## Comunicação durante o canary

- **Fase 0-2:** interno apenas (`#secops-deploys`).
- **Fase 3:** notificação leadership.
- **Fase 4 (100%):** changelog público; munícipios afectados por changes notáveis avisados.
- **Em qualquer ROLLBACK:** ver `distribuicao-classificacao.md` (skill IR) se o rollback decorre
  de incidente.

## Rastreabilidade

Cada fase regista em `~/.prumo/log/canary-<product>-<version>.log`:
- Timestamp início/fim de cada fase.
- Métricas snapshot em cada gate.
- Decisão (PROCEED / HOLD / ROLLBACK) + actor + razão.
- Tenants em cada fase.

---

## Fontes

- **Progressive Delivery patterns** (Canary, Blue-Green) — adaptados a infra VM nativa.
- **Google SRE Book** — Canarying Releases chapter.
- **Capistrano 3** deploy lifecycle.
- WIRE.PRC.IRT.005 (rollback como contenção), WIRE.MTZ.SEC.006.

## Como usar este template em sessão Claude Code

A skill `prumo-release-safety` invoca este template em `/prumo-release-gate <release>` para gerar plano canary antes de qualquer deploy production. Esperar como output: plano 5-fase preenchido com produto, versão, tenants por fase, gates, e baselines actuais (puxados do Zabbix). O avanço entre fases requer aprovação humana (N1/N2 conforme fase); a sessão monitoriza gates e recomenda PROCEED/HOLD/ROLLBACK, nunca avança autonomamente.

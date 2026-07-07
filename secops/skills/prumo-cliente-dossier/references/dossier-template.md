# Dossier de Cliente — Vista 360° por Município

**Skill:** `prumo-cliente-dossier` · **Versão:** v0.4.0 · **Última actualização:** 2026-05-19

> Template referenciado pela skill `prumo-cliente-dossier`. Consolida a relação completa Wire ↔
> município: produtos, SLA, incidentes, contratos, conformidade, contactos. Marca `[CONFIRMAR]`
> campos Wire-specific.

O dossier é a **vista única** sobre um município cliente. É consultado antes de reuniões
comerciais, durante incidentes (contexto rápido), em auditorias, e em renovação contratual.
Gerado por `/prumo-cliente-dossier <municipio>`.

## Cabeçalho

```markdown
# Dossier — Município de [NOME]

**NIPC:** [NIPC]
**Tier:** [crítico / standard / piloto]  [CONFIRMAR — classificação canónica]
**Cliente desde:** [DATA]
**Gestor de conta:** [NOME]
**DPO município (contacto):** [NOME], [EMAIL], [TELEFONE]
**Vault metadata:** secret/data/tenants/metadata/[NIPC]
**Dossier gerado:** [TIMESTAMP_UTC]
**Período de análise:** últimos 12 meses
```

## §1 — Produtos contratados

```markdown
## 1. Produtos wire* contratados

| Produto | Versão Rails | Pool | Data activação | Estado | Utilizadores activos |
|---------|--------------|------|-----------------|--------|----------------------|
| wirePAPER | 6.1 | A | 2023-03-15 | Activo | [N] |
| wireFORMS | 6.1 | B | 2024-01-10 | Activo | [N] |
| wireMEET | 7.1 | B | 2025-06-01 | Activo | [N] |

Produtos NÃO contratados (oportunidade comercial): wireDESK, wireSTUDIO, wireCITYapp,
wireRECRUIT, wireDOCS, wireVOICE, wireCONNECT.
```

## §2 — SLA (12 meses)

```markdown
## 2. Cumprimento de SLA — últimos 12 meses

| Produto | Uptime alvo | Uptime real | MTTR alvo | MTTR real | MTTD real | Estado |
|---------|-------------|-------------|-----------|-----------|-----------|--------|
| wirePAPER | 99.9% | 99.94% | ≤4h | 1h12m | 6m | ✓ CUMPRIDO |
| wireFORMS | 99.9% | 99.87% | ≤4h | 2h05m | 14m | ⚠ MARGINAL |
| wireMEET | 99.5% | 99.98% | ≤4h | 0h45m | 4m | ✓ CUMPRIDO |

Detalhe de cálculo: ver sla-calculation.md
Penalizações contratuais aplicáveis: [SIM/NÃO — wireFORMS abaixo de alvo em [MÊS]]
```

## §3 — Incidentes (12 meses)

```markdown
## 3. Incidentes — últimos 12 meses

| Incident ID | Data | Severity | Produto | Duração | Impacto neste município | CNPD notificado? |
|-------------|------|----------|---------|---------|--------------------------|-------------------|
| wire-ir-2026-0519-002 | 2026-05-19 | S2 | wireFORMS | 47m | IDOR cross-tenant — 18 fichas expostas | SIM (via município) |
| wire-ir-2025-1103-001 | 2025-11-03 | S3 | wirePAPER | 2h | Degradação latência | NÃO |

Total incidentes: 2 (1× S2, 1× S3)
Incidentes com impacto em dados pessoais: 1
Comunicações regulatórias: 1 (CNPD via município, dossier técnico entregue)
Post-mortems disponíveis: wire-ir-2026-0519-002 (interno + sumário cliente)
```

## §4 — Contratos

```markdown
## 4. Situação contratual

- **Contrato principal:** [REF] — assinado [DATA], vigência até [DATA]
- **Renovação:** [automática / negociação em curso / a expirar em [N] dias]
- **DPA (Art. 28):** assinado [DATA], revisão últimos 24m? [SIM/NÃO]
- **Anexo II (subcontratação):** [presente / em falta]
- **SLA contratado:** ver §2 (alvos)
- **Cláusulas especiais:** [LISTA — ex: residência de dados PT-only, restore window específico]
- **Valor anual:** [VALOR] [CONFIRMAR — se incluir info comercial no dossier técnico]
```

## §5 — Conformidade e DPIA

```markdown
## 5. Conformidade

- **DPIA aplicável:** [LISTA de produtos que processam PII em larga escala]
  - wireFORMS: DPIA v2.1 (2025-09) — risco residual BAIXO-MÉDIO
  - wirePAPER: DPIA v1.4 (2024-12) — risco residual BAIXO
- **Auditoria isolamento (último score):** [X]/80 ([%]) — ver prumo-tenant-isolation
- **Última auditoria:** [DATA]
- **Próxima auditoria:** [DATA]
- **Gaps abertos:** [LISTA de CTRL-W-T-* em WARN/FAIL]
```

## §6 — Postura de isolamento (resumo)

```markdown
## 6. Isolamento multi-tenant

Score global: [X]/80 ([%])

Controlos em atenção:
- CTRL-W-T-008 (audit log self-service) — WARN
- CTRL-W-T-010 (WAF per-tenant) — WARN (gap sistémico, não específico deste tenant)

Tenant key Vault: transit/keys/tenant-[NIPC] — última rotação [DATA]
RLS: [N] policies activas — última validação [DATA] — sem bypasses detectados
```

## §7 — Contactos

```markdown
## 7. Contactos

### Lado município
- **Responsável de tratamento (DPO):** [NOME], [EMAIL], [TELEFONE]
- **Contacto técnico/IT:** [NOME], [EMAIL]
- **Contacto operacional 24/7:** [CANAL]
- **Decisor (Vereador/Presidente CM):** [NOME]

### Lado Wire
- **Gestor de conta:** [NOME]
- **SecOps de referência:** prumo-monitor-01 / [HUMANO de plantão]
- **DPO Wire:** [NOME]
- **Canal de incidente:** [CANAL_CONTRATADO]
```

## §8 — Histórico de comunicações

```markdown
## 8. Comunicações relevantes (12 meses)

| Data | Tipo | Assunto | Resultado |
|------|------|---------|-----------|
| 2026-05-19 | Incident comms | wire-ir-2026-0519-002 (IDOR) | Dossier CNPD entregue |
| 2026-02-15 | Renovação DPA | Revisão anual DPA | Assinado |
| 2025-11-03 | Incident comms | wire-ir-2025-1103-001 | Resolvido, sem PII |
```

## §9 — Acções abertas

```markdown
## 9. Acções pendentes

| Acção | Owner | Prazo | Prioridade |
|-------|-------|-------|------------|
| Implementar self-service audit export (CTRL-W-T-008) | Product | Q3 2026 | Média |
| Testar offboarding em sandbox (CTRL-W-T-014) | SecOps | Q3 2026 | Baixa |
| Follow-up pós-incidente wire-ir-2026-0519-002 (T+30d post-mortem) | SecOps | 2026-06-18 | Alta |
| Oportunidade comercial: wireDESK | Gestor conta | — | — |
```

## Sumário executivo (topo, gerado por último)

```markdown
## Sumário executivo — Município de [NOME]

- **Relação:** cliente desde [ANO], [N] produtos contratados, tier [TIER].
- **SLA:** [N-1] de [N] produtos a cumprir; wireFORMS marginal em [MÊS].
- **Incidentes 12m:** [N] ([severidades]). 1 com impacto em dados pessoais (resolvido).
- **Isolamento:** score [%] — postura [sólida/atenção].
- **Conformidade:** DPA actualizado, DPIA por produto, [N] gaps abertos (não-críticos).
- **Risco relacional:** [BAIXO/MÉDIO/ALTO] — [justificação curta].
- **Oportunidades:** [produtos não contratados relevantes].
```

## Sanitização para uso externo

O dossier completo é **interno**. Se partilhado com o município (ex: review anual):
- Remover info comercial (§4 valor, oportunidades §9).
- Remover detalhe de outros tenants (gaps sistémicos descritos genericamente).
- Manter: SLA do próprio município, incidentes que o afectaram, postura de isolamento do próprio.

## Frequência de geração

- **On-demand:** antes de reuniões, durante incidentes.
- **Trimestral:** geração automática + arquivo em `secret/data/compliance/dossiers/<NIPC>/<YYYY-Qn>.md`.
- **Anual:** versão para review com o município (sanitizada).

---

## Fontes

- **RGPD Art. 28** — relação responsável ↔ subcontratante.
- **DL 20/2025** — fornecedor crítico.
- **WIRE.MTZ.SEC.006** — CTRL-W-T-* + RACI.
- Skills relacionadas: `prumo-tenant-isolation`, `prumo-ir-multitenant`, `prumo-compliance-provider`.

## Como usar este template em sessão Claude Code

A skill `prumo-cliente-dossier` invoca este template em `/prumo-cliente-dossier <municipio>` para consolidar todas as fontes (Vault metadata, audit history, SLA do Zabbix, incidentes do IR case files, contratos). Esperar como output: dossier 360° preenchido + sumário executivo. O user escolhe versão interna (completa) ou externa (sanitizada para review com o município); dados comerciais são opt-in.

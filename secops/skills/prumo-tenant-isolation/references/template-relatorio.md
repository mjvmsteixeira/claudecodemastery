# Template — Relatório de Isolamento (RGPD Art. 28) à Empresa Cliente

**Skill:** `prumo-tenant-isolation` · **Versão:** v0.4.0 · **Última actualização:** 2026-07-07

> Template referenciado pela skill `prumo-tenant-isolation` e pelo comando
> `/prumo-tenant-audit <empresa>`. É o relatório estruturado entregue à empresa cliente
> (responsável pelo tratamento) enquanto evidência do dever de isolamento multi-tenant do
> subcontratante — RGPD Art. 28 §3 al. h) (auditorias e inspecções) + ISO/IEC 27017 §CLD.6.3
> (Customer separation). Percorre os 16 controlos canónicos CTRL-W-T-001..016.
> Marca `[CONFIRMAR]` os campos Wire-specific.

## Cabeçalho

```markdown
# Relatório de Isolamento Multi-Tenant — [EMPRESA]

**Empresa cliente:** [EMPRESA]
**NIF:** [NIF]
**Auditor:** prumo-tenant-01 + revisão humana [NOME]
**Data (UTC):** [DATA_UTC]
**Produtos contratados:** [LISTA_WIRE_PRODUCTS]
**Vault path metadata:** secret/data/tenants/metadata/[NIF]
**Versão template:** v0.4.0
**Enquadramento:** RGPD Art. 28 · ISO/IEC 27017 §CLD.6.3
```

## Sumário executivo

- **Score global de isolamento:** [X.X]/10
- **Controlos PASS / WARN / FAIL / N/A:** [P] / [W] / [F] / [N]
- **Conclusão:** `[CONFIRMAR: isolamento adequado / com reservas / com não-conformidades]`

## Os 16 controlos CTRL-W-T-*

Uma row por controlo. Manter a numeração canónica (não reordenar).

```markdown
| Controlo | Descrição | Método de validação | Evidência | Score (1-5) | Estado |
|----------|-----------|---------------------|-----------|-------------|--------|
| CTRL-W-T-001 | [DESCRICAO] | [METODO] | [EVIDENCIA] | [SCORE] | [PASS/WARN/FAIL/N/A] |
| ...          | ...         | ...       | ...         | ...     | ... |
| CTRL-W-T-016 | [DESCRICAO] | [METODO] | [EVIDENCIA] | [SCORE] | [PASS/WARN/FAIL/N/A] |
```

> A lista descritiva completa dos 16 controlos vive em `queries-evidencia.md` (métodos) e no
> painel consolidado (`painel-template.md`). Este ficheiro é o **contentor de entrega**; não
> duplicar aqui a definição dos controlos.

## Não-conformidades e plano de remediação

Para cada controlo FAIL/WARN:
- **Controlo:** `[CTRL-W-T-NNN]`
- **Lacuna:** `[LACUNA]`
- **Risco:** `[RISCO]`
- **Acção proposta + prazo:** `[ACCAO]` — `[PRAZO]`

## Declaração final

`[CONFIRMAR]` — declaração assinada digitalmente pelo responsável Wire, com referência ao
Vault path de evidência e à retenção do relatório.

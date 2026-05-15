# Formato de relatório — estrutura canónica

Todos os audits do `wiremaze-devkit` usam esta estrutura no modo interactivo
(não-`--ci`). As `SKILL.md` referenciam este ficheiro.

## Estrutura

```
=== RESUMO EXECUTIVO ===
<Dimensão>: X CRITICAL, Y HIGH, Z MEDIUM, W LOW
TOTAL DE ISSUES: N

=== CRITICAL ===
Para cada finding:
  - Ficheiro: caminho:linha
  - Problema: o que está errado
  - Impacto: o que acontece se não for corrigido
  - Correcção: o que vai ser feito

=== HIGH ===     [mesmo formato]
=== MEDIUM ===   [mesmo formato]
=== LOW ===      [mesmo formato]

=== SCORE ===
(ver shared/scoring.md)

=== PLANO DE ACÇÃO ===
1. CRITICAL — corrigir imediatamente
2. HIGH — corrigir em 7 dias
3. MEDIUM — próximo sprint
4. LOW — backlog
```

## `--export-report`

Quando `--export-report` é passado, gravar o relatório completo em:

```
docs/<domínio>/<DOMÍNIO>_REPORT_<YYYY-MM-DD>.md
```

Exemplos:
- `docs/security/SECURITY_REPORT_2026-05-14.md`
- `docs/infra/INFRA_REPORT_2026-05-14.md`
- `docs/ux/UX_REPORT_2026-05-14.md`

Criar o directório `docs/<domínio>/` se não existir.

O `full-audit` (orquestrador) usa um caminho consolidado: `docs/audit/FULL_AUDIT_REPORT_<YYYY-MM-DD>.md`.

## Regra de omissão

Nunca omitir findings por serem "menores". Listar TODOS, organizados por severidade.

---
name: full-audit
description: Auditoria completa paralela — security-scan + infra-audit + code-quality + performance-audit + ux-audit (condicional), consolidada com scoring unificado.
---

# /full-audit

Wrapper do skill `full-audit`. Parseia as flags e invoca a skill.

**Read-only por defeito.** Sem `--apply`, gera apenas o relatório consolidado.

## Flags suportadas

- `--apply` — aplicar correcções após o relatório. Cada sub-audit respeita os seus
  próprios safeguards; acções destrutivas pedem confirmação humana individual.
  Default: **off** (report-only).
- `--ci` — modo CI (sem auto-fix, output JSON consolidado, exit code mais severo dos
  audits). Incompatível com `--apply` (CI nunca corrige).
- `--export-report` — gravar relatório consolidado em `docs/audit/FULL_AUDIT_REPORT_<YYYY-MM-DD>.md`

## Acção

Interpretar `$ARGUMENTS` e invocar a skill `full-audit` com os parâmetros correspondentes
(`apply`, `ci`, `export-report`). **Sem argumentos: report-only** — auditoria completa
e relatório consolidado, sem tocar em ficheiros. Para aplicar correcções, o utilizador
tem de passar `--apply` explicitamente.

Seguir a metodologia da skill — não duplicar aqui a lógica de orquestração.

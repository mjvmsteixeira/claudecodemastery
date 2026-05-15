---
name: full-audit
description: Auditoria completa paralela — security-scan + infra-audit + code-quality + performance-audit + ux-audit (condicional), consolidada com scoring unificado.
---

# /full-audit

Wrapper do skill `full-audit`. Parseia as flags e invoca a skill.

## Flags suportadas

- `--ci` — modo CI (sem auto-fix, output JSON consolidado, exit code mais severo dos audits)
- `--export-report` — gravar relatório consolidado em `docs/audit/FULL_AUDIT_REPORT_<YYYY-MM-DD>.md`

## Acção

Interpretar `$ARGUMENTS` e invocar a skill `full-audit` com os parâmetros correspondentes
(`ci`, `export-report`). Sem argumentos: auditoria completa em modo interactivo com
auto-fix de tudo.

Seguir a metodologia da skill — não duplicar aqui a lógica de orquestração.

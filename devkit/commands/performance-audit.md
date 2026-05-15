---
name: performance-audit
description: Audit de performance — bundle size, N+1 queries, I/O bloqueante, queries lentas, resource leaks.
---

# /performance-audit

Wrapper do skill `performance-audit`. Parseia as flags e invoca a skill.

## Flags suportadas

- `--scope=frontend|backend|leaks` — limitar a um ou mais domínios (CSV)
- `--ci` — modo CI (sem auto-fix, output JSON, exit code por severidade)
- `--export-report` — gravar relatório em `docs/performance/PERFORMANCE_REPORT_<YYYY-MM-DD>.md`

## Acção

Interpretar `$ARGUMENTS` e invocar a skill `performance-audit` com os parâmetros
correspondentes (`scope`, `ci`, `export-report`). Sem argumentos: auditar todos os
scopes aplicáveis ao projecto em modo interactivo.

Seguir a metodologia da skill — não duplicar aqui a lógica de audit.

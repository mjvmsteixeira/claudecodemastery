---
name: code-quality
description: Code quality — dead code, arquitectura, complexidade, cobertura de testes.
---

# /code-quality

Wrapper do skill `code-quality`. Parseia as flags e invoca a skill.

## Flags suportadas

- `--scope=dead-code|architecture|complexity|test-coverage` — limitar a um ou mais domínios (CSV)
- `--ci` — modo CI (sem auto-fix, output JSON/SARIF, exit code por severidade)
- `--export-report` — gravar relatório em `docs/code-quality/CODE-QUALITY_REPORT_<YYYY-MM-DD>.md`

## Acção

Interpretar `$ARGUMENTS` e invocar a skill `code-quality` com os parâmetros
correspondentes (`scope`, `ci`, `export-report`). Sem argumentos: auditar todos os
scopes em modo interactivo.

Seguir a metodologia da skill — não duplicar aqui a lógica de audit.

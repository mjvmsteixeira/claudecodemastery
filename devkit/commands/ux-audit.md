---
name: ux-audit
description: UX/UI audit — WCAG 2.1 AA, heurísticas Nielsen, responsividade, design system.
---

# /ux-audit

Wrapper do skill `ux-audit`. Parseia as flags e invoca a skill.

## Flags suportadas

- `--scope=a11y|usability|responsive|design-system|components` — limitar a um ou mais domínios (CSV)
- `--ci` — modo CI (sem auto-fix, output JSON, exit code por severidade)
- `--export-report` — gravar relatório em `docs/ux/UX_REPORT_<YYYY-MM-DD>.md`
- _(o `--update-rules` do command original não é suportado neste plugin — o devkit não empacota templates)_

## Acção

Interpretar `$ARGUMENTS` e invocar a skill `ux-audit` com os parâmetros correspondentes
(`scope`, `ci`, `export-report`). Sem argumentos: auditar todos os scopes em modo interactivo.

Seguir a metodologia da skill — não duplicar aqui a lógica de audit.

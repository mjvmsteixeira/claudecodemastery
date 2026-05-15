---
name: security-scan
description: Scan de vulnerabilidades — dependências, código (OWASP Top 10), secrets, IaC, config. Lang-agnóstico.
---

# /security-scan

Wrapper do skill `security-scan`. Parseia as flags e invoca a skill.

## Flags suportadas

- `--scope=dependencies|code|secrets|config|iac` — limitar a um ou mais domínios (CSV)
- `--min-severity=critical|high|medium` — filtrar por severidade mínima
- `--critical-only` — equivale a `--min-severity=critical`
- `--auto-fix-safe` — aplicar fixes não-disruptivos automaticamente
- `--ci` — modo CI (sem auto-fix, output JSON/SARIF, exit code por severidade)
- `--export-report` — gravar relatório em `docs/security/SECURITY_REPORT_<YYYY-MM-DD>.md`
- _(o `--update-rules` do command original não é suportado neste plugin — o devkit não empacota templates)_

## Acção

Interpretar os argumentos passados em `$ARGUMENTS` e invocar a skill `security-scan`
com os parâmetros correspondentes (`scope`, `min-severity`, `auto-fix-safe`, `ci`,
`export-report`). Sem argumentos: correr todos os scopes em modo interactivo.

Seguir a metodologia da skill — não duplicar aqui a lógica de audit.

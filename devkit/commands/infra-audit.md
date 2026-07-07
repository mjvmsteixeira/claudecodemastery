---
name: infra-audit
description: Audit de infraestrutura — Docker, K8s, systemd, reverse proxy, Ansible, Terraform, CI/CD.
---

# /infra-audit

Wrapper do skill `infra-audit`. Parseia as flags e invoca a skill.

## Flags suportadas

- `--scope=docker|k8s|systemd|proxy|iac|cicd` — limitar a um ou mais domínios (CSV)
- `--ci` — modo CI (sem auto-fix, output JSON, exit code por severidade)
- `--export-report` — gravar relatório em `docs/infra/INFRA_REPORT_<YYYY-MM-DD>.md`
- _(o `--update-rules` do command original não é suportado neste plugin — o devkit não empacota templates)_

## Acção

Interpretar `$ARGUMENTS` e invocar a skill `infra-audit` com os parâmetros
correspondentes (`scope`, `ci`, `export-report`). Sem argumentos: auditar todos os
artefactos de infra detectados em modo interactivo.

Seguir a metodologia da skill — não duplicar aqui a lógica de audit.

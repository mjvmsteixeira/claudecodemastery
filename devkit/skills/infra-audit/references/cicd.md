# CI/CD e build

Referência carregada pela skill `infra-audit` quando o scope inclui `cicd`.

## CI/CD

**GitHub Actions:**
- Actions pinadas a SHA (não tags) para third-party
- `permissions:` minimizado por job
- `secrets:` não logados
- `pull_request_target` com input externo (vulnerável)
- Self-hosted runners isolados
- Concurrency control para evitar deploys concorrentes

**GitLab CI:**
- `protected` branches com `protected variables`
- `image:` pinada
- `retry:` configurado em jobs flaky

**Geral:**
- Branch protection (review obrigatório, status checks)
- Secret scanning activo no repo
- Dependabot/Renovate configurado
- Container image signing (cosign)

## Build / Makefile

- Targets com referências a recursos inexistentes
- Comandos de limpeza com risco (`rm -rf $VAR/`)
- Targets que requerem permissões elevadas sem aviso
- Falta de `.PHONY:`

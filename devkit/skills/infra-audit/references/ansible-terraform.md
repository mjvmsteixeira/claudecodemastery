# Ansible e Terraform — configuration management e IaC

Referência carregada pela skill `infra-audit` quando o scope inclui `iac`.
Para verificações de IaC focadas em segurança, ver também a skill `security-scan`
(reference `iac-checks.md`).

## Ansible

Para projectos com Ansible (playbooks/, roles/):

- `ansible.cfg` com `host_key_checking = True` em prod
- `vault_password_file` não em git
- Roles com `meta/main.yml`
- Tasks com `name:` descritivo
- FQCN em todos os módulos (`ansible.builtin.copy`, não `copy`)
- `become:` justificado
- `no_log: true` em tasks com secrets
- `validate_certs: no` flagrar (excepto homelab justificado)
- `serial:` e `max_fail_percentage:` em playbooks de prod
- Pre-tasks de validação (versão Ansible, vault loaded)
- Idempotência (sem `command`/`shell` quando há módulo)

Lint: `ansible-lint`, `yamllint`.

## Terraform / IaC

- `terraform fmt -check`
- `terraform validate`
- State remoto (não local) em prod, com locking
- `*.tfvars` com secrets fora de git
- Modules versionados (não branch refs)
- `lifecycle.prevent_destroy` em recursos críticos (DBs, DNS zones)
- `tfsec`, `checkov`, `tflint`

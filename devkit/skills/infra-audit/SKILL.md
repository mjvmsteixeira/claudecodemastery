---
name: infra-audit
description: Auditoria de infraestrutura do projecto actual — containers (Docker Compose, Dockerfile), orquestração (Kubernetes), systemd, reverse proxy (nginx/Traefik/Caddy/HAProxy), configuration management (Ansible), IaC (Terraform), CI/CD e build. Linguagem-agnóstico. Dispara em "audita a infra", "infra audit", "revê o docker-compose", "o Dockerfile está bem?", "auditoria de kubernetes", "verifica o nginx", "hardening de systemd". Read-only por defeito. NÃO confundir com auditoria de segurança de código (skill security-scan) — esta foca o operacional: recursos, healthchecks, redes, restart policies, hardening.
---

# infra-audit

Auditoria de infraestrutura linguagem-agnóstica. Read-only por defeito.

## Trigger

- `/infra-audit [flags]`
- `"audita a infra disto"`, `"infra audit"`, `"revê o docker-compose"`, `"auditoria de kubernetes"`

## Parâmetros (passados pelo command ou inferidos do pedido)

- `scope` — um ou mais de `docker|k8s|systemd|proxy|iac|cicd`. Default: todos os detectados.
- `ci` — modo CI. Ver `${CLAUDE_PLUGIN_ROOT}/shared/ci-mode.md`. Default: off.
- `export-report` — gravar relatório. Ver `${CLAUDE_PLUGIN_ROOT}/shared/report-format.md`.

## Metodologia

### 1. Detectar artefactos de infraestrutura

Procurar: `Dockerfile*`/`docker-compose*.yml` (Docker), `*.yaml` com `apiVersion:`+`kind:`
ou `helm/`/`kustomization.yaml` (K8s), `*.service`/`*.timer`/`*.socket` (systemd), `nginx*.conf`/
`traefik.yml`/`Caddyfile`/`haproxy.cfg` (proxy), `playbooks/`/`roles/`/`inventories/`/`ansible.cfg`
(Ansible), `*.tf`/`*.tfvars` (Terraform), `.github/workflows/`/`.gitlab-ci.yml`/
`Jenkinsfile`/`.circleci/config.yml` (CI/CD), `Makefile`/`justfile`/`Taskfile.yml` (build).

Service mesh (Istio, Linkerd) está fora do scope desta versão.

### 2. Carregar regras do projecto

Se existir `rules/audit/infra.md` na raiz do projecto auditado, ler e incorporar
(redes obrigatórias, recursos mínimos, naming de containers, hosts críticos com
aprovação humana, storage backends, constraints de DNS/firewall). Se não existir,
prosseguir com o baseline universal.

### 3. Carregar references conforme o scope

| Scope | Reference |
|-------|-----------|
| `docker` | `references/docker.md` |
| `k8s` | `references/kubernetes.md` |
| `systemd` | `references/systemd.md` |
| `proxy` | `references/reverse-proxy.md` |
| `iac` | `references/ansible-terraform.md` |
| `cicd` | `references/cicd.md` |

### 4. Scoring

Score por dimensão e total conforme `${CLAUDE_PLUGIN_ROOT}/shared/scoring.md`.
As dimensões são os scopes avaliados.

### 5. Relatório

- Modo interactivo: estrutura de `${CLAUDE_PLUGIN_ROOT}/shared/report-format.md`.
  Marcar findings que **bloqueiam deploy** com destaque no plano de acção.
- Modo `ci`: comportamento de `${CLAUDE_PLUGIN_ROOT}/shared/ci-mode.md` — JSON, exit
  code por severidade, sem auto-fix. (Sem SARIF — infra-audit não é audit de código.)
- Com `export-report`: gravar em `docs/infra/INFRA_REPORT_<YYYY-MM-DD>.md`.

### 6. Correcções

**Antes de aplicar qualquer correcção, executar os gates de
`${CLAUDE_PLUGIN_ROOT}/shared/safe-apply.md`** (modo, sample-detection, acções
destrutivas).

Fora de `ci`: depois do relatório, perguntar quais findings corrigir. Editar
`Dockerfile`/`docker-compose*.yml`/`*.tf`/playbooks Ansible/`Jenkinsfile`/workflows
CI exige confirmação humana individual com diff (Gate 3). Em `ci`: nunca corrigir.

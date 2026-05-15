---
name: wire-context-pack
description: Prepara um pack curado de contexto cross-plugin para sessões IR / release / audit — lista skills, commands, agents, paths Vault, AppRoles, logs e one-liners relevantes ao scope escolhido. Não fetch live data; é um cheat-sheet estruturado para primar a sessão.
allowed-tools: Bash, Read
---

# /wire-context-pack `<scope>`

Emite um pack de contexto curado para uma sessão de trabalho específica. Reduz o tempo gasto a lembrar-se "qual a skill?", "que command?", "que AppRole?", "que paths?" — agrupa tudo numa página por scope.

Não fetch live data — é um **cheat-sheet estruturado**. Os comandos sugeridos é que vão buscar estado real quando o utilizador os correr.

## Scope obrigatório

`$ARGUMENTS` deve ser um de: `ir | release | audit | all`.

- Sem argumento ou inválido → mostrar uso e os 4 scopes válidos.

## Detectar plugins instalados (afecta o que mostrar)

```bash
HAS_BASE=0;   find ~/.claude/plugins/cache -path "*/wire-base/*/.claude-plugin/plugin.json"   -print -quit 2>/dev/null | grep -q . && HAS_BASE=1
HAS_SECOPS=0; find ~/.claude/plugins/cache -path "*/wire-secops/*/.claude-plugin/plugin.json" -print -quit 2>/dev/null | grep -q . && HAS_SECOPS=1
HAS_DEVKIT=0; find ~/.claude/plugins/cache -path "*/wire-devkit/*/.claude-plugin/plugin.json" -print -quit 2>/dev/null | grep -q . && HAS_DEVKIT=1
```

Items em packs cujo plugin não está instalado ficam marcados com `(plugin em falta)` e instruções de install.

## Pack: `ir` (Incident Response multi-tenant)

```
=== WIRE CONTEXT PACK · IR ===

Skills (auto-trigger):
  · wire-ir-multitenant       (secops)  — playbook IR end-to-end
  · wire-tenant-isolation     (secops)  — verificações de cross-tenant leak

Commands:
  · /wire-incident-spread <id>           — mapa de propagação cross-tenant
  · /wire-tenant-audit <municipio>       — audit isolado por tenant
  · /wire-stack-doctor                   — diagnóstico global (Wazuh+Fortigate+Zabbix)
  · /wire-cliente-dossier <municipio>    — dossier consolidado por município

Agents (em .claude/agents/ do secops):
  · wire-ir-saas-01    — IR coordinator multi-tenant
  · wire-tenant-01     — isolamento e RLS
  · wire-monitor-01    — correlação Wazuh+Fortigate+Zabbix

Vault — paths e AppRole:
  · AppRole:  wire-ir          (TTL 15m · max 1h)
  · SSH role: wire-ir-role     (cert efémero, TTL 15m)
  · KV: secret/data/ir/<case-id>/*
  · Transit: transit/encrypt/forensics · transit/decrypt/forensics

Logs e telemetria:
  · CEF local: /var/log/wire-secops-cef.log
  · SIEM: Wazuh manager (recebe audit Vault, syslog Fortigate, lograge Rails)
  · Perímetro: Fortigate syslog (anti-DDoS, IPS, WAF)
  · Monitorização activa: Zabbix (agentes, triggers, templates)

One-liners úteis:
  tail -f /var/log/wire-secops-cef.log | grep -i incident
  vault token lookup -format=json | jq '.data.{policies,ttl,expire_time}'
  vault list ssh/roles/wire-ir-role

Princípios:
  · N2 obrigatório para queries cross-tenant
  · Second-opinion (Ollama qwen3-coder) bloqueia ops destrutivas em prod
  · Toda a tool call → CEF → Wazuh
  · Token revogado pós-sessão (hook Stop)
```

## Pack: `release`

```
=== WIRE CONTEXT PACK · RELEASE ===

Skill (auto-trigger):
  · wire-release-safety  (secops)  — release gates + canary plan

Commands:
  · /wire-release-gate <release>  — avaliação de release com canary multi-tenant
  · /wire-stack-doctor            — pre-flight da stack antes do deploy
  · /vault-audit                  — verificar segredos do projecto antes do deploy

Agent:
  · wire-deploy-01    — deploy/rollout coordinator (Capistrano)

Vault — paths e AppRole:
  · AppRole:  wire-deploy   (TTL 15m · max 30m)
  · KV: secret/data/cicd/<projecto>/*  (GitLab/GitHub tokens, cosign, SBOM)

Tooling:
  · Capistrano (cap production deploy, cap staging deploy)
  · cosign — assinatura de imagens
  · SBOM — gerado por build, anexado a release artifact

Gates obrigatórios (codificados em hooks/skills):
  · /wire-release-gate deve aprovar antes de `cap production deploy`
  · N1 para cap staging deploy · N2 para cap production deploy
  · N3 para cap production deploy:rollback ou systemctl stop puma-wire*
  · Second-opinion em ops destrutivas (DROP/TRUNCATE/rollback)

One-liners úteis:
  bundle exec cap production deploy:check
  cosign verify <image>
  vault kv list secret/cicd
```

## Pack: `audit`

```
=== WIRE CONTEXT PACK · AUDIT ===

Skills (auto-trigger) — setup local:
  · claude-deep-audit    (base)  — auditoria da config Claude Code (10 sub-agentes)
  · mempalace-doctor     (base)  — saúde do MemPalace
  · vault-toolkit        (base)  — segredos do projecto

Skills (auto-trigger) — projecto:
  · security-scan        (devkit)  — OWASP Top 10, secrets, IaC, deps
  · infra-audit          (devkit)  — Docker, K8s, systemd, proxy, CI/CD
  · ux-audit             (devkit)  — WCAG 2.1 AA, Nielsen, responsive, design system
  · code-quality         (devkit)  — dead code, arquitectura, complexidade, cobertura
  · performance-audit    (devkit)  — bundle, N+1, queries lentas, leaks

Skill (auto-trigger) — compliance:
  · wire-compliance-provider  (secops)  — NIS2 (DL 20/2025) + RGPD Art. 28

Commands — orchestrators:
  · /wire-doctor                   (base)    — meta-doctor do setup
  · /full-audit [--ci]             (devkit)  — orquestra os 5 audits + ux condicional
  · /wire-compliance-snapshot      (secops)  — snapshot regulatório

Commands — Vault audit:
  · /vault-audit                   (base)    — health do Vault LOCAL de dev
  · /wire-vault-doctor             (secops)  — diagnóstico do Vault de PRODUÇÃO

Rules customizadas do projecto (se existirem):
  · rules/audit/security.md
  · rules/audit/infra.md
  · rules/audit/ux.md
  · rules/audit/code-quality.md
  · rules/audit/performance.md

Convenções do wire-devkit/shared/:
  · scoring.md         — rubrica X.X/10 unificada
  · ci-mode.md         — comportamento de --ci (JSON, SARIF, exit codes)
  · report-format.md   — estrutura canónica de relatório

One-liners úteis:
  /full-audit --ci --export-report     # report consolidado em docs/audit/
  /security-scan --scope=secrets --ci   # só varrer secrets, modo CI
  /code-quality --scope=test-coverage   # só cobertura
```

## Pack: `all`

Imprimir os três packs anteriores em sequência, separados por `===`.

## Estrutura do output

Para cada item em cada pack:
- Marca `(plugin em falta)` ao lado do nome se o plugin que o provê não estiver instalado.
- Inclui ponteiro para `/plugin install <plugin>@jump2new` na primeira ocorrência de cada plugin em falta.
- Não fetch nada de live — só lista. O utilizador é que corre os commands quando precisa.

## Notas

- Os packs **não** são acções — são **mapas**. Servem para primar uma sessão nova com o vocabulário operacional certo.
- Para correr de facto algo, usar os commands listados nos packs.
- Para uma sessão totalmente nova num laptop limpo: começar com `/wire-onboard`, depois `/wire-doctor`, depois pedir o pack relevante ao trabalho do dia.

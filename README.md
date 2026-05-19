# jump2new · marketplace

Marketplace privado **jump2new** com o ecossistema de plugins **Wire** para Claude Code.

## Plugins

| Plugin | Versão | Domínio |
|--------|--------|---------|
| **wire-base** | 0.3.0 | Foundacional — 14 commands (`vault-toolkit`: 5 `/vault-*` + 2 bootstraps `/wire-vault-bootstrap` e `/wire-vault-kv-migrate` + `/wire-vault-policy`; setup/diagnóstico: `/wire-onboard`, `/wire-doctor`, `/wire-mode`, `/wire-context-pack`, `/wire-upgrade`, `/wire-smoke`), 10 skills (incl. `mempalace-doctor`, `claude-deep-audit`), helpers bash partilhados (`lib/wire-common.sh`, `lib/vault-env.sh`), hook SessionStart auto-unseal + hook PreToolUse `audit-guard` que dá defense-in-depth ao `wire-devkit`. **Instalar primeiro.** |
| **wire-secops** | 0.4.0 | SecOps com Agentes IA para a Wire enquanto fornecedora SaaS de eGovernment local (170+ autarquias). 6 agents, 10 commands `/wire-*` (inclui `/wire-secops-bootstrap` para provisionar policies + AppRoles + Keychain numa só corrida), 6 skills com **20 templates `references/`** (progressive disclosure), cadeia de hooks PreToolUse/PostToolUse/Stop **funcional** (v0.4.0 corrige hooks que estavam bypassed: approval-gate via `WIRE_APPROVE`, pii-redact fail-closed). Assume `wire-base` instalado. |
| **wire-devkit** | 0.2.2 | Toolkit de auditoria de developer — `full-audit`, `security-scan`, `infra-audit`, `ux-audit`, `code-quality`, `performance-audit`, agente `local-reviewer` e `ngrok-expose`. **Read-only por defeito**: relatórios não tocam em ficheiros; correcção é opt-in via `--apply`. Dependência soft do `wire-base`. |
| **wire-craft** | 0.1.0 | Tooling generativo — `html-plan` (HTML designed em 2 fases com disciplina anti-AI-slop: 8px grid, contraste WCAG AA, real data, 5 surfaces). Standalone, zero deps externas. **Novidade v0.1.0.** Roadmap: `logo-generator` em v0.2.0. |

## Estrutura

```
.
├── .claude-plugin/
│   └── marketplace.json          ← declaração do marketplace 'jump2new'
├── base/                         ← plugin wire-base v0.3.0
│   ├── .claude-plugin/plugin.json
│   ├── lib/      (wire-common.sh, vault-env.sh)
│   ├── hooks/    (SessionStart → vault-session-check.sh; PreToolUse → pre-tool-audit-guard.sh)
│   ├── commands/ (14 commands: 5 /vault-* + /wire-vault-{bootstrap,kv-migrate,policy} + /wire-{onboard,doctor,mode,context-pack,upgrade,smoke})
│   └── skills/   (10 skills: vault-toolkit, mempalace-doctor, claude-deep-audit, wire-{onboard,doctor,mode,context-pack,upgrade,smoke,vault-policy})
├── secops/                       ← plugin wire-secops v0.4.0
│   ├── .claude-plugin/plugin.json
│   ├── agents/   (6 agents wire-*-01)
│   ├── commands/ (10 commands /wire-* incl. /wire-secops-bootstrap)
│   ├── hooks/    (4 pre + 1 post + 1 stop + 1 SessionStart)
│   ├── skills/   (6 skills wire-* + 20 templates references/)
│   ├── CHANGELOG.md
│   ├── CLAUDE.md
│   └── vault-policies.hcl
├── devkit/                        ← plugin wire-devkit v0.2.2
│   ├── .claude-plugin/plugin.json
│   ├── commands/ (7 wrappers finos)
│   ├── skills/   (8 skills: 6 audits + local-reviewer + ngrok-expose)
│   ├── agents/   (local-reviewer)
│   └── shared/   (scoring, ci-mode, report-format, safe-apply)
├── craft/                         ← plugin wire-craft v0.1.0
│   ├── .claude-plugin/plugin.json
│   ├── commands/ (1 wrapper · /html-plan)
│   └── skills/   (1 skill · html-plan + 2 references)
└── scripts/
    ├── validate.sh                ← checks estáticos (JSON, frontmatter, shellcheck)
    └── package.sh                 ← empacotador unificado dos 4 plugins
```

## Desenvolvimento

```bash
./scripts/validate.sh                  # validar tudo antes de tagar/publicar
./scripts/package.sh                   # empacotar os 4 em /tmp/*.plugin
./scripts/package.sh base              # só wire-base
./scripts/package.sh --out ./dist      # outdir alternativo
```

## Instalar no Claude Code

```
/plugin marketplace add mjvmsteixeira/claudecodemastery
/plugin install wire-base@jump2new
/plugin install wire-secops@jump2new
/plugin install wire-devkit@jump2new
/plugin install wire-craft@jump2new       # opcional · tooling generativo, standalone
```

Ordem importa: `wire-base` primeiro — fornece convenções e helpers que o `wire-secops` assume e que o `ngrok-expose` do `wire-devkit` usa. `wire-secops` e `wire-devkit` são independentes entre si.

Depois do primeiro install, **`/wire-onboard`** (vive no `wire-base`) detecta o que ainda falta, emite as linhas de install dos plugins em falta e sugere smoke tests por plugin já instalado. Idempotente — pode correr múltiplas vezes.

## Verificar

```
/plugin list      # wire-base · 0.3.0  +  wire-secops · 0.4.0  +  wire-devkit · 0.2.2  +  wire-craft · 0.1.0
/agents           # 6 agents wire-*-01
/wire-onboard     # sanity check do ecossistema + sugestões de smoke test
```

## Upgrade para `wire-secops` v0.4.0 · OBRIGATÓRIO uninstall antes de install

Claude Code não actualiza plugins in-place de forma fiável. A v0.4.0 corrige **três hooks que estavam funcionalmente partidos** em v0.3.x (timeouts ignorados, approval-gate broken, pii-redact no-op). Cache antiga lado-a-lado da nova provoca comportamento inconsistente. Faz **sempre**:

```
/plugin uninstall wire-secops@jump2new
/plugin marketplace update
/plugin install wire-secops@jump2new
```

Recarrega a sessão Claude Code (nova janela ou Ctrl-D + abrir). `/plugin list` deve mostrar `wire-secops · 0.4.0`.

**⚠ Behavior change:** em v0.4.0 os hooks deixam de ser bypassed. Operações destrutivas exigem `WIRE_APPROVE=N1/N2/N3`; tool calls com PII (NIF, IBAN PT, CC PT, email, telefone PT) bloqueiam fail-closed; `/wire-vault-doctor` exige `VAULT_ADDR` explícita. Ver `secops/CHANGELOG.md` e a secção "Variáveis de ambiente do plugin" em `secops/CLAUDE.md`.

## Bootstrap do Vault

Setup completo do Vault local em 3 comandos (provisiona audit, kv-v2, AppRoles, transit, ssh, Keychain). Documentado em detalhe nos READMEs de `base/` e `secops/`:

```
/wire-vault-bootstrap --plan && /wire-vault-bootstrap --apply       # base · infra genérica
/wire-secops-bootstrap --plan && /wire-secops-bootstrap --apply     # secops · policies + 7 AppRoles + Keychain
/wire-vault-doctor                                                  # confirma findings resolvidos
```

Se já tens dados em `secret/` kv-v1: corre primeiro `/wire-vault-kv-migrate --plan` / `--backup` / `WIRE_VAULT_MIGRATE_CONFIRM=migrate-now /wire-vault-kv-migrate --apply` para migrar para kv-v2 sem perder dados.

## Stack assumido (`wire-secops`)

O plugin assume um padrão arquitectural genérico — não impõe ferramentas concretas:

- **Broker de segredos** (Vault, ou equivalente)
- **SIEM** central (Wazuh, Splunk, Elastic, …) que recebe eventos do plugin via CEF/syslog
- **Reverse-proxy / firewall de perímetro** (Fortigate, nginx, Cloudflare, …)
- **Monitorização activa** (Zabbix, Prometheus, Datadog, …)
- **DB relacional multi-tenant** (PostgreSQL, MySQL, …) com isolamento por tenant
- **Servidores aplicacionais** nativos ou containerizados (Rails, Django, Node, .NET, …)

Os exemplos concretos no `secops/CLAUDE.md` reflectem o setup em que o plugin foi criado (Wazuh + Fortigate + Zabbix + PostgreSQL + Rails). Substituir pelo tooling do projecto é uma alteração documental — as skills e os hooks são tool-agnósticos no nível conceptual.

## Enquadramento legal

NIS2 (DL 20/2025) enquanto fornecedor crítico de entidades essenciais · RGPD Art. 28 enquanto subcontratante.

---

© 2026 jump2new · geral@jump2new.pt · Repositório privado

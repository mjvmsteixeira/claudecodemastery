# prumo · marketplace

Marketplace privado **prumo** com o ecossistema de plugins para Claude Code.

## Plugins

| Plugin | Versão | Domínio |
|--------|--------|---------|
| **prumo-base** | 0.5.0 | Foundacional — 14 commands (`vault-toolkit`: 5 `/vault-*` + 2 bootstraps `/prumo-vault-bootstrap` e `/prumo-vault-kv-migrate` + `/prumo-vault-policy`; setup/diagnóstico: `/prumo-onboard`, `/prumo-doctor`, `/prumo-mode`, `/prumo-context-pack`, `/prumo-upgrade`, `/prumo-smoke`), 10 skills (incl. `mempalace-doctor`, `claude-deep-audit`), helpers bash partilhados (`lib/prumo-common.sh`, `lib/vault-env.sh`), hook SessionStart auto-unseal + hook PreToolUse `audit-guard` que dá defense-in-depth ao `prumo-devkit`. **Instalar primeiro.** |
| **prumo-secops** | 0.5.0 | SecOps com Agentes IA para a Wire enquanto fornecedora SaaS de eGovernment local (170+ autarquias). 6 agents, 10 commands `/prumo-*` (inclui `/prumo-secops-bootstrap` para provisionar policies + AppRoles + Keychain numa só corrida), 6 skills com **20 templates `references/`** (progressive disclosure), cadeia de hooks PreToolUse/PostToolUse/Stop **funcional**. Assume `prumo-base` instalado. |
| **prumo-devkit** | 0.4.0 | Toolkit de auditoria de developer — `full-audit`, `security-scan`, `infra-audit`, `ux-audit`, `code-quality`, `performance-audit`, agente `local-reviewer` e `ngrok-expose`. **Read-only por defeito**: relatórios não tocam em ficheiros; correcção é opt-in via `--apply`. Dependência soft do `prumo-base`. |
| **prumo-craft** | 0.2.0 | Tooling generativo — `html-plan` (HTML designed em 2 fases com disciplina anti-AI-slop: 8px grid, contraste WCAG AA, real data, 5 surfaces). Standalone, zero deps externas. Roadmap: `logo-generator` em v0.3.0. |

## Estrutura

```
.
├── .claude-plugin/
│   └── marketplace.json          ← declaração do marketplace 'prumo'
├── base/                         ← plugin prumo-base v0.5.0
│   ├── .claude-plugin/plugin.json
│   ├── lib/      (prumo-common.sh, vault-env.sh)
│   ├── hooks/    (SessionStart → vault-session-check.sh; PreToolUse → pre-tool-audit-guard.sh)
│   ├── commands/ (14 commands: 5 /vault-* + /prumo-vault-{bootstrap,kv-migrate,policy} + /prumo-{onboard,doctor,mode,context-pack,upgrade,smoke})
│   └── skills/   (10 skills: vault-toolkit, mempalace-doctor, claude-deep-audit, prumo-{onboard,doctor,mode,context-pack,upgrade,smoke,vault-policy})
├── secops/                       ← plugin prumo-secops v0.5.0
│   ├── .claude-plugin/plugin.json
│   ├── agents/   (6 agents prumo-*-01)
│   ├── commands/ (10 commands /prumo-* incl. /prumo-secops-bootstrap)
│   ├── hooks/    (4 pre + 1 post + 1 stop + 1 SessionStart)
│   ├── skills/   (6 skills prumo-* + 20 templates references/)
│   ├── CHANGELOG.md
│   ├── CLAUDE.md
│   └── vault-policies.hcl
├── devkit/                        ← plugin prumo-devkit v0.4.0
│   ├── .claude-plugin/plugin.json
│   ├── commands/ (7 wrappers finos)
│   ├── skills/   (8 skills: 6 audits + local-reviewer + ngrok-expose)
│   ├── agents/   (local-reviewer)
│   └── shared/   (scoring, ci-mode, report-format, safe-apply)
├── craft/                         ← plugin prumo-craft v0.2.0
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
./scripts/package.sh base              # só prumo-base
./scripts/package.sh --out ./dist      # outdir alternativo
```

## Instalar no Claude Code

```
/plugin marketplace add mjvmsteixeira/claudecodemastery
/plugin install prumo-base@prumo
/plugin install prumo-secops@prumo
/plugin install prumo-devkit@prumo
/plugin install prumo-craft@prumo       # opcional · tooling generativo, standalone
```

Ordem importa: `prumo-base` primeiro — fornece convenções e helpers que o `prumo-secops` assume e que o `ngrok-expose` do `prumo-devkit` usa. `prumo-secops` e `prumo-devkit` são independentes entre si.

Depois do primeiro install, **`/prumo-onboard`** (vive no `prumo-base`) detecta o que ainda falta, emite as linhas de install dos plugins em falta e sugere smoke tests por plugin já instalado. Idempotente — pode correr múltiplas vezes.

## Verificar

```
/plugin list      # prumo-base · 0.5.0  +  prumo-secops · 0.5.0  +  prumo-devkit · 0.4.0  +  prumo-craft · 0.2.0
/agents           # 6 agents prumo-*-01
/prumo-onboard    # sanity check do ecossistema + sugestões de smoke test
```

## Upgrade wire → prumo (OBRIGATÓRIO uninstall antes de install)

Claude Code não actualiza plugins in-place de forma fiável, e esta release muda o nome do marketplace e dos plugins — não é um simples bump de versão. Cache antiga lado-a-lado da nova provoca comportamento inconsistente. Faz **sempre**:

```
/plugin uninstall wire-base@jump2new
/plugin uninstall wire-secops@jump2new
/plugin uninstall wire-devkit@jump2new
/plugin uninstall wire-craft@jump2new
/plugin marketplace remove jump2new   (se aplicável)
/plugin marketplace add <path-ou-URL do repo>
/plugin install prumo-base@prumo
/plugin install prumo-secops@prumo
/plugin install prumo-devkit@prumo
/plugin install prumo-craft@prumo
```

Recarrega a sessão Claude Code (nova janela ou Ctrl-D + abrir). `/plugin list` deve mostrar `prumo-base · 0.5.0`, `prumo-secops · 0.5.0`, `prumo-devkit · 0.4.0`, `prumo-craft · 0.2.0`.

**⚠ Behavior change:** os hooks do `prumo-secops` não são bypassed. Operações destrutivas exigem `PRUMO_APPROVE=N1/N2/N3`; tool calls com PII (NIF, IBAN PT, CC PT, email, telefone PT) bloqueiam fail-closed; `/prumo-vault-doctor` exige `VAULT_ADDR` explícita. Ver `secops/CHANGELOG.md` e a secção "Variáveis de ambiente do plugin" em `secops/CLAUDE.md`.

## Bootstrap do Vault

Setup completo do Vault local em 3 comandos (provisiona audit, kv-v2, AppRoles, transit, ssh, Keychain). Documentado em detalhe nos READMEs de `base/` e `secops/`:

```
/prumo-vault-bootstrap --plan && /prumo-vault-bootstrap --apply       # base · infra genérica
/prumo-secops-bootstrap --plan && /prumo-secops-bootstrap --apply     # secops · policies + 7 AppRoles + Keychain
/prumo-vault-doctor                                                  # confirma findings resolvidos
```

Se já tens dados em `secret/` kv-v1: corre primeiro `/prumo-vault-kv-migrate --plan` / `--backup` / `PRUMO_VAULT_MIGRATE_CONFIRM=migrate-now /prumo-vault-kv-migrate --apply` para migrar para kv-v2 sem perder dados.

## Stack assumido (`prumo-secops`)

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

© 2026 mjvmst · mjvmst@gmail.com · Repositório privado

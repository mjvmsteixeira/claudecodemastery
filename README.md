# jump2new · marketplace

Marketplace privado **jump2new** com o ecossistema de plugins **Wire** para Claude Code.

## Plugins

| Plugin | Versão | Domínio |
|--------|--------|---------|
| **wire-base** | 0.3.0 | Foundacional — `vault-toolkit` (5 commands `/vault-*` + 2 bootstraps `/wire-vault-bootstrap` e `/wire-vault-kv-migrate` + hook SessionStart auto-unseal), skills `mempalace-doctor` e `claude-deep-audit`, helpers bash partilhados (`lib/wire-common.sh`, `lib/vault-env.sh`), hook PreToolUse `audit-guard` que dá defense-in-depth ao `wire-devkit`. **Instalar primeiro.** |
| **wire-secops** | 0.3.0 | SecOps com Agentes IA para a Wire enquanto fornecedora SaaS de eGovernment local (170+ autarquias). 6 agents, 10 commands `/wire-*` (inclui `/wire-secops-bootstrap` para provisionar policies + AppRoles + Keychain numa só corrida), 6 skills, cadeia de hooks PreToolUse/PostToolUse/Stop. Assume `wire-base` instalado. |
| **wire-devkit** | 0.2.2 | Toolkit de auditoria de developer — `full-audit`, `security-scan`, `infra-audit`, `ux-audit`, `code-quality`, `performance-audit`, agente `local-reviewer` e `ngrok-expose`. **Read-only por defeito**: relatórios não tocam em ficheiros; correcção é opt-in via `--apply`. Dependência soft do `wire-base`. |

## Estrutura

```
.
├── .claude-plugin/
│   └── marketplace.json          ← declaração do marketplace 'jump2new'
├── base/                         ← plugin wire-base v0.3.0
│   ├── .claude-plugin/plugin.json
│   ├── lib/      (wire-common.sh, vault-env.sh)
│   ├── hooks/    (SessionStart → vault-session-check.sh; PreToolUse → pre-tool-audit-guard.sh)
│   ├── commands/ (5 commands /vault-* + 2 bootstraps /wire-vault-{bootstrap,kv-migrate})
│   └── skills/   (mempalace-doctor, claude-deep-audit)
├── secops/                       ← plugin wire-secops v0.3.0
│   ├── .claude-plugin/plugin.json
│   ├── agents/   (6 agents wire-*-01)
│   ├── commands/ (10 commands /wire-* incl. /wire-secops-bootstrap)
│   ├── hooks/    (4 pre + 1 post + 1 stop)
│   ├── skills/   (6 skills wire-*)
│   ├── CLAUDE.md
│   └── vault-policies.hcl
├── devkit/                        ← plugin wire-devkit v0.2.2
│   ├── .claude-plugin/plugin.json
│   ├── commands/ (7 wrappers finos)
│   ├── skills/   (8 skills: 6 audits + local-reviewer + ngrok-expose)
│   ├── agents/   (local-reviewer)
│   └── shared/   (scoring, ci-mode, report-format, safe-apply)
└── scripts/
    ├── validate.sh                ← checks estáticos (JSON, frontmatter, shellcheck)
    └── package.sh                 ← empacotador unificado dos 3 plugins
```

## Desenvolvimento

```bash
./scripts/validate.sh                  # validar tudo antes de tagar/publicar
./scripts/package.sh                   # empacotar os 3 em /tmp/*.plugin
./scripts/package.sh base              # só wire-base
./scripts/package.sh --out ./dist      # outdir alternativo
```

## Instalar no Claude Code

```
/plugin marketplace add mjvmsteixeira/claudecodemastery
/plugin install wire-base@jump2new
/plugin install wire-secops@jump2new
/plugin install wire-devkit@jump2new
```

Ordem importa: `wire-base` primeiro — fornece convenções e helpers que o `wire-secops` assume e que o `ngrok-expose` do `wire-devkit` usa. `wire-secops` e `wire-devkit` são independentes entre si.

Depois do primeiro install, **`/wire-onboard`** (vive no `wire-base`) detecta o que ainda falta, emite as linhas de install dos plugins em falta e sugere smoke tests por plugin já instalado. Idempotente — pode correr múltiplas vezes.

## Verificar

```
/plugin list      # wire-base · 0.3.0 · user  +  wire-secops · 0.3.0 · user  +  wire-devkit · 0.2.2 · user
/agents           # 6 agents wire-*-01
/wire-onboard     # sanity check do ecossistema + sugestões de smoke test
```

## Upgrade para v0.3.0 (a partir de v0.2.x) · OBRIGATÓRIO uninstall antes de install

Claude Code não actualiza plugins in-place de forma fiável e o `wire-secops` v0.3.0 traz mudança no hook `pre-tool-vault-ttl.sh`. Cache antiga lado-a-lado da nova provoca comportamento inconsistente. Faz **sempre**:

```
/plugin uninstall wire-base@jump2new
/plugin uninstall wire-secops@jump2new
/plugin install wire-base@jump2new
/plugin install wire-secops@jump2new
```

Recarrega a sessão Claude Code (nova janela ou Ctrl-D + abrir). `/plugin list` deve mostrar uma entrada de cada com `0.3.0`.

## Bootstrap do Vault (v0.3.0)

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

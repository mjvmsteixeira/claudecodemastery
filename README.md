# jump2new · marketplace

Marketplace privado **jump2new** com o ecossistema de plugins **Wire** para Claude Code.

## Plugins

| Plugin | Versão | Domínio |
|--------|--------|---------|
| **wire-base** | 0.2.0 | Foundacional — `vault-toolkit` (5 commands `/vault-*` + hook SessionStart auto-unseal), skills `mempalace-doctor` e `claude-deep-audit`, helpers bash partilhados (`lib/wire-common.sh`, `lib/vault-env.sh`). **Instalar primeiro.** |
| **wire-secops** | 0.2.0 | SecOps com Agentes IA para a Wire enquanto fornecedora SaaS de eGovernment local (170+ autarquias). 6 agents, 9 commands `/wire-*`, 6 skills, cadeia de hooks PreToolUse/PostToolUse/Stop. Assume `wire-base` instalado. |
| **wire-devkit** | 0.2.0 | Toolkit de auditoria de developer — `full-audit`, `security-scan`, `infra-audit`, `ux-audit`, `code-quality`, `performance-audit`, agente `local-reviewer` e `ngrok-expose`. Commands explícitos + skills que auto-disparam. Dependência soft do `wire-base`. |

## Estrutura

```
.
├── .claude-plugin/
│   └── marketplace.json          ← declaração do marketplace 'jump2new'
├── base/                         ← plugin wire-base v0.2.0
│   ├── .claude-plugin/plugin.json
│   ├── lib/      (wire-common.sh, vault-env.sh)
│   ├── hooks/    (SessionStart → vault-session-check.sh)
│   ├── commands/ (5 commands /vault-*)
│   └── skills/   (mempalace-doctor, claude-deep-audit)
├── secops/                       ← plugin wire-secops v0.2.0
│   ├── .claude-plugin/plugin.json
│   ├── agents/   (6 agents wire-*-01)
│   ├── commands/ (9 commands /wire-*)
│   ├── hooks/    (4 pre + 1 post + 1 stop)
│   ├── skills/   (6 skills wire-*)
│   ├── CLAUDE.md
│   └── vault-policies.hcl
├── devkit/                        ← plugin wire-devkit v0.2.0
│   ├── .claude-plugin/plugin.json
│   ├── commands/ (7 wrappers finos)
│   ├── skills/   (8 skills: 6 audits + local-reviewer + ngrok-expose)
│   ├── agents/   (local-reviewer)
│   └── shared/   (scoring, ci-mode, report-format)
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
/plugin list      # wire-base · 0.2.0 · user  +  wire-secops · 0.2.0 · user  +  wire-devkit · 0.2.0 · user
/agents           # 6 agents wire-*-01
/wire-onboard     # sanity check do ecossistema + sugestões de smoke test
```

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

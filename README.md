# jump2new · marketplace Wiremaze

Marketplace privado **jump2new** com o ecossistema de plugins **Wiremaze** para Claude Code.

## Plugins

| Plugin | Versão | Domínio |
|--------|--------|---------|
| **wiremaze-base** | 0.2.0 | Foundacional — `vault-toolkit` (5 commands `/vault-*` + hook SessionStart auto-unseal), skills `mempalace-doctor` e `claude-deep-audit`, helpers bash partilhados (`lib/wmz-common.sh`, `lib/vault-env.sh`). **Instalar primeiro.** |
| **wiremaze-secops** | 0.2.1 | SecOps com Agentes IA para a Wiremaze enquanto fornecedora SaaS de eGovernment local (170+ autarquias). 6 agents, 9 commands `/wiremaze-*`, 6 skills, cadeia de hooks PreToolUse/PostToolUse/Stop. Assume `wiremaze-base` instalado. |
| **wiremaze-devkit** | 0.1.0 | Toolkit de auditoria de developer — `full-audit`, `security-scan`, `infra-audit`, `ux-audit`, `code-quality`, `performance-audit`, agente `local-reviewer` e `ngrok-expose`. Commands explícitos + skills que auto-disparam. Dependência soft do `wiremaze-base`. |

## Estrutura

```
.
├── .claude-plugin/
│   └── marketplace.json          ← declaração do marketplace 'jump2new'
├── base/                         ← plugin wiremaze-base v0.2.0
│   ├── .claude-plugin/plugin.json
│   ├── lib/      (wmz-common.sh, vault-env.sh)
│   ├── hooks/    (SessionStart → vault-session-check.sh)
│   ├── commands/ (5 commands /vault-*)
│   └── skills/   (mempalace-doctor, claude-deep-audit)
├── secops/                       ← plugin wiremaze-secops v0.2.1
│   ├── .claude-plugin/plugin.json
│   ├── agents/   (6 agents wiremaze-*-01)
│   ├── commands/ (9 commands /wiremaze-*)
│   ├── hooks/    (4 pre + 1 post + 1 stop)
│   ├── skills/   (6 skills wiremaze-*)
│   ├── CLAUDE.md
│   ├── vault-policies.hcl
│   └── package.sh
└── devkit/                        ← plugin wiremaze-devkit v0.1.0
    ├── .claude-plugin/plugin.json
    ├── commands/ (7 wrappers finos)
    ├── skills/   (8 skills: 6 audits + local-reviewer + ngrok-expose)
    ├── agents/   (local-reviewer)
    └── shared/   (scoring, ci-mode, report-format)
```

## Instalar no Claude Code

```
/plugin marketplace add mjvmsteixeira/claudecodemastery
/plugin install wiremaze-base@jump2new
/plugin install wiremaze-secops@jump2new
/plugin install wiremaze-devkit@jump2new
```

Ordem importa: `wiremaze-base` primeiro — fornece convenções e helpers que o `wiremaze-secops` assume e que o `ngrok-expose` do `wiremaze-devkit` usa. `wiremaze-secops` e `wiremaze-devkit` são independentes entre si.

## Verificar

```
/plugin list      # wiremaze-base · 0.2.0 · user  +  wiremaze-secops · 0.2.1 · user  +  wiremaze-devkit · 0.1.0 · user
/agents           # 6 agents wiremaze-*-01
```

## Stack assumido (wiremaze-secops)

Vault · Wazuh (SIEM) · Fortigate (perímetro) · Zabbix (monitorização activa) · PostgreSQL multi-tenant · servidores nativos Ruby on Rails (várias versões).

## Enquadramento legal

NIS2 (DL 20/2025) enquanto fornecedor crítico de entidades essenciais · RGPD Art. 28 enquanto subcontratante.

---

© 2026 jump2new · geral@jump2new.pt · Repositório privado

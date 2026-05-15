---
name: wire-doctor
description: Meta-doctor — orquestra mempalace-doctor, claude-deep-audit, /vault-audit e (se wire-secops instalado) /wire-vault-doctor numa única corrida; consolida num relatório de saúde do setup local. Read-only.
allowed-tools: Bash, Read, Grep
---

# /wire-doctor

Meta-doctor do ecossistema Wire. Corre os doctors disponíveis em paralelo, consolida num relatório único. **Read-only** — nada é alterado; o output sugere acções concretas para o utilizador.

Domínios diferentes de `/full-audit` (que vive no `wire-devkit` e audita um **projecto**): o `/wire-doctor` audita o **setup local do Claude Code + ferramentas auxiliares** (MemPalace, Vault, configuração Claude).

## Passo 1 — Detectar quais doctors estão disponíveis

```bash
# Cada plugin pode estar instalado ou não. Detectar antes de tentar correr.
HAS_BASE=0; HAS_SECOPS=0; HAS_DEVKIT=0
find ~/.claude/plugins/cache -path "*/wire-base/*/.claude-plugin/plugin.json"  -print -quit 2>/dev/null | grep -q . && HAS_BASE=1
find ~/.claude/plugins/cache -path "*/wire-secops/*/.claude-plugin/plugin.json" -print -quit 2>/dev/null | grep -q . && HAS_SECOPS=1
find ~/.claude/plugins/cache -path "*/wire-devkit/*/.claude-plugin/plugin.json" -print -quit 2>/dev/null | grep -q . && HAS_DEVKIT=1

# MemPalace existe localmente?
HAS_MEMPALACE=0
[ -d ~/.mempalace ] && HAS_MEMPALACE=1
```

## Passo 2 — Orquestrar (em paralelo via Agent tool)

Lançar em paralelo os doctors aplicáveis:

| Doctor | Domínio | Condição |
|--------|---------|----------|
| `mempalace-doctor` (skill, base) | Saúde do MemPalace local | `HAS_BASE && HAS_MEMPALACE` |
| `claude-deep-audit` (skill, base) | Auditoria profunda da configuração Claude Code | `HAS_BASE` |
| `/vault-audit` (command, base) | Health da integração Vault local do projecto actual | `HAS_BASE` |
| `/wire-vault-doctor` (command, secops) | Diagnóstico do Vault de **produção** do SaaS | `HAS_SECOPS` (e fora da VPN: pode reportar inacessível) |

Cada agente devolve um resumo com status (verde/amarelo/vermelho), counts de findings por severidade, e top 3 acções recomendadas.

## Passo 3 — Consolidar

Apresentar relatório único com uma secção por doctor:

```
=== WIRE DOCTOR · <data ISO> ===

PLUGINS DETECTADOS:
  ✓ wire-base (versão X.X.X)
  ✓ wire-secops (versão X.X.X)
  ✗ wire-devkit (não instalado)

TOOLS DETECTADAS:
  ✓ MemPalace em ~/.mempalace/

────────────────────────────────────────
MemPalace · status: <verde|amarelo|vermelho>
  <resumo do mempalace-doctor>
  Top acções: ...

Claude Code config · status: ...
  <resumo do claude-deep-audit>
  Top acções: ...

Vault local (dev) · status: ...
  <resumo do /vault-audit>
  Top acções: ...

Vault produção (se aplicável) · status: ...
  <resumo do /wire-vault-doctor>
  Top acções: ...

────────────────────────────────────────
TOTAL: X críticos · Y altos · Z médios · W baixos
PRÓXIMAS ACÇÕES (ordem de prioridade): ...
```

## Passo 4 — Pendentes (se houver gaps de instalação)

Se algum plugin recomendado estiver em falta, recordar:

```bash
[ $HAS_BASE -eq 0 ] && echo "Falta wire-base — corre /wire-onboard"
```

## Notas

- Read-only — nenhum doctor desta cadeia tem permissão para alterar estado.
- O `/wire-vault-doctor` precisa de network reach ao Vault de produção; fora da VPN reporta "inacessível" (não é falha do plugin).
- Para audit de um **projecto** (código/infra/UX/perf), usar `/full-audit` do `wire-devkit`.
- Para auto-trigger por intenção do utilizador ("doutor wire", "saúde do setup"), ver a skill `wire-doctor` que delega para este command.

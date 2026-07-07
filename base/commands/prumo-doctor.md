---
name: prumo-doctor
description: Meta-doctor — orquestra mempalace-doctor, claude-deep-audit, /vault-audit e (se prumo-secops instalado) /prumo-vault-doctor numa única corrida; consolida num relatório de saúde do setup local. Read-only.
allowed-tools: Bash, Read, Grep
---

# /prumo-doctor

Meta-doctor do ecossistema prumo. Corre os doctors disponíveis em paralelo, consolida num relatório único. **Read-only** — nada é alterado; o output sugere acções concretas para o utilizador.

Domínios diferentes de `/full-audit` (que vive no `prumo-devkit` e audita um **projecto**): o `/prumo-doctor` audita o **setup local do Claude Code + ferramentas auxiliares** (MemPalace, Vault, configuração Claude).

## Passo 1 — Detectar quais doctors estão disponíveis

```bash
# Cada plugin pode estar instalado ou não. Detectar antes de tentar correr.
HAS_BASE=0; HAS_SECOPS=0; HAS_DEVKIT=0
find ~/.claude/plugins/cache -path "*/prumo-base/*/.claude-plugin/plugin.json"  -print -quit 2>/dev/null | grep -q . && HAS_BASE=1
find ~/.claude/plugins/cache -path "*/prumo-secops/*/.claude-plugin/plugin.json" -print -quit 2>/dev/null | grep -q . && HAS_SECOPS=1
find ~/.claude/plugins/cache -path "*/prumo-devkit/*/.claude-plugin/plugin.json" -print -quit 2>/dev/null | grep -q . && HAS_DEVKIT=1

# MemPalace existe localmente?
HAS_MEMPALACE=0
[ -d ~/.mempalace ] && HAS_MEMPALACE=1
```

## Passo 1b — Binários essenciais (dependência implícita dos hooks)

Os hooks e libs do ecossistema dependem de binários externos que nunca aparecem
num manifest. `jq` é o mais crítico (parsing de tool_input, construção de JSON no
second-opinion, telemetria) — a sua ausência degrada ou fecha guardrails. Verificar:

```bash
echo "── Binários essenciais ──"
for bin in jq shasum curl git; do
  if command -v "$bin" >/dev/null 2>&1; then
    echo "  ✓ $bin"
  else
    crit=""; [ "$bin" = "jq" ] && crit=" (CRÍTICO — hooks de segurança dependem dele)"
    echo "  ✗ $bin em falta${crit}"
  fi
done
# Opcionais (degradam graciosamente): ollama (via HTTP), docker (Vault em container), nc (CEF→Wazuh)
```

Um `✗ jq` deve ser tratado como finding **alto** no relatório consolidado — sem `jq`
o `pre-tool-second-opinion` fecha-se (fail-closed) e o `audit-guard` bloqueia por
não conseguir parsear o input.

## Passo 2 — Orquestrar (em paralelo via Agent tool)

Lançar em paralelo os doctors aplicáveis:

| Doctor | Domínio | Condição |
|--------|---------|----------|
| `mempalace-doctor` (skill, base) | Saúde do MemPalace local | `HAS_BASE && HAS_MEMPALACE` |
| `claude-deep-audit` (skill, base) | Auditoria profunda da configuração Claude Code | `HAS_BASE` |
| `/vault-audit` (command, base) | Health da integração Vault local do projecto actual | `HAS_BASE` |
| `/prumo-vault-doctor` (command, secops) | Diagnóstico do Vault de **produção** do SaaS | `HAS_SECOPS` (e fora da VPN: pode reportar inacessível) |

Cada agente devolve um resumo com status (verde/amarelo/vermelho), counts de findings por severidade, e top 3 acções recomendadas.

## Passo 3 — Consolidar

Apresentar relatório único com uma secção por doctor:

```
=== PRUMO DOCTOR · <data ISO> ===

PLUGINS DETECTADOS:
  ✓ prumo-base (versão X.X.X)
  ✓ prumo-secops (versão X.X.X)
  ✗ prumo-devkit (não instalado)

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
  <resumo do /prumo-vault-doctor>
  Top acções: ...

────────────────────────────────────────
TOTAL: X críticos · Y altos · Z médios · W baixos
PRÓXIMAS ACÇÕES (ordem de prioridade): ...
```

## Passo 4 — Telemetria dos guardrails (se prumo-base presente)

Resumo compacto do que os guardrails fizeram (últimos 7 dias). Mesma fonte que `/prumo-telemetry`.

```bash
LIB="$(find ~/.claude/plugins/cache -path '*/prumo-base/*/lib/prumo-common.sh' -print -quit 2>/dev/null)"
if [ -n "$LIB" ]; then
  # shellcheck source=/dev/null
  source "$LIB"
  echo "── Telemetria dos guardrails (7d) ──"
  prumo_telemetry_summary --since 7d
fi
```

Sinal de gestão: hooks com muitos `block` são controlos activos; hooks com `fire=0` há muito são candidatos a rever. Detalhe completo em `/prumo-telemetry`.

## Passo 5 — Pendentes (se houver gaps de instalação)

Se algum plugin recomendado estiver em falta, recordar:

```bash
[ $HAS_BASE -eq 0 ] && echo "Falta prumo-base — corre /prumo-onboard"
```

## Notas

- Read-only — nenhum doctor desta cadeia tem permissão para alterar estado.
- O `/prumo-vault-doctor` precisa de network reach ao Vault de produção; fora da VPN reporta "inacessível" (não é falha do plugin).
- Para audit de um **projecto** (código/infra/UX/perf), usar `/full-audit` do `prumo-devkit`.
- Para auto-trigger por intenção do utilizador ("doutor prumo", "saúde do setup"), ver a skill `prumo-doctor` que delega para este command.

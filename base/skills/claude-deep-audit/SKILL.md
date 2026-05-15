---
name: claude-deep-audit
description: Auditoria profunda da configuração Claude Code — user em ~/.claude/ e projecto em ./.claude/ — via 10 sub-agentes paralelos. Cobre CLAUDE.md em todos os níveis (incluindo subpastas que beneficiariam de CLAUDE.md próprio), settings.json em 3-escopos (user/project/local), skills, commands, agents, hooks, MCP servers, memory health, plugins instalados, e cross-references. Propõe drafts de CLAUDE.md para subpastas detectadas. Dispara em "audit claude", "deep audit", "auditoria claude code", "review my CLAUDE.md", "analisa configuração claude", "CLAUDE.md health", "claude config audit", "audit skills hooks settings". NÃO confundir com diagnóstico do tool MemPalace (vector DB) — para isso usar a skill irmã `mempalace-doctor`.
---

Auditoria profunda da configuração Claude Code do projecto actual e do utilizador. Orchestra 10 subagentes paralelos. Detecta pastas que beneficiariam de CLAUDE.md próprio e propõe criação.

Opera apenas sobre paths standard do Claude Code (`~/.claude/` e `./.claude/`) — sem dependências de máquina ou projecto específico.

## Opções

- `--scope=claude-md|settings|skills|commands|agents|hooks|mcp|memory|plugins|xrefs|all` — limitar a um domínio (default: all)
- `--export-report` — gerar relatório em `docs/claude/CLAUDE_AUDIT_<YYYY-MM-DD>.md`
- `--auto-fix-safe` — aplicar correcções triviais autonomamente (entries duplicadas em MEMORY.md, broken refs óbvias)
- `--no-propose-claude-md` — desactivar proposta de CLAUDE.md por subpasta (default: activa)

## Princípios

1. **Read-only por defeito** — auditoria mostra issues, NUNCA aplica fixes sem aprovação
2. **Subagentes paralelos** — usar Agent tool para correr 10 análises em paralelo, cada uma com contexto isolado
3. **Output estruturado** — cada subagente devolve findings num formato comum: `SEVERITY | CATEGORY | LOCATION | FINDING | FIX`
4. **Propose-don't-do** — em todas as áreas, propor → aceitar → aplicar

## Workflow

### Fase 1: Discovery

Mapear o terreno antes de lançar subagentes:

```bash
# Artefactos do utilizador (global)
ls -la ~/.claude/{CLAUDE.md,settings.json,settings.local.json} 2>/dev/null
ls ~/.claude/{rules,skills,agents,commands,output-styles,templates,memory} 2>/dev/null
ls ~/.claude/plugins/ 2>/dev/null
ls ~/.claude/projects/ 2>/dev/null

# Artefactos do projecto (local)
ls -la ./CLAUDE.md ./.claude/{settings.json,settings.local.json,CLAUDE.md} 2>/dev/null
ls ./.claude/{rules,skills,agents,commands,output-styles,docs} 2>/dev/null
ls ./rules/ 2>/dev/null

# CLAUDE.md em subpastas
find . -maxdepth 4 -name "CLAUDE.md" -not -path "*/node_modules/*" -not -path "*/.git/*"

# Memory do projecto
ls ~/.claude/projects/$(echo "$PWD" | tr '/' '-')/memory/ 2>/dev/null

# .mcp.json + plugins
ls -la .mcp.json ~/.claude/mcp.json 2>/dev/null
cat ~/.claude/settings.json 2>/dev/null | grep -A5 plugins
ls ~/.claude/plugins/marketplaces/ 2>/dev/null
```

Capturar inventário em variáveis para passar aos subagentes.

### Fase 2: Lançar 10 subagentes em paralelo

Usar Agent tool com `subagent_type: general-purpose` (ou `Explore` para os de só leitura) — todos no mesmo bloco de tool calls para paralelismo real.

Cada subagente recebe:
- Caminhos relevantes detectados na Fase 1
- Briefing completo (ver `references/subagent-briefings.md`)
- Formato de output: `SEVERITY | CATEGORY | LOCATION | FINDING | FIX`

**Sumário dos 10 subagentes** (briefings completos em `references/subagent-briefings.md`):

| # | Área | Foco |
|---|------|------|
| 1 | **CLAUDE.md health** (CRÍTICO) | Saúde de cada CLAUDE.md + detecção de subpastas que merecem CLAUDE.md próprio (heurísticas: manifests, README grande, muitos ficheiros) |
| 2 | Settings 3-escopos | Conflitos entre user/project/local, permissões over-broad, hooks malformados, drift |
| 3 | Skills inventory | Duplicados global/local, scope correcto, frontmatter, descriptions para triggering, candidatas a rule |
| 4 | Commands inventory | Duplicados REAIS no filesystem (ATENÇÃO: v2.1.3+ unifica UI mas não filesystem), naming, commands enormes |
| 5 | Agents inventory | Frontmatter, tools scope, descriptions para dispatching, conflitos |
| 6 | Hooks audit | Comandos inexistentes, paths hardcoded, output que polui, lentidão |
| 7 | MCP servers | Hardcoded creds (CRITICAL), `.mcp.json` git-tracked, OS-incompat, duplicação user/project |
| 8 | Memory health | MEMORY.md >200L, entries duplicadas, ficheiros órfãos, refs partidas, schema, datas relativas |
| 9 | Plugins audit | Instalados-mas-não-usados, marketplaces stale, conflitos com skills locais |
| 10 | Cross-references | CLAUDE.md → skills/rules inexistentes, refs `@rules/X.md` partidas, scripts ausentes |

### Fase 3: Agregação

Receber resultados dos 10 subagentes. Consolidar em relatório único:

```
=== CLAUDE DEEP AUDIT — <projeto> — <data> ===

ESCOPO
• User: ~/.claude/ (X skills, Y commands, Z agents, W rules)
• Project: ./.claude/ + ./rules/ + ./CLAUDE.md (...)
• CLAUDE.md detectados: N (raiz + subpastas)
• Plugins activos: N

=== CRITICAL (N) ===
[severity | área | location | finding — fix]

=== HIGH (N) ===
=== MEDIUM (N) ===
=== LOW (N) ===

=== PROPOSTAS DE NOVOS CLAUDE.md ===
1. <pasta> — <razão> (DRAFT NL)
...

=== HEALTH SCORE ===
CLAUDE.md / Settings / Skills / Commands / Agents / Hooks / MCP / Memory / Plugins / Cross-refs : X/10 cada
TOTAL: X/10

=== PLANO DE ACÇÃO ===
1. CRITICAL — antes de tudo
2. HIGH — esta sessão
3. MEDIUM — semana
4. LOW + PROPOSE — quando tiver tempo
```

### Fase 4: Propose-fix loop

Para cada finding, oferecer fix:

**Auto-fix-safe (com flag `--auto-fix-safe`):**
- Remover entries duplicadas em MEMORY.md
- Corrigir refs broken óbvias (typos)
- Reordenar tabelas

**Aprovação humana:**
- Mover skill global ↔ local
- Aplicar `/claude-md-optimizer` (se disponível)
- Criar CLAUDE.md em subpasta (mostrar draft)
- Apagar plugin não-usado
- Remover MCP server não-usado
- Reescrever description de skill para melhor triggering

Formato: `🔧 [HIGH] CLAUDE.md L42 refs "/foo" inexistente. Sugestão: remover linha 42. Aplicar? [s/n/editar]`

### Fase 5: CLAUDE.md por subpasta — workflow específico

Quando subagente 1 detecta candidato:

1. Mostrar pasta + stack inferida + convenções/gotchas detectados
2. Mostrar DRAFT proposto (~30-60L)
3. Pedir aprovação: `Criar este ficheiro? [s/n/editar]`
4. Se aceita → `Write` o ficheiro
5. Se edita → aceitar versão modificada inline
6. Se rejeita → registar `feedback_no_claude_md_in_<pasta>` em memory para não voltar a propor

Exemplo de draft em `references/subagent-briefings.md` (subagente 1).

### Fase 6: Export do relatório

Se `--export-report`:
```bash
mkdir -p docs/claude
# escrever relatório completo com timestamp
```

Path: `docs/claude/CLAUDE_AUDIT_<YYYY-MM-DD>.md`

## Notas de execução

- **Sempre lançar 10 subagentes em paralelo** (mesmo bloco de tool calls) — sequencial é 10x mais lento
- **Cada subagente em context isolado** — usar `subagent_type: general-purpose` ou `Explore` para read-only
- **Briefings são auto-contidos** — subagentes não vêem esta conversa, têm de receber tudo no prompt (ler `references/subagent-briefings.md` para os prompts completos)
- **Output formato consistente** — facilita agregação na Fase 3
- **Não correr `/claude-md-optimizer` automaticamente** — só sugerir; deixar utilizador decidir scope
- **Respeitar `.gitignore`** ao detectar candidatos a CLAUDE.md
- **Recursão controlada** — `find -maxdepth 4`

## Skills relacionadas (opcionais)

Quando disponíveis no ambiente, esta skill pode encaminhar para:
- `claude-md-optimizer` — ferramenta downstream quando subagente 1 sinaliza CLAUDE.md grande
- Qualquer recomendador de automação (ex: o oficial da Anthropic) — complementar

Nenhuma é obrigatória — a auditoria funciona standalone.

## Integração com wire-base

Skills irmãs nesta plugin-base (não obrigatórias, mas complementares):

- **`mempalace-doctor`** — domínio distinto: faz audit do **tool MemPalace** (vector DB com drawers/HNSW/Knowledge Graph em `~/.mempalace/`). Se o subagente 8 (Memory health) detectar uso de MemPalace pelo utilizador (presença de `~/.mempalace/`), recomendar como acção a invocação directa de `/mempalace:doctor` em vez de inferir saúde via filesystem.
- **`/vault-audit`, `/vault-list`, `/vault-integrate`** (commands da mesma plugin-base) — se o subagente 7 (MCP servers audit) detectar API keys hardcoded ou `.mcp.json` git-tracked com creds, propor migração para Vault usando `/vault-integrate` como acção concreta em vez de só sinalizar como `CRITICAL`.
- **Hook `vault-session-check.sh`** (SessionStart) — se o subagente 6 (Hooks audit) o detectar, classificar como conhecido e não como "comando inexistente"; descreve-se em `lib/vault-env.sh`.

Se `lib/wire-common.sh` estiver disponível, o relatório final pode ser logado em `~/.wire/log/claude-deep-audit.log` via `wire_log` para histórico cross-session.

## Ver também

- `mempalace-doctor` (skill irmã) — diagnóstico do **tool MemPalace**, não da configuração Claude Code.
- `/wire-vault-doctor` (em wire-secops) — diagnóstico do **servidor Vault** (HA, seal, audit, AppRoles).
- `/vault-audit` (mesma plugin-base) — auditoria de **integração Vault por-projecto** (PLACEHOLDERs, policy coverage, .env).

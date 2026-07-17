---
name: memory-doctor
description: Auditoria e governança do setup de memória do agente em 3 camadas disjuntas — episódica (MemPalace, conversas), estrutural (Graphify, AST de código) e humana (docs/Obsidian). Inventaria e provisiona o que falta, audita cada camada, arbitra colisões entre elas (mandatos duplicados no CLAUDE.md, hooks sobre Read/Glob, sobreposição de corpus, orçamento de tools) e propõe uma regra de encaminhamento única. Read-only por defeito; instalação, upgrade e escrita de configuração só com confirmação explícita. Dispara em "memory doctor", "saúde da memória", "audit de memória", "mempalace doctor", "graphify", "as ferramentas de memória colidem", "regra de encaminhamento". NÃO confundir com claude-deep-audit (configuração Claude Code) nem com os audits de projecto do devkit.
---

# memory-doctor

Auditoria e governança das 3 camadas de memória do agente. Read-only por defeito; **doctor é o modo, router é o superset** (`--apply` é opt-in).

**Separar o check da acção.** O *check* de versão/upgrade (Gate 0) corre **sempre e primeiro** — é read-only e não depende do `--apply`. Só a *acção* (instalar, actualizar, escrever no CLAUDE.md) é que é opt-in e gated. Reportar "estás N versões atrás" nunca precisa de `--apply`; aplicar o upgrade precisa.

## Trigger

- `/memory-doctor [--apply]`
- `"memory doctor"`, `"saúde da memória"`, `"audit de memória"`, `"as ferramentas de memória colidem"`

## Princípio

Duas ferramentas a registar independentemente "o que funcionou" produzem **memória contraditória**, e o agente não tem como arbitrar. A defesa é um **contrato de âmbito por camada, com uma coluna "nunca faz"**. Um agente que sabe o que *não* lhe pertence é o que não invade a camada vizinha.

## Contrato de âmbito (canónico)

Cada agente da Fase 1 recebe **apenas a sua linha**.

| Camada | Ferramenta | Corpus | Responde a | **Nunca faz** |
|---|---|---|---|---|
| **Episódica** | MemPalace | conversas (`--mode convos`) | porquê, quando, quem decidiu | não indexa código; não descreve estrutura |
| **Estrutural** | Graphify | código, SQL, Terraform — **só** `extract --code-only` / `update` (AST local, sem API key) | o que chama o quê, raio de impacto | não guarda decisões (`reflect`, `save-result`, learning overlay); não escreve no CLAUDE.md; nada `--global`; sem backend LLM |
| **Humana** | Obsidian / docs | docs, runbooks, legal | o que preciso de ler e citar | não é índice de código nem de conversas |
| *(directa)* | ler o ficheiro | um ficheiro concreto | o conteúdo exacto | — |

## Fluxo

```
0. Gate 0: versão/upgrade        → STOP obrigatório ANTES do fan-out. Read-only.
   0a. camadas de memória         → mempalace, graphifyy: instalado vs latest (PyPI)
   0b. plugins prumo + MCP        → delega a /prumo-upgrade (não duplica)
   0c. ausente?                   → propõe instalar (identidade PyPI + versão pinada)
1. Fan-out: 3 agentes            → 1 por camada, em paralelo, cada um só com o seu contrato
2. Árbitro                       → colisões cross-camada + resolução de rota (references/arbitro.md)
3. Relatório                     → versões/upgrades primeiro, depois camadas + colisões + regra
4. Governança (--apply)          → router (references/routing-rule.md), gated pelos 3 Gates
```

**O passo 0 não é opcional nem é o fan-out.** Um sintoma que já esteja corrigido a montante não se depura — actualiza-se (Regra de ouro 1). Não avançar para o fan-out sem o veredicto de versão das três frentes (camadas, plugins, MCP). É a primeira linha de acção, sempre.

## 0. Gate 0 — versão/upgrade (primeira acção, sempre)

**STOP obrigatório antes do fan-out.** Não é só deteção de presença — **compara instalado vs latest e emite o veredicto de upgrade** para as três frentes: camadas de memória, plugins prumo e MCP. É read-only (não instala nada), por isso corre com ou sem `--apply`.

O que apurar por ferramenta: binário (`command -v`), **versão instalada**, **versão mais recente no PyPI**, versão do plugin em cache, e o *lag* entre elas. Sem o número do PyPI não há "necessidade de upgrade" — é o input que faltava e a razão de o check falhar em silêncio.

```bash
echo "── Gate 0 · versão/upgrade (ANTES do fan-out) ──"

# instalado vs latest → veredicto. Sinaliza lag; ausência vira proposta de install.
ver_verdict() {  # $1=nome  $2=instalado  $3=latest  $4=hint-de-install
  if [ -z "$2" ]; then
    echo "  ✗ $1 AUSENTE — latest PyPI ${3:-?} → propor instalar: $4"
  elif [ -z "$3" ]; then
    echo "  ℹ $1 $2 (latest indisponível — offline/VPN?)"
  elif [ "$2" = "$3" ]; then
    echo "  ✓ $1 $2 (actualizado)"
  else
    # se $3 for o maior dos dois, há upgrade; senão o instalado vai à frente (pre-release)
    newest=$(printf '%s\n%s\n' "$2" "$3" | sort -V | tail -1)
    [ "$newest" = "$3" ] \
      && echo "  ⚠ $1 $2 → latest $3 · UPGRADE PENDENTE (ler changelog ANTES de investigar)" \
      || echo "  ℹ $1 $2 (à frente do PyPI $3 — pre-release)"
  fi
}
pypi_latest() { curl -s "https://pypi.org/pypi/$1/json" 2>/dev/null | jq -r '.info.version // empty'; }

# 0a · Camadas de memória — pacotes PyPI: mempalace e graphifyy (NUNCA graphify)
mp_cli=$(mempalace --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
ver_verdict "MemPalace CLI" "$mp_cli" "$(pypi_latest mempalace)" "ver skill mempalace:init"
mp_cache=$(find ~/.claude/plugins/cache -path '*/mempalace/*/plugin.json' -print -quit 2>/dev/null | xargs -I{} jq -r '.version' {} 2>/dev/null)
[ -n "$mp_cache" ] && [ -n "$mp_cli" ] && [ "$mp_cache" != "$mp_cli" ] \
  && echo "  ⚠ MemPalace plugin-em-cache v$mp_cache ≠ CLI v$mp_cli · divergência = upgrade pendente"

gf_inst=$(uv tool list 2>/dev/null | grep -iE '^graphifyy ' | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
ver_verdict "Graphify (graphifyy)" "$gf_inst" "$(pypi_latest graphifyy)" "uv tool install graphifyy==<latest> (pinado)"

# 0b · Plugins prumo + MCP — NÃO duplicar: /prumo-upgrade já compara instalado vs marketplace
echo "  → plugins prumo + servidores MCP: correr /prumo-upgrade (instalado vs marketplace remoto)"

# 0c · Humana — vault de docs (sem versão; presença + trade-off)
echo "  docs/Obsidian: $(find "$HOME" -maxdepth 3 -type d -name '.obsidian' -print -quit 2>/dev/null || echo 'nenhum vault detectado')"
```

**Divergência CLI vs plugin-em-cache** (ex.: MemPalace CLI 3.6.0 vs plugin 3.3.3) é upgrade pendente, não cosmético. **Ausência** não é silêncio: é uma **proposta de instalação** (identidade PyPI verificada + versão pinada — ver guarda anti-typosquat) que passa pelos 3 gates como qualquer outra acção. **`graphifyy` à frente do PyPI** ou o slot `graphify` a aparecer = alarme, não conveniência.

### Guarda anti-typosquat (fail-closed, obrigatória)

O pacote legítimo é **`graphifyy`**. **`graphify` é um slot por reclamar no PyPI** (404 verificado em 2026-07-12) — alvo aberto de typosquat.

- **Nunca** `uv tool install graphify`. Sempre `graphifyy`, com **versão pinada**.
- Antes de instalar, verificar a identidade no PyPI e mostrá-la ao utilizador:

```bash
curl -s https://pypi.org/pypi/graphifyy/json | jq -r '"\(.info.name) \(.info.version) — \(.info.project_urls.Repository) — \(.info.license[0:20])"'
```

- Se um dia `graphify` **existir** no PyPI, isso é **alarme**, não conveniência — parar e avisar.

### Instalação com âmbito correcto

O que a skill faz, e o que **recusa** fazer:

| ✅ Faz (com confirmação) | ❌ Recusa |
|---|---|
| `uv tool install graphifyy==<ver>` (pinado) | `graphify claude install` — escreve no CLAUDE.md **e instala PreToolUse hook sobre `Read`/`Glob`** |
| `graphify hook install` — git hooks post-commit/post-checkout (determinístico, zero API) | `graphify global add` / `extract --global` — instalação é por-projecto |
| `.claudeignore` com `graph.json` e `graphify-out/` | `uv tool install graphify` — typosquat |

O `.claudeignore` não é opcional: sem ele, o `graph.json` reescrito a cada commit **invalida a prompt cache** e pagas o re-upload.

A regra de encaminhamento é escrita **por nós**, uma só vez, na Fase 4 — nunca pelo instalador da ferramenta.

Toda a instalação/upgrade passa pelos **3 gates** (abaixo) e pede confirmação. **Upgrades nunca são automáticos.**

## Gates (antes de qualquer escrita, instalação ou upgrade)

O `prumo-base` é foundacional e não depende do devkit — estes gates são **próprios desta skill**, não uma referência externa.

- **Gate 1 · Modo operacional.** Ler `PRUMO_OPERATING_MODE` (ou `~/.prumo/mode`; default `prod`). Em `dev`, degradar para **report-only**. Em `lab`, avisar que o bypass está activo.
- **Gate 2 · Sample / empty-shell.** Se o projecto for um shell de exemplo (marcadores `.dev-shell`, `SAMPLE.md`, `PRUMO_AUDIT_PROFILE=dev-shell`), degradar para report-only — não escrever no CLAUDE.md de um sample.
- **Gate 3 · Confirmação humana individual.** Toda a acção que mute ficheiros (CLAUDE.md, `.claudeignore`), instale ou actualize um pacote **mostra o diff/comando e pede confirmação, uma a uma**. Nunca encadear acções sob uma só aprovação.

Backup antes de escrever: `.bak` ao lado do ficheiro, ou `prumo_backup` se o `prumo-common.sh` existir.

## 1. Fan-out — 3 agentes

Lançar **em paralelo**, um por camada. Cada agente recebe **só a sua linha** do contrato de âmbito + a sua reference:

| Agente | Reference |
|---|---|
| Episódico (MemPalace) | `references/camada-episodica.md` |
| Estrutural (Graphify) | `references/camada-estrutural.md` |
| Humano (docs/Obsidian) | `references/camada-humana.md` |

Cada agente audita **saúde** *e* **fidelidade ao âmbito** da sua ferramenta. Se a camada estiver ausente, devolve *"ausente — eis o que ganharias e o custo"*, nunca silêncio.

**Receita de introspecção (obrigatória):** derivar verdade-base do **código/CLI da própria ferramenta**, não da documentação. É o que faz a diferença — foi assim que se estabeleceu que `graph_stats.total_edges` conta tunnels *implícitos* e não é comparável com `list_tunnels`.

## 2. Árbitro

Depois do fan-out, correr o **árbitro** — o único agente que não audita nenhuma ferramenta, e sim o **espaço entre elas**. Carregar `references/arbitro.md` e avaliar as 7 colisões:

| # | Colisão | Sev |
|---|---|---|
| C1 | Mandatos concorrentes no CLAUDE.md | CRIT |
| C2 | PreToolUse hook do graphify sobre `Read`/`Glob` | CRIT |
| C3 | Sobreposição de corpus (`mempalace mine` em `--mode projects`) | CRIT |
| C4 | Ambições episódicas do Graphify (`reflect`, `save-result`, overlays) | CRIT |
| C5 | Orçamento de tools (>`TOOL_BUDGET_WARN`) | WARN |
| C6 | `.claudeignore` sem `graph.json` / `graphify-out/` | WARN |
| C7 | Âmbito global (`~/.graphify/global-graph.json`) | WARN |

**Anti-falso-verde:** uma colisão que não pode ser avaliada porque a camada está ausente reporta-se como **"não avaliável — camada X ausente"**, nunca como "sem colisão".

O árbitro é **read-only**: nomeia a remediação, não a executa. A execução é a Fase 4.

## 3. Relatório

```
# Memory Doctor — <timestamp>

## Resumo
<estado global em uma linha: N camadas activas, M colisões CRIT, K WARN, U upgrades pendentes>

## UPGRADES (Gate 0 — primeiro, sempre)
| Frente | Instalado | Latest | Estado |
|---|---|---|---|
| MemPalace (CLI) | <x> | <pypi> | ✅ actualizado / ⚠️ upgrade pendente |
| Graphify (graphifyy) | <x> | <pypi> | ✅ / ⚠️ / ✗ ausente → propor instalar |
| Plugins prumo + MCP | — | — | → /prumo-upgrade (delegado) |
- ⚠️ Divergência CLI vs plugin-em-cache: <se houver>
- ✗ Ausente → proposta de instalação (pinada, identidade PyPI verificada): <comando>

## CAMADAS
| Camada | Ferramenta | Estado | Saúde |
|---|---|---|---|
| Episódica | MemPalace v<x> | ✅ activa | <drawers, KG, backups> |
| Estrutural | Graphify v<x> | ✅ activa | <graph.json, staleness, hooks> |
| Humana | docs/Obsidian | ℹ️ ausente | <trade-off de não ter> |

## ESCRITORES
- mempalace-mcp vivos: <n>          (1 por sessão Claude aberta)
- Lease do palace: detida por PID <x> (<processo>) → ⚠️ escritas de fundo bloqueadas
- Daemon: <estado> (PID <y>) | jobs: <n> failed (LockHeldByOtherProcess), <n> ok
- Locks: <n> | churn: <ritmo — medir, não o valor absoluto>
- Segmentos em quarentena: <du -sh dos .drift-* / .corrupt-*>
- Veredicto: <ex.: mining DIFERIDO — drena quando nenhuma sessão segurar a lease. Sem perda de dados.>

## COLISÕES
- 🚨 C1 mandatos concorrentes no CLAUDE.md — evidência: <linhas>
      → remediação: graphify claude uninstall + regra única (Fase 4)
- ✅ C4 ambições episódicas — limpo (sem graphify-out/memory/)
- ⚠️ C6 .claudeignore sem graph.json — invalida prompt cache a cada commit
- ℹ️ C7 não avaliável — camada estrutural ausente

## REGRA DE ENCAMINHAMENTO (proposta)
<o bloco de references/routing-rule.md>

## Acções recomendadas
1. [UPGRADE] ... (o Gate 0 vem primeiro nas acções — um bug corrigido a montante não se depura)
2. [CRIT] ...
3. [WARN] ...
```

As versões vivem na secção **UPGRADES** no topo — não repetir uma segunda tabela de versões no fim.

A secção **ESCRITORES** é obrigatória sempre que a camada episódica esteja activa — é onde se explicam, de uma só vez, corrupção de índice, mining parado e jobs falhados. Distinguir sempre **frescura** de **perda**: mining diferido não é perda de dados; corrupção de índice é.

Emoji **só** no relatório (✅ / ⚠️ / 🚨 / ℹ️), nunca fora dele.

## 4. Governança (`--apply`)

**Read-only por defeito.** Sem `--apply`, a skill reporta e pára. É aqui — e só aqui — que o doctor vira **router**.

**Antes de aplicar qualquer alteração, executar os 3 gates da secção "Gates" desta skill:**
Gate 1 (modo operacional — em `dev` degrada para report-only), Gate 2 (sample/empty-shell detection), Gate 3 (confirmação humana individual, com diff, para acções destrutivas).

Os gates são **inline** (secção "Gates" acima) — o `prumo-base` é foundacional e standalone, não é uma referência externa.

O router só age sobre colisões que o **árbitro detectou**. Cada acção é confirmada individualmente.

| Colisão | Acção do `--apply` | Destrutivo? |
|---|---|---|
| C1 mandatos concorrentes | `graphify claude uninstall`, depois escrever o bloco único de `references/routing-rule.md` no CLAUDE.md (idempotente, marcadores versionados) | Sim — altera o CLAUDE.md do utilizador. **Gate 3: mostrar diff e confirmar.** |
| C2 PreToolUse sobre `Read`/`Glob` | `graphify claude uninstall` (remove hook + secção) | Sim — Gate 3 |
| C3 mining em `--mode projects` | Documentar `--mode convos` como obrigatório; **não** apaga o que já foi indexado | Não (só documenta) |
| C4 ambições episódicas | Nomear os ficheiros a remover (`graphify-out/memory/`, `reflections/LESSONS.md`, overlays). **A remoção é do utilizador** — a skill não apaga corpus. | Não executa |
| C6 `.claudeignore` | Acrescentar `graph.json` e `graphify-out/` | Sim (edita `.claudeignore` — é path protegido) — Gate 3 |
| C7 âmbito global | Nomear `graphify global remove <tag>` | Não executa |

**Instalação/upgrade (da Fase 0)** também passa por aqui: `uv tool install graphifyy==<ver>` (pinado, nunca `graphify`) e `graphify hook install` — cada um confirmado.

### O que o router NUNCA faz

- Correr `graphify claude install` — faz o **oposto** (uninstall + regra nossa).
- Apagar corpus, índices ou drawers do utilizador.
- Actualizar uma ferramenta automaticamente.
- Fazer append cego no CLAUDE.md — a escrita é sempre por marcadores, idempotente.

## Thresholds

```
TOOL_BUDGET_WARN=35          # tools de memória num agente (MemPalace sozinho já traz 30)
VERSION_LAG_WARN=1           # ≥1 minor atrás → ler o changelog ANTES de investigar
GRAPH_STALE_DAYS=7           # graph.json mais velho que o último commit

# Modelo de escritores (camada episódica) — explica corrupção, mining parado e jobs falhados
MCP_WRITERS_WARN=2           # ≥2 processos mempalace-mcp vivos
LOCKS_CHURN_WARN=500         # ficheiros em locks/
LOCKS_CHURN_CRIT=1000
DAEMON_FAILED_WARN=1         # ≥1 job failed com LockHeldByOtherProcess
QUARANTINE_SEGMENTS_WARN=1   # qualquer segmento .drift-* / .corrupt-*
MINING_LAG_WARN=24h          # desde o último job de mine bem-sucedido
```

## Regras de ouro

**1. Changelog antes de laboratório.** Antes de investigar **qualquer** sintoma, verificar a versão instalada e ler as notas de todas as releases em falta. Custa 30 segundos e pode terminar o diagnóstico ali — um bug que já está corrigido a montante não se depura, actualiza-se. Se o sintoma observado aparecer num changelog não instalado, a acção é o **upgrade**, não a investigação. **Isto aplica-se às três camadas**, não só à episódica. É precisamente o que o **Gate 0** (Fase 0) impõe: esta regra não é uma boa intenção no fundo da skill, é o primeiro passo executável — se o Gate 0 não correu, não há diagnóstico, há uma fila furada.

**2. Nunca desligar uma guarda de integridade para destravar performance.** (Ex.: `MEMPALACE_MCP_ALLOW_PEER_WRITER=1` "resolve" o mining diferido trocando integridade por frescura — reabre a porta à corrupção.) Frescura recupera-se; um índice corrompido, não.

**3. Ler a schema da ferramenta antes de a acusar de avaria.** Um `Internal tool error` é, quase sempre, um parâmetro errado. Confirmar o contrato antes de reportar bug.

**4. A métrica de uma falha recorrente é o intervalo entre recorrências, não a ocorrência.** Um intervalo a encurtar (semanas → dias → horas) é a assinatura de falha sistemática, não de incidente isolado.

**5. Um fix não está feito até ser verificado pelo comportamento, não pelo check.** Um `integrity-check` a passar não prova que a pesquisa devolve resultados — correr uma query real e confirmar o output.

**6. Nada muta sem confirmação.** Nunca instalar, actualizar, escrever no CLAUDE.md, correr `repair --yes`, `kg_invalidate`, `VACUUM` ou um rebuild sem aprovação explícita por mensagem. Diagnóstico primeiro; acção só depois.

## Integração com prumo-base

Se `lib/prumo-common.sh` existir: respeita `PRUMO_OPERATING_MODE`, emite eventos via `prumo_log`, e faz backup pré-acção via `prumo_backup`. Funciona standalone se a lib não existir — as integrações são opt-in.

## Ver também

- `claude-deep-audit` (skill irmã) — auditoria da **configuração Claude Code** (CLAUDE.md, settings, hooks, MCPs). Domínio distinto: esta skill olha para o **setup de memória**.

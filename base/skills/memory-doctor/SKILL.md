---
name: memory-doctor
description: Auditoria e governança do setup de memória do agente em 3 camadas disjuntas — episódica (MemPalace, conversas), estrutural (Graphify, AST de código) e humana (docs/Obsidian). Inventaria e provisiona o que falta, audita cada camada, arbitra colisões entre elas (mandatos duplicados no CLAUDE.md, hooks sobre Read/Glob, sobreposição de corpus, orçamento de tools) e propõe uma regra de encaminhamento única. Read-only por defeito; instalação, upgrade e escrita de configuração só com confirmação explícita. Dispara em "memory doctor", "saúde da memória", "audit de memória", "mempalace doctor", "graphify", "as ferramentas de memória colidem", "regra de encaminhamento". NÃO confundir com claude-deep-audit (configuração Claude Code) nem com os audits de projecto do devkit.
---

# memory-doctor

Auditoria e governança das 3 camadas de memória do agente. Read-only por defeito; **doctor é o modo, router é o superset** (`--apply` é opt-in).

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
0. Inventário + provisionamento  → PRIMEIRO PASSO (instala/actualiza, com confirmação)
1. Fan-out: 3 agentes            → 1 por camada, em paralelo, cada um só com o seu contrato
2. Árbitro                       → colisões cross-camada (references/arbitro.md)
3. Relatório                     → por camada + colisões + regra de encaminhamento
4. Governança (--apply)          → router (references/routing-rule.md), gated por safe-apply
```

## 0. Inventário + provisionamento

Não é só deteção — **avalia o que falta ou está desactualizado e provisiona-o**. É a primeira coisa que a skill faz.

Por camada, apurar: binário (`command -v`), versão instalada, versão mais recente (PyPI), versão do plugin em cache, e divergências entre elas.

```bash
echo "── Inventário de camadas de memória ──"

# Episódica — MemPalace
if command -v mempalace >/dev/null 2>&1; then
  echo "  ✓ MemPalace CLI $(mempalace --version 2>/dev/null)"
  find ~/.claude/plugins/cache -path '*/mempalace/*/plugin.json' -print -quit 2>/dev/null \
    | xargs -I{} jq -r '"    plugin em cache: v\(.version)"' {} 2>/dev/null
else
  echo "  ✗ MemPalace ausente"
fi

# Estrutural — Graphify (pacote: graphifyy, NUNCA graphify)
command -v graphify >/dev/null 2>&1 \
  && echo "  ✓ Graphify $(uv tool list 2>/dev/null | grep -i '^graphifyy' || echo '(binário sem uv tool)')" \
  || echo "  ✗ Graphify ausente"

# Humana — vault de docs
echo "  docs/Obsidian: $(find "$HOME" -maxdepth 3 -type d -name '.obsidian' -print -quit 2>/dev/null || echo 'nenhum vault detectado')"
```

Sinalizar **divergência de versão** entre CLI e plugin em cache (ex.: MemPalace CLI 3.5.0 vs plugin 3.3.3) — é upgrade pendente, não cosmético.

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

Ver `references/arbitro.md` (Fase 2).

## 3. Relatório

Agrupado por camada + **escritores** + colisões + a regra de encaminhamento proposta. Emoji só no relatório (✅ / ⚠️ / 🚨 / ℹ️).

A secção **ESCRITORES** é obrigatória sempre que a camada episódica esteja activa — é onde se explicam, de uma só vez, corrupção de índice, mining parado e jobs falhados:

```
## ESCRITORES
- mempalace-mcp vivos: <n>          (1 por sessão Claude aberta)
- Lease do palace: detida por PID <x> (<processo>) → ⚠️ escritas de fundo bloqueadas
- Daemon: <estado> (PID <y>) | jobs: <n> failed (LockHeldByOtherProcess), <n> ok
- Locks: <n> | churn: <ritmo — medir, não o valor absoluto>
- Segmentos em quarentena: <du -sh dos .drift-* / .corrupt-*>
- Veredicto: <ex.: mining DIFERIDO — drena quando nenhuma sessão segurar a lease. Sem perda de dados.>
```

Distinguir sempre **frescura** de **perda**: mining diferido não é perda de dados; corrupção de índice é.

## 4. Governança (`--apply`)

Ver `references/routing-rule.md` (Fase 3). **Antes de aplicar qualquer alteração, executar os 3 gates** (secção acima).

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

**1. Changelog antes de laboratório.** Antes de investigar **qualquer** sintoma, verificar a versão instalada e ler as notas de todas as releases em falta. Custa 30 segundos e pode terminar o diagnóstico ali — um bug que já está corrigido a montante não se depura, actualiza-se. Se o sintoma observado aparecer num changelog não instalado, a acção é o **upgrade**, não a investigação. **Isto aplica-se às três camadas**, não só à episódica.

**2. Nunca desligar uma guarda de integridade para destravar performance.** (Ex.: `MEMPALACE_MCP_ALLOW_PEER_WRITER=1` "resolve" o mining diferido trocando integridade por frescura — reabre a porta à corrupção.) Frescura recupera-se; um índice corrompido, não.

**3. Ler a schema da ferramenta antes de a acusar de avaria.** Um `Internal tool error` é, quase sempre, um parâmetro errado. Confirmar o contrato antes de reportar bug.

**4. A métrica de uma falha recorrente é o intervalo entre recorrências, não a ocorrência.** Um intervalo a encurtar (semanas → dias → horas) é a assinatura de falha sistemática, não de incidente isolado.

**5. Um fix não está feito até ser verificado pelo comportamento, não pelo check.** Um `integrity-check` a passar não prova que a pesquisa devolve resultados — correr uma query real e confirmar o output.

**6. Nada muta sem confirmação.** Nunca instalar, actualizar, escrever no CLAUDE.md, correr `repair --yes`, `kg_invalidate`, `VACUUM` ou um rebuild sem aprovação explícita por mensagem. Diagnóstico primeiro; acção só depois.

## Integração com prumo-base

Se `lib/prumo-common.sh` existir: respeita `PRUMO_OPERATING_MODE`, emite eventos via `prumo_log`, e faz backup pré-acção via `prumo_backup`. Funciona standalone se a lib não existir — as integrações são opt-in.

## Ver também

- `claude-deep-audit` (skill irmã) — auditoria da **configuração Claude Code** (CLAUDE.md, settings, hooks, MCPs). Domínio distinto: esta skill olha para o **setup de memória**.

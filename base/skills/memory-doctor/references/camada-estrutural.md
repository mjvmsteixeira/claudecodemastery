# Camada estrutural — Graphify

## Contrato de âmbito

| Corpus | Responde a | **Nunca faz** |
|---|---|---|
| código, SQL, Terraform — **só** `extract --code-only` / `update` | o que chama o quê, raio de impacto | não guarda decisões (`reflect`, `save-result`, learning overlay); não escreve no CLAUDE.md; nada `--global`; sem backend LLM |

## Pacote — guarda anti-typosquat

O pacote legítimo é **`graphifyy`** (expõe os binários `graphify` e `graphify-mcp`).
**`graphify` é um slot por reclamar no PyPI** (404 verificado em 2026-07-12) — alvo aberto de typosquat.
Instalar sempre `uv tool install graphifyy==<versão>`, pinado. Se `graphify` aparecer no PyPI: **alarme**.

## Regra dura — o caminho determinístico é um flag path, não o default

A promessa "AST determinístico, offline, sem embeddings" **só se cumpre em dois comandos**:

| ✅ Determinístico (AST local, sem API key) | ❌ Puxa LLM + rede |
|---|---|
| `graphify extract --code-only` — "index code (local AST, no API key)" | `graphify extract --backend gemini\|kimi\|claude\|openai\|deepseek\|ollama` — extracção semântica |
| `graphify update <path>` — "re-extract code files (no LLM needed)" | `graphify label` / `cluster-only` — community naming por LLM |
| | `graphify add <url>` — fetch de rede |

**O default arrasta para LLM + rede.** Sair deste caminho destrói a premissa da camada. O árbitro **reporta** (WARN) quem sai; o hook **não bloqueia** (é escolha de custo, não violação de âmbito).

## Ambições episódicas — proibidas

Estes comandos são **memória episódica** e pertencem ao MemPalace. Bloqueados pelo hook:

- `graphify save-result --question Q --answer A --outcome useful|dead_end|corrected`
- `graphify reflect` → agrega em `graphify-out/reflections/LESSONS.md` (`--half-life-days 30`, `--min-corroboration 2`)
- Overlays `.graphify_learning.json`, `.graphify_analysis.json`, `.graphify_labels.json`

Dois sistemas a registar "o que funcionou" produzem memória contraditória sem árbitro.

## Integração — o que instalar e o que recusar

| ✅ | ❌ |
|---|---|
| `graphify hook install` — git hooks post-commit/post-checkout (determinístico, zero custo de API) | `graphify claude install` — *"write graphify section to CLAUDE.md + PreToolUse hook"* (verbatim do `--help`). É a colisão central. Remediação: `graphify claude uninstall`. |
| `.claudeignore` com `graph.json` + `graphify-out/` | `graphify global add` / `extract --global` → funde em `~/.graphify/global-graph.json`. Instalação é **por-projecto**. |
| Consumo por **CLI** (`explain`, `path` — os verbos de consulta reais da v0.9.18) | `graphify-mcp` — +7 tools num orçamento já em 30. |

Sem `.claudeignore`, o `graph.json` reescrito a cada commit **invalida a prompt cache**.

## Consultas úteis (o âmbito da camada)

Derivar os verbos reais de `graphify --help` — não assumir (Regra de ouro 3). Na v0.9.18 são estes; `query`/`affected` de versões anteriores **foram removidos**:

```bash
graphify path "A" "B"                       # caminho mais curto entre nós
graphify explain "X"                        # nó + vizinhos: o que toca X (raio de impacto)
```

## Levantamento (o caso de uso de auditoria)

```bash
graphify extract --code-only .              # AST puro
graphify extract --postgres "<DSN>"         # schema PostgreSQL vivo: tabelas, views, funções, FKs
graphify extract --cargo                    # deps crate→crate
graphify diagnose multigraph --json         # risco de colapso de arestas same-endpoint
```

Nota do `--help`: com `--postgres`, **detalhe ao nível de coluna não é representado no grafo**.

## Auditoria da camada

- `graph.json` existe? É mais velho que o último commit (`GRAPH_STALE_DAYS`)? → **WARN: grafo stale**; remediar com `graphify update .` (sem LLM).
- Os git hooks estão instalados? `graphify hook status`.
- `.claudeignore` cobre `graph.json` e `graphify-out/`? → senão **WARN: prompt cache invalidada a cada commit**.
- Existe `~/.graphify/global-graph.json`? → **WARN: âmbito global** (devia ser por-projecto).
- Existe `graphify-out/memory/` ou `reflections/LESSONS.md`? → **CRIT: ambição episódica activa** (invade o MemPalace).
- Existe secção graphify no CLAUDE.md ou PreToolUse hook do graphify? → **CRIT: mandato concorrente** (correr `graphify claude uninstall`).

## Se a camada estiver ausente

Reportar o trade-off, não silêncio: *"sem Graphify, perguntas de estrutura/impacto caem em grep e leitura de ficheiros — mais tokens, menos precisão. Custo de instalar: `uv tool install graphifyy==<ver>` + `graphify extract --code-only .` (offline, sem API key)."*

# Árbitro — colisões entre camadas

O árbitro é o único agente que **não audita nenhuma ferramenta**. Audita o **espaço entre elas**: onde duas camadas reclamam o mesmo terreno, o agente fica sem forma de arbitrar e a memória torna-se contraditória.

**Read-only.** Cada colisão tem uma remediação **nomeada**, nunca executada aqui — a execução é a Fase 4 (`--apply`).

**Regra anti-falso-verde:** uma colisão que não pode ser avaliada (porque a camada está ausente) reporta-se como **"não avaliável — camada X ausente"**. Nunca como "sem colisão".

---

## C1 · Mandatos concorrentes no CLAUDE.md — **CRIT**

Dois "consulta-me primeiro" a competir. O MemPalace diz *"procura na memória antes de responder sobre trabalho passado"*; o Graphify diz *"prefere `graphify query` a grep e a ler ficheiros"*. O agente não tem como arbitrar.

**Deteção:**
```bash
for f in ./CLAUDE.md ~/.claude/CLAUDE.md; do
  [ -f "$f" ] || continue
  echo "── $f"
  grep -niE 'graphify|mempalace|antes de responder|consulta.*primeiro|prefer.*query' "$f" | head
done
```

**Remediação:** `graphify claude uninstall` (remove a secção que ele escreveu) + escrever **uma única** regra de encaminhamento nossa (Fase 3, `references/routing-rule.md`). Nunca deixar dois instaladores escreverem o CLAUDE.md.

---

## C2 · PreToolUse hook sobre `Read`/`Glob` — **CRIT**

`graphify claude install` instala, verbatim do `--help`: *"write graphify section to CLAUDE.md **+ PreToolUse hook**"*. Esse hook dispara **antes de cada `Read` e `Glob`** — caminho quente, com custo de latência a cada leitura de ficheiro, num agente que já tem hooks de auto-save do MemPalace.

**Deteção:**
```bash
grep -rniE 'graphify' ~/.claude/settings.json ./.claude/settings.json 2>/dev/null | grep -i 'pretooluse\|hook'
jq -r '.hooks.PreToolUse[]?.matcher // empty' ~/.claude/settings.json 2>/dev/null | grep -iE 'read|glob'
```

**Remediação:** `graphify claude uninstall`.

**Nota de contraste:** o nosso `pre-tool-memory-scope.sh` (Fase 4) intercepta **`Bash`**, não `Read`/`Glob` — deny-list estreita, frequência baixa, zero custo no caminho quente. É essa a diferença que o torna defensável.

---

## C3 · Sobreposição de corpus — mining em `--mode projects` — **CRIT**

`mempalace mine` tem **default `--mode projects`** (verificado no `--help`): por omissão indexa **código**. O mesmo código fica em dois índices com semânticas de retrieval diferentes (embeddings vs AST), e o agente não sabe qual é autoritativo.

**Deteção:**
```bash
mempalace mine --help 2>&1 | grep -A2 'mode'          # confirmar o default do CLI
find . -name '.mempalace' -maxdepth 2 2>/dev/null      # palace de projecto
```
E, para inspeccionar wings/rooms, chamar o tool MCP **`mempalace_status`** (não é um binário — é MCP; fallback CLI `mempalace status`).

Sinal forte: wings com nomes de directórios de código, ou drawers cujo corpus é `.py`/`.ts`/`.go`.

**Remediação:** minerar **sempre** com `--mode convos`. O código pertence ao Graphify (`extract --code-only`). Se já houver código indexado, reportar — a limpeza é decisão do utilizador (fora de âmbito da skill).

---

## C4 · Ambições episódicas do Graphify — **CRIT**

`save-result` e `reflect` são **memória episódica** dentro da camada estrutural. Dois sistemas a registar independentemente "o que funcionou" produzem memória contraditória sem árbitro.

**Deteção:**
```bash
ls graphify-out/memory/ 2>/dev/null
ls graphify-out/reflections/LESSONS.md 2>/dev/null
ls .graphify_learning.json .graphify_analysis.json .graphify_labels.json 2>/dev/null
```

**Remediação:** não usar `reflect` nem `save-result`; apagar o overlay se existir. O episódico é do MemPalace. Bloqueado pelo hook da Fase 4.

---

## C5 · Orçamento de tools — **WARN**

A selecção de ferramentas degrada-se com a quantidade — é um custo real e mensurável, não teórico. O MemPalace sozinho expõe **30 tools MCP**. O `graphify-mcp` acrescentaria ~7.

**Deteção:** contar as tools de memória disponíveis na sessão (`mempalace_*`, `graphify_*`). Comparar com `TOOL_BUDGET_WARN=35`.

**Remediação:** consumir a camada estrutural por **CLI** (`graphify query`, `affected`, `path`) em vez de MCP. Seria incoerente esta skill medir o bloat e depois agravá-lo — por isso o `graphify-mcp` está fora de âmbito.

---

## C6 · `.claudeignore` sem os artefactos do grafo — **WARN**

O `graph.json` é reescrito a cada commit (git hook post-commit). Se não estiver ignorado, **invalida a prompt cache** do Claude Code e pagas o re-upload a cada commit.

**Deteção:**
```bash
grep -qE 'graph\.json' .claudeignore 2>/dev/null && echo ok || echo "FALTA graph.json"
grep -qE 'graphify-out' .claudeignore 2>/dev/null && echo ok || echo "FALTA graphify-out/"
```

**Remediação:** acrescentar `graph.json` e `graphify-out/` ao `.claudeignore` (Fase 3, `--apply`).

---

## C7 · Âmbito global do Graphify — **WARN**

`global add` / `extract --global` fundem o grafo em `~/.graphify/global-graph.json`. A instalação deve ser **por-projecto** — um grafo global mistura corpus de projectos sem relação e dilui a precisão do `affected`.

**Deteção:**
```bash
ls ~/.graphify/global-graph.json 2>/dev/null && graphify global list 2>/dev/null
```

**Remediação:** `graphify global remove <tag>` (confirmado no `--help`; `graphify global list` mostra os tags registados).

> **Nota de verdade-base:** o `graphify install` aceita **`--platform <P>`**, **não** existe uma flag `--project` (verificado no `--help` de graphifyy 0.9.15 — zero ocorrências). O âmbito por-projecto obtém-se **não usando** `global add` nem `extract --global`, e mantendo o `graphify-out/` dentro do repositório — não através de uma flag de instalação.

---

## Colisão adicional a vigiar (não é das 7, mas é dívida real)

**Divergência de versão** entre o CLI e o plugin em cache (ex.: MemPalace **CLI 3.5.0 vs plugin 3.3.3**). Não é colisão de âmbito, é **upgrade pendente** — reportar em INFO e nunca actualizar sem confirmação.

---

## Saída do árbitro

Por colisão: `id`, `severidade` (CRIT/WARN/INFO), `estado` (`detectada` | `limpa` | `não avaliável — camada X ausente`), `evidência` (o output do comando), `remediação` (nomeada, não executada).

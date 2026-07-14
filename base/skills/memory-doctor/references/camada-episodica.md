# Camada episódica — MemPalace

## Contrato de âmbito

| Corpus | Responde a | **Nunca faz** |
|---|---|---|
| conversas (`--mode convos`) | porquê, quando, quem decidiu | não indexa código; não descreve estrutura |

**Regra dura:** `mempalace mine` tem **default `--mode projects`** (verificado no `--help` do CLI) — por omissão indexa **código**. A camada episódica exige **`--mode convos`** sempre. Mining em `projects` é sobreposição de corpus com a camada estrutural (colisão C3).

## Variáveis

```
MEMPALACE_HOME=${MEMPALACE_HOME:-$HOME/.mempalace}
PALACE_DIR=$MEMPALACE_HOME/palace
PALACE_DB=$PALACE_DIR/chroma.sqlite3
PALACE_BACKUP=$MEMPALACE_HOME/palace.backup
PALACE_CONFIG=$MEMPALACE_HOME/mempalace.yaml
LOCKS_DIR=$MEMPALACE_HOME/locks
DAEMON_DIR=$MEMPALACE_HOME/daemon        # subpasta por palace (hash); contém queue.sqlite3
PYPI_JSON=https://pypi.org/pypi/mempalace/json
GH_RELEASES=https://api.github.com/repos/MemPalace/mempalace/releases/tags/v<versão>
```

Jobs de manutenção detectados por **padrão**, não por nome fixo (`launchctl list | grep -i mempalace`; `systemctl --user list-units '*mempalace*'`).

Se `PALACE_CONFIG` não existir, o palace não está inicializado — reportar e parar (não fazer `init` automático).

---

## Etapa 0 — Versão e changelog · **PRIMEIRA, sempre**

**Porquê:** numa investigação real (2026-07-14) gastou-se uma hora a caçar em laboratório a causa de corrupção do FTS5. Estava **corrigida no changelog do 3.3.6** (#1477) — uma release à frente da instalada. Verificar a versão custa 30 segundos e pode **terminar o diagnóstico ali**.

```bash
mempalace --version
curl -s "$PYPI_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)['info']['version'])"
```

Se houver desfasamento, **ler as notas de todas as releases em falta** e cruzar com os sintomas **antes** de qualquer investigação:

```bash
for tag in v3.3.6 v3.4.0 v3.4.1 v3.5.0; do
  curl -s "https://api.github.com/repos/MemPalace/mempalace/releases/tags/$tag" | python3 -c "
import sys,json,re
b=json.load(sys.stdin).get('body') or ''
for line in b.splitlines():
    if re.search(r'fts5|integrity|corrupt|lock|rac(e|ing)|concurren|hnsw|sqlite|daemon|silent', line, re.I):
        print(line.strip()[:200])"
done
```

**Severidade: 🚨 STOP.** Se o sintoma observado aparecer num changelog **não instalado**, a acção é o **upgrade**, não a investigação. Um bug já corrigido a montante não se depura.

**Nota sobre as duas versões** (não as confundir):
- **Pacote Python** (`mempalace`, via `uv tool`/pip) — é de onde vêm o CLI e o `mempalace-mcp`.
- **Plugin Claude Code** (em `~/.claude/plugins/cache/mempalace/`) — só faz o *wiring* (hooks, commands, config do MCP).

Podem divergir (observado: **pacote 3.5.0, plugin 3.3.3**). Reportar as duas separadamente; a que manda no comportamento do índice é a do **pacote**.

---

## Etapa 4b — Modelo de escritores · **a mais importante**

A área que o doctor antigo **não cobria** — e que explica, de uma só vez, **corrupção de índice, perda aparente de escritas e mining parado**.

### 4b.1 · Quantos escritores existem

```bash
pgrep -fl mempalace-mcp        # 1 por sessão Claude aberta
mempalace daemon status
```

| Condição | Severidade |
|---|---|
| Pacote **< 3.5.0** e **≥2** MCP vivos | 🚨 **CRIT — risco de corrupção do índice.** Vários `PersistentClient` de longa duração mantêm estado HNSW/FTS em memória; o cadeado por operação não os obriga a esquecê-lo. |
| Pacote **≥ 3.5.0** e ≥2 MCP | ℹ️ **INFO** — os restantes ficam read-only por desenho (#1818). Sem risco. |

### 4b.2 · Quem segura a lease de escrita — o cheque decisivo

```bash
lsof "$LOCKS_DIR"/mine_palace_*.lock
```

Se o dono for um `mempalace-mcp`, **todas as escritas de fundo estão bloqueadas** — daemon, hooks e CLI. Confirmar com uma sonda:

```bash
mkdir -p /tmp/mine-probe && echo teste > /tmp/mine-probe/p.md
mempalace mine /tmp/mine-probe --wing wing_probe --mode convos   # espera-se: LockHeldByOtherProcess
rm -rf /tmp/mine-probe
```

**Causa-raiz (3.5.0):** `_acquire_mcp_writer_lock()` é chamado por `tool_status()`, e a lease é mantida **durante toda a vida do processo MCP**. Como o protocolo do MemPalace manda chamar `mempalace_status` no wake-up, **toda a sessão Claude reclama o direito de escrita ao arrancar**. É um conflito directo entre **#1818** (escritor único) e **#1826** (daemon).

**Severidade: ⚠️ WARN — mining diferido**, não perda de dados (ver 4b.3).

**NÃO resolver com `MEMPALACE_MCP_ALLOW_PEER_WRITER=1`** — isso desliga a guarda e reabre a porta à corrupção. Troca integridade por frescura; é o mau negócio.

### 4b.3 · Fila do daemon

```bash
Q=$(find "$DAEMON_DIR" -name queue.sqlite3 | head -1)
sqlite3 "$Q" "SELECT kind, state, count(*) FROM jobs GROUP BY 1,2;"
sqlite3 "$Q" "SELECT kind, json_extract(error_json,'\$.message') FROM jobs WHERE state='failed' ORDER BY rowid DESC LIMIT 3;"
```

Interpretação:
- Jobs `failed` com `LockHeldByOtherProcess` → **sintoma de 4b.2**, não avaria do daemon.
- **Não há retry para `failed`**: `MAX_ATTEMPTS=3` só re-enfileira jobs presos em `running` (recuperação de crash).
- **Mas não se perde trabalho:** cada stop-hook submete um job novo (o dedupe só bloqueia `queued`/`running`), pelo que drenam quando nenhuma sessão segurar a lease. **O custo é frescura, não dados.**
- Zero jobs com `hooks.daemon=true` → o daemon **não está a ser descoberto**; verificar `endpoint.json` e se está vivo.

### 4b.4 · Churn de locks

```bash
ls "$LOCKS_DIR" | wc -l
```

**Não olhar para o valor absoluto — medir o ritmo.** Limpar e recontar 10 minutos depois.

> Observado em 2026-07-14: 1.011 locks; após limpeza, **241 em 10 minutos**. Foi o sinal mais forte de contenção.

Um valor alto e **estável** é lixo antigo. Um valor alto e **a crescer** é contenção activa. São diagnósticos opostos.

---

## Etapa 2 (adenda) — Integridade do FTS5

O `PRAGMA integrity_check` completo é **caro** num DB de ~1,7G. Para o FTS5, usar o check **dirigido**:

```bash
sqlite3 "$PALACE_DB" "INSERT INTO embedding_fulltext_search(embedding_fulltext_search) VALUES('integrity-check');"
```

Silêncio = ok; erro = índice invertido corrompido.

**Fix — `repair --yes` NÃO corrige o FTS5** (só o HNSW). O caminho é o rebuild por SQL:

```bash
cp "$PALACE_DB" "$MEMPALACE_HOME/chroma.sqlite3.pre-fts5-$(date +%Y%m%d)"   # SEMPRE antes
sqlite3 "$PALACE_DB" "INSERT INTO embedding_fulltext_search(embedding_fulltext_search) VALUES('rebuild');"
```

**Verificação obrigatória pós-fix:** não basta o `integrity-check` passar. Correr uma **pesquisa real** e confirmar que vem `bm25_score` populado. Sem isso, **não se declara reparado** — um check que passa não prova que a pesquisa devolve resultados.

**Segmentos em quarentena:**

```bash
du -sh "$PALACE_DIR"/*.drift-* "$PALACE_DIR"/*.corrupt-* 2>/dev/null
```

Acumulam a cada `repair`/abertura divergente (observado: **110M numa só noite**). Removíveis quando já não referenciados — com confirmação.

---

## Etapa 5 (adenda) — Armadilha do embedding no upgrade

Ao propor upgrade a partir de **< 3.3.6**, avisar que o modelo por defeito mudou (**MiniLM → embeddinggemma**) — mas **verificar antes de assustar**: se a `config.json` **não** tiver a chave `embedding_model`, o código faz *fallback* para `minilm` e **não é preciso re-embed**.

Blindar a identidade do embedder no próprio palace:

```bash
# fixar na config: "embedding_model": "minilm"
mempalace palace set-embedder --model minilm
```

Sem isto, o palace emite `EmbedderIdentityUnknownWarning` e **um upgrade futuro pode trocar o modelo em silêncio** — espaços vectoriais incompatíveis, e a pesquisa degrada sem erro visível.

---

## Introspecção (verdade-base derivada do código, não da doc)

- `graph_stats.total_edges` conta tunnels **implícitos** (rooms com o mesmo nome em ≥2 wings, excluindo `general`); `list_tunnels` conta os **explícitos**. **Não comparar os dois** — medem coisas diferentes.
- `repair --yes` reconstrói **HNSW**, **não** a FTS5.
- Cache do graph com TTL de 60s (`_GRAPH_CACHE_TTL` em `palace_graph.py`).
- `_acquire_mcp_writer_lock()` é chamado por `tool_status()` e a lease dura toda a vida do processo MCP (ver 4b.2).
- **Ler a schema antes de acusar a ferramenta de avaria:** o `diary_write` do 3.3.5 devolve `Internal tool error` quando falta um parâmetro — o campo chama-se **`entry`**, não `content` (corrigido em 3.4.0). Um `Internal tool error` é, quase sempre, um parâmetro errado.

## Métrica de falha recorrente

**O sinal é o intervalo entre recorrências, não a ocorrência.** Observado: 18/06 → 13/07 → 14/07 (<24h). O **colapso do intervalo** foi o que provou tratar-se de falha **sistemática**, não de incidente isolado.

## Estado conhecido (2026-07-14 — o próximo doctor deve saber)

- Pacote instalado: **3.5.0**; embedder **fixado em `minilm`** (dim=384).
- `com.mjvmst.mempalace-fts5-canary` (15 min) → `~/.mempalace/fts5-canary.log`: regista o check FTS5 + PIDs vivos + nº de locks + mtime do DB. **É a prova pendente**: sem `CORRUPT` em 24-48h, confirma-se que o #1477 era a causa-raiz.
- `com.mjvmst.mempalace-daemon` (launchd, KeepAlive) — activo, com `hooks.daemon=true`.
- Snapshot pré-upgrade: `~/.mempalace/backups/palace-pre-350-20260714` (1,8G, validado).
- **Dois pontos por reportar upstream:** (1) `tool_status()` não devia reclamar a writer lease; (2) jobs falhados por cadeado deviam voltar à fila em vez de morrer.

---

# mempalace-doctor — detalhe das etapas

> Todos os comandos usam as variáveis definidas no `SKILL.md` (`PALACE_DIR`, `PALACE_BACKUP`,
> etc.), resolvidas a partir de `$HOME`/`MEMPALACE_HOME`. Não usar paths absolutos hardcoded.

## Etapa 1 — Status básico (drawers / wings / rooms)

Chamar (preferir MCP, fallback CLI):

- `mempalace_status` → `total_drawers`, `wings`, `rooms`, `palace_path`
- `mempalace repair-status` → divergência sqlite vs HNSW (drawers + closets)

Recolher:
- Total de drawers
- Distribuição por wing (detectar wing imbalance: `max/min > WING_IMBALANCE_RATIO`)
- Rooms vazias ou com 1 drawer (sinal de mining mal direccionado)

Categorizar por severidade:
- **OK** — drawers consistentes, sem divergência > `DRAWER_DIVERGENCE`
- **WARN** — divergência moderada, wing imbalance, rooms quase-vazias
- **CRIT** — HNSW UNKNOWN/divergente fortemente, drawers órfãos, sqlite count = 0

## Etapa 2 — Integridade (HNSW + SQLite)

```bash
du -sh "$PALACE_DIR"
ls -lah "$PALACE_DIR"/*/link_lists.bin 2>/dev/null
ls -lah "$PALACE_DIR"/chroma.sqlite3
sqlite3 "$PALACE_DIR"/chroma.sqlite3 'PRAGMA integrity_check;' | head -5
```

Sinalizar:
- Qualquer `link_lists.bin > LINK_LISTS_WARN` → **WARN: bloat HNSW**, sugerir `repair --yes`
- `link_lists.bin > LINK_LISTS_CRIT` → **CRIT**
- `PALACE_DIR > PALACE_SIZE_CRIT` → **CRIT: palace inflacionado**
- `PRAGMA integrity_check` ≠ `ok` → **CRIT: corrupção SQLite**
- HNSW segment metadata "not yet flushed" persistente → **WARN: indexação pendente** (recomendar `repair --mode max-seq-id`)

## Etapa 3 — Knowledge Graph & Graph

- `mempalace_kg_stats` → entidades, triples, current vs expired, relationship_types
- `mempalace_graph_stats` → total_rooms, tunnel_rooms, total_edges, top_tunnels (**implícitos**)
- `mempalace_list_tunnels` → tunnels **explícitos** (criados via `create_tunnel`)

**Importante** (descoberto lendo `palace_graph.py`):
- `graph_stats.total_edges` conta tunnels **IMPLÍCITOS** — rooms com o mesmo nome em ≥2 wings (excluindo `room == "general"`, que é filtrada no `build_graph`).
- `list_tunnels` conta tunnels **EXPLÍCITOS** — criados manualmente via `mempalace_create_tunnel`.
- **Não comparar os dois directamente** — medem coisas diferentes. Tunnels explícitos não aparecem em `graph_stats`.

Sinalizar:
- `triples < KG_TRIPLES_MIN` para palace > 1k drawers → **WARN: KG raso**
- `expired/(current+expired) > KG_EXPIRED_RATIO_WARN%` → **WARN: factos obsoletos acumulados**
- `total_edges = 0` E múltiplos wings com rooms partilháveis (`technical`, `architecture`, `planning`, `problems`) → **WARN: indexação de graph stale** (sugerir `mempalace_reconnect` + verificar TTL cache 60s)
- Wings sem nenhum tunnel implícito **nem** explícito → **INFO: oportunidade de cross-wing linking**
- Tunnels explícitos com `room == "general"` → **INFO: não geram edge implícita** (filtrada no build_graph); usar room mais específica
- Rooms grandes (>500 drawers) sem nenhum triple no KG sobre os seus tópicos → **WARN: conhecimento textual sem extracção factual**

## Etapa 4 — Mining & Hooks

- `mempalace_hook_settings` (se disponível) → confirmar hooks activos (auto-mine, auto-diary, session-end)
- `mempalace_diary_read` (último entry) → calcular gap; se `> DIARY_GAP_WARN` → **WARN: diary stale**
- Procurar drawers recentes (`technical`, `problems`) — se nenhum criado nos últimos 7 dias apesar de actividade no projecto → **WARN: mining backlog**
- `mempalace_check_duplicate` em sample de drawers → estimar taxa de duplicados

Verificar jobs de manutenção (detectar por padrão, não por nome fixo):
```bash
# macOS
launchctl list | grep -i mempalace
# Linux
systemctl --user list-units '*mempalace*' 2>/dev/null
```
- Se não houver job de health nem de backup → **INFO: jobs de manutenção não instalados**

## Etapa 5 — Backups & Versão

> Nota cruzada: a verificação de versão/changelog é a Etapa 0 — esta secção trata de backups e do upgrade em si.

```bash
du -sh "$PALACE_BACKUP" 2>/dev/null
# data do backup — macOS usa `stat -f`, Linux usa `stat -c`
stat -f "%Sm" -t "%Y-%m-%d" "$PALACE_BACKUP" 2>/dev/null \
  || stat -c "%y" "$PALACE_BACKUP" 2>/dev/null | cut -d' ' -f1
mempalace --version
pip index versions mempalace 2>/dev/null | head -3
```

Sinalizar:
- `palace.backup` ausente → **WARN: sem backup local pós-repair**
- Backup mais antigo que `BACKUP_AGE_CRIT` → **CRIT** (sugerir refresh ou apagar se obsoleto)
- Versão instalada < latest pip → **INFO: upgrade disponível** — **NÃO upgrade automaticamente**, perguntar ao utilizador (configs em `MEMPALACE_HOME` são preservadas, mas confirmar na mesma).

## Etapa 6 — Relatório

Output estruturado, conciso, agrupado por categoria. Modelo (Markdown):

```
# MemPalace Doctor — <timestamp>

## Resumo
<status global em uma linha>

## DRAWERS
- Total: 16.282 (sessions 11.536, wazuh_databases 212, wing_ansible 1)
- Imbalance: ⚠️  wing_ansible vs sessions = 1:11.536 (mining mal direccionado)

## HNSW / SQLite
- ✅ Integrity check: ok
- ✅ link_lists.bin: 0B (saudável pós-repair)
- Tamanho palace: 211M

## KG
- Entidades: 141 / Triples: 95 (current 95, expired 0)
- ⚠️  Triples < KG_TRIPLES_MIN (raso para 16k drawers)

## GRAPH
- Tunnels: 6 criados, mas total_edges=0 (cache stale)
- Sugestão: mempalace_reconnect

## MINING / HOOKS
- Último diary: 2026-04-28 (3 dias)
- Hooks: <list>
- Duplicados detectados: 0/sample

## BACKUPS / VERSÃO
- palace.backup: 196M (idade <1d)
- Versão instalada: 3.3.3 / latest: 3.3.3

## Acções recomendadas
1. [WARN] mining wing vazia — mempalace mine <dir>
2. [WARN] crescer KG — mempalace_kg_add para entidades documentadas
3. [INFO] reconnect MCP para refrescar graph_stats
```

Usar emoji só para legibilidade do relatório (✅ / ⚠️ / 🚨 / ℹ️). Não usar emojis fora do relatório.

## Etapa 7 — Acções (com confirmação)

Para cada acção sugerida, perguntar ao utilizador antes de executar. **Nunca encadear acções sem aprovação explícita.**

Acções possíveis:
- `mempalace repair --yes` — rebuild HNSW (faz backup automático)
- `mempalace repair --mode max-seq-id` — fix cirúrgico (não rebuild)
- `mempalace_reconnect` — refrescar MCP
- `mempalace_kg_invalidate` — marcar triples obsoletos
- `sqlite3 "$PALACE_DIR"/chroma.sqlite3 'VACUUM;'` — compactar SQLite
- `rm -rf "$PALACE_BACKUP"` — apagar backup obsoleto (apenas se idade > `BACKUP_AGE_CRIT`)

Sempre informar:
- O que vai ser feito
- Tempo estimado
- Se é reversível
- Backup recomendado antes de operações destrutivas

## Limitações conhecidas

- `mempalace_list_rooms` por wing pode devolver `{}` mesmo com rooms — usar `graph_stats.rooms_per_wing` em alternativa
- `graph_stats.total_edges` mede tunnels **implícitos** (rooms partilhadas, excluindo `general`); não conta tunnels explícitos do `create_tunnel`. Para auditar tunnels explícitos usar `list_tunnels`.
- Cache do graph tem TTL de 60s (`_GRAPH_CACHE_TTL` em `palace_graph.py`); pode mostrar dados ligeiramente stale.
- `repair-status` pode reportar HNSW UNKNOWN persistente — é cosmético, drawers indexados correctamente. Confirmar via query semântica real (`mempalace_search`).
- `repair --yes` reconstrói **HNSW** mas não a FTS5. Para corrupção FTS5: `sqlite3 "$PALACE_DIR"/chroma.sqlite3 "INSERT INTO embedding_fulltext_search(embedding_fulltext_search) VALUES('rebuild')"`.
- Migrações antigas podem deixar `palace.backup` órfão de outra estrutura — não usar para restore sem inspecção.

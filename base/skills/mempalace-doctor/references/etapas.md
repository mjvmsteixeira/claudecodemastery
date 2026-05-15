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

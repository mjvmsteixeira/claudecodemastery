# Performance — backend

Referência carregada pela skill `performance-audit` quando o scope inclui `backend`.

## O que procurar

| Problema | Como detectar | Severidade |
|----------|---------------|------------|
| N+1 queries | Query dentro de loop sobre resultados de outra query; ORM sem eager loading (`select_related`/`prefetch_related`, `includes`, `JOIN FETCH`, `.Include()`) | HIGH |
| Queries lentas / sem índice | `WHERE`/`ORDER BY`/`JOIN` em colunas sem índice; `SELECT *` em tabelas largas; full table scans | HIGH |
| Falta de paginação | Endpoints que devolvem coleções sem `LIMIT`/cursor/paginação | MEDIUM |
| I/O bloqueante em código async | `requests` em vez de `httpx`/`aiohttp` num handler async; `fs.readFileSync` num handler Express; `time.sleep` em async | HIGH |
| Sync-over-async | `.Result`/`.Wait()` em .NET; `asyncio.run` dentro de código já async; `await` em loop quando podia ser `gather`/`Promise.all` | MEDIUM–HIGH |
| Trabalho pesado no request path | Hashing/encriptação/parsing grande sem offload para worker/queue | MEDIUM |
| Falta de cache | Recálculo ou refetch repetido de dados estáveis; sem cache em queries hot | MEDIUM |
| Conexões não pooled | Nova conexão DB/HTTP por request em vez de pool | MEDIUM |

## Detecção — heurísticas grep

```bash
# N+1: queries de ORM dentro de loops (inspeccionar manualmente os hits)
grep -rnE '(for |\.forEach|\.map\()' --include='*.py' --include='*.rb' --include='*.js' --include='*.ts' --include='*.go' --include='*.java' --include='*.cs' . \
  | grep -vE 'node_modules|vendor|__pycache__'   # cruzar com chamadas a ORM no corpo

# I/O bloqueante em contexto async
grep -rn 'requests\.\(get\|post\)' --include='*.py' .        # cruzar com `async def`
grep -rn 'asyncio\.run(' --include='*.py' .                  # crash se chamado dentro de loop a correr
grep -rn 'readFileSync\|execSync' --include='*.js' --include='*.ts' .
grep -rn '\.Result\b\|\.Wait()' --include='*.cs' .

# SELECT *
grep -rniE 'select \*' --include='*.py' --include='*.rb' --include='*.js' --include='*.ts' --include='*.go' --include='*.java' --include='*.cs' --include='*.sql' .
```

## Ferramentas

```bash
# Profiling de queries (quando há DB acessível)
#   Postgres → EXPLAIN ANALYZE nas queries suspeitas; pg_stat_statements
#   Django   → django-silk ou nplusone
#   Rails    → bullet gem
#   Node/Prisma → log de queries + análise

# Profiling de CPU/memória
#   Python → py-spy / cProfile
#   Node   → clinic.js / --prof
#   Go     → pprof
```

Reportar cada finding com `ficheiro:linha` e o impacto estimado.

---
name: performance-audit
description: Auditoria de performance do projecto actual — frontend (bundle size, code-splitting, imagens, render bloqueante, re-renders), backend (N+1 queries, queries lentas, falta de índices, I/O bloqueante, sync-over-async, falta de cache) e resource leaks (ficheiros/conexões não fechados, IDisposable, event listeners, timers, goroutine/task leaks). Linguagem-agnóstico. Dispara em "audita a performance", "performance audit", "isto está lento", "N+1 queries", "memory leak", "o bundle é grande?", "optimizações". Read-only por defeito. NÃO confundir com qualidade de código geral (skill code-quality) — esta foca latência, throughput e uso de recursos.
---

# performance-audit

Auditoria de performance linguagem-agnóstica. Read-only por defeito.

## Trigger

- `/performance-audit [flags]`
- `"audita a performance disto"`, `"isto está lento"`, `"N+1 queries"`, `"memory leak"`, `"o bundle é grande?"`

## Parâmetros (passados pelo command ou inferidos do pedido)

- `scope` — um ou mais de `frontend|backend|leaks`. Default: todos os aplicáveis ao projecto.
- `ci` — modo CI. Ver `${CLAUDE_PLUGIN_ROOT}/shared/ci-mode.md`. Default: off.
- `export-report` — gravar relatório. Ver `${CLAUDE_PLUGIN_ROOT}/shared/report-format.md`.

## Metodologia

### 1. Detectar a natureza do projecto

- Há frontend? (framework de UI ou `*.html` com assets) → scope `frontend` aplicável.
- Há backend? (servidor HTTP, handlers, ORM, acesso a DB) → scope `backend` aplicável.
- Sempre aplicável → scope `leaks`.

Se um scope não se aplicar ao projecto, omiti-lo (não contar como 0 no score).

### 2. Carregar regras do projecto

Se existir `rules/audit/performance.md` na raiz do projecto auditado, ler e incorporar
(limiares de bundle size, orçamentos de performance, caminhos hot conhecidos). Se não
existir, prosseguir com o baseline universal.

### 3. Carregar references conforme o scope e lançar agentes paralelos

| Scope | Reference |
|-------|-----------|
| `frontend` | `references/frontend-perf.md` |
| `backend` | `references/backend-perf.md` |
| `leaks` | `references/resource-leaks.md` |

Lançar um agente por scope activo, em paralelo.

### 4. Scoring

Score por dimensão e total conforme `${CLAUDE_PLUGIN_ROOT}/shared/scoring.md`.
As dimensões são os scopes avaliados.

### 5. Relatório

- Modo interactivo: estrutura de `${CLAUDE_PLUGIN_ROOT}/shared/report-format.md`.
- Modo `ci`: comportamento de `${CLAUDE_PLUGIN_ROOT}/shared/ci-mode.md` — JSON, exit code
  por severidade, sem auto-fix. (Sem SARIF — performance-audit não é audit de segurança.)
- Com `export-report`: gravar em `docs/performance/PERFORMANCE_REPORT_<YYYY-MM-DD>.md`.

### 6. Correcções

Fora de `ci`: depois do relatório, perguntar quais findings corrigir. Optimizações que
mudam comportamento observável (cache, paginação) exigem confirmação. Em `ci`: nunca corrigir.

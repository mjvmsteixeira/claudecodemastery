# Performance — resource leaks

Referência carregada pela skill `performance-audit` quando o scope inclui `leaks`.

## O que procurar

| Problema | Como detectar | Severidade |
|----------|---------------|------------|
| Ficheiros/conexões não fechados | `open()` sem `with`/`try-finally`/`defer`; DB connection sem `close`; faltam context managers | HIGH |
| `IDisposable` não disposto (.NET) | `new` de tipo `IDisposable` sem `using` nem `Dispose()` | HIGH |
| Event listeners não removidos | `addEventListener` sem `removeEventListener`; `useEffect` sem cleanup return | MEDIUM |
| Timers/intervals não limpos | `setInterval`/`setTimeout` sem `clear*` no cleanup | MEDIUM |
| Goroutine/task leaks | Goroutine sem caminho de saída; `Task`/`Thread` sem cancellation token; subscriptions sem unsubscribe | HIGH |
| Acumulação não-limitada | Caches/listas/dicts globais que só crescem; sem TTL nem limite de tamanho | MEDIUM |
| Closures a reter objectos grandes | Closures de longa duração que capturam buffers/DOM nodes | MEDIUM |

## Detecção — heurísticas grep

```bash
# Python — open() sem with
grep -rnE '[^.]\bopen\(' --include='*.py' . | grep -v 'with ' | grep -v __pycache__

# JS/TS — listeners e timers sem cleanup (inspeccionar os hits)
grep -rn 'addEventListener\|setInterval' --include='*.js' --include='*.ts' --include='*.tsx' --include='*.jsx' . \
  | grep -v node_modules

# .NET — IDisposable sem using
grep -rnE 'new (SqlConnection|StreamReader|StreamWriter|HttpClient|FileStream)\b' \
  --include='*.cs' . | grep -v 'using'

# Go — defer em falta perto de abertura de recursos (inspecção manual dos hits)
grep -rnE '\.Open\(|sql\.Open|os\.Open' --include='*.go' .
```

## Ferramentas

```bash
# Python → tracemalloc, objgraph
# Node   → --inspect + heap snapshots no DevTools; clinic.js
# Go     → pprof (heap profile), runtime.NumGoroutine() ao longo do tempo
# .NET   → dotnet-counters, dotnet-gcdump
```

Reportar cada finding com `ficheiro:linha` e o recurso que fica preso.

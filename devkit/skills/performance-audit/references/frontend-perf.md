# Performance — frontend

Referência carregada pela skill `performance-audit` quando o scope inclui `frontend`.

## O que procurar

| Problema | Como detectar | Severidade |
|----------|---------------|------------|
| Bundle JS demasiado grande | Build + inspeccionar output; chunk principal > 250 KB gzip → MEDIUM, > 500 KB → HIGH | conforme tamanho |
| Sem code-splitting | Rotas sem `import()` dinâmico / `React.lazy` / `defineAsyncComponent` | MEDIUM |
| Dependências pesadas evitáveis | `moment` (usar `date-fns`/`dayjs`), `lodash` inteiro (usar `lodash-es` + imports pontuais) | MEDIUM |
| Imagens não optimizadas | `<img>` sem `loading="lazy"`, sem `srcset`/`sizes`, formatos não-modernos (sem WebP/AVIF) | LOW–MEDIUM |
| Render bloqueante | CSS/JS síncrono no `<head>` sem `defer`/`async`; web fonts sem `font-display` | MEDIUM |
| Re-renders desnecessários | Listas sem `key` estável; falta de memoização em componentes caros; `useEffect` com deps mal definidas | MEDIUM |
| Sem virtualização em listas longas | Listas de centenas+ de itens renderizadas inteiras | MEDIUM |

## Ferramentas

```bash
# Tamanho do bundle (depois do build de produção)
npx vite-bundle-visualizer        # Vite
npx source-map-explorer dist/**/*.js   # genérico
du -sh dist/ build/ .next/ 2>/dev/null

# Dependências: não usadas de todo (depcheck) e imports pesados conhecidos (grep)
npx depcheck
grep -rn "from 'moment'\|from \"moment\"\|import _ from 'lodash'" --include='*.js' --include='*.ts' --include='*.tsx' --include='*.jsx' .

# Lighthouse (se houver URL servível)
npx lighthouse <url> --only-categories=performance --quiet
```

Se não houver build configurado, fazer a análise estática (imports, `<img>`, `<head>`)
e indicá-lo no relatório. Reportar cada finding com `ficheiro:linha` quando aplicável.

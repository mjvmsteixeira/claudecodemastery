# Métricas de complexidade

Referência carregada pela skill `code-quality` quando o scope inclui `complexity`.

## O que medir

| Métrica | Limiar de alerta | Severidade |
|---------|------------------|------------|
| Complexidade ciclomática por função | > 10 → MEDIUM, > 20 → HIGH | conforme limiar |
| Linhas por ficheiro | > 500 → MEDIUM, > 1000 → HIGH | conforme limiar |
| Linhas por função | > 80 → MEDIUM | MEDIUM |
| Profundidade de aninhamento | > 4 níveis → MEDIUM | MEDIUM |
| Duplicação de código | > 3% do codebase → MEDIUM, > 8% → HIGH | conforme limiar |
| Parâmetros por função | > 5 → LOW | LOW |

Se o projecto tiver `rules/audit/code-quality.md` com limites próprios (ex: máx 500 linhas/componente),
esses sobrepõem-se aos limiares acima.

## Ferramentas por stack

```bash
# Multi-linguagem — complexidade ciclomática e métricas
lizard .                              # Python, JS, Java, C/C++, Go, etc.

# Python
radon cc -s -a .                      # complexidade ciclomática
radon mi -s .                         # maintainability index

# JS/TS
npx eslint . --rule '{"complexity": ["error", 10]}'

# Duplicação (multi-linguagem)
npx jscpd .                           # copy-paste detector

# Contagem de linhas por ficheiro (heurística rápida, qualquer stack)
find . -name '*.<ext>' -not -path '*/node_modules/*' -not -path '*/vendor/*' \
  -exec wc -l {} + | sort -rn | head -20
```

Se uma ferramenta não estiver instalada, indicar o comando de instalação no relatório
e prosseguir com as restantes (não bloquear o audit por falta de tooling).

Reportar cada finding com `ficheiro:linha` (ou `ficheiro:função`) e a métrica que falhou.

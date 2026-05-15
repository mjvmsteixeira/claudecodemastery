# Design system e qualidade de componentes

Referência carregada pela skill `ux-audit` quando o scope inclui `design-system` ou `components`.

## Qualidade de componentes (baseline universal)

- **Tamanho**: alertar componentes > 500 linhas (sugerir extrair sub-componentes)
- **Dead code**: componentes sem importers (`grep -r "from.*ComponentName" --include='*.ts' --include='*.tsx' --include='*.js' --include='*.jsx' --include='*.vue' --include='*.svelte'`)
- **Duplicados**: mesma função/renderização com nomes diferentes
- **Single responsibility**: componentes a fazer demasiado (data fetch + business logic + render)
- **Tipos** (TypeScript): sem `any`, props com interface explícita
- **Tests**: componentes críticos com testes (Vitest/Jest + RTL/Vue Test Utils)

## Aplicar o design system do projecto

Se carregadas de `rules/audit/ux.md`, verificar adicionalmente:
- Cores não-permitidas (ex: utility classes proibidas)
- Componentes proibidos em uso (mapa do design system)
- Padrões obrigatórios em falta (ex: ErrorRecovery em páginas com fetch)
- Brand inconsistente (nome, logo, idioma)

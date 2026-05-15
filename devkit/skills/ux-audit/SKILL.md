---
name: ux-audit
description: Auditoria de UX/UI do projecto actual — acessibilidade (WCAG 2.1 AA), usabilidade (10 heurísticas de Nielsen), responsividade, qualidade de componentes e conformidade com o design system. Detecta o framework (React, Vue, Angular, Svelte, Astro, Next, Nuxt, HTML estático, React Native) e o styling. Dispara em "audita a UX", "ux audit", "acessibilidade", "WCAG", "a11y", "isto é responsivo?", "revê o design system", "usabilidade". Aplica regras de rules/audit/ux.md se existir. NÃO confundir com auditoria de qualidade de código (skill code-quality) — esta foca a camada de interface.
---

# ux-audit

Auditoria de UX/UI — acessibilidade, usabilidade, responsividade, design system.

## Trigger

- `/ux-audit [flags]`
- `"audita a UX disto"`, `"acessibilidade"`, `"WCAG"`, `"isto é responsivo?"`, `"revê o design system"`

## Parâmetros (passados pelo command ou inferidos do pedido)

- `scope` — um ou mais de `a11y|usability|responsive|design-system|components`. Default: todos.
- `ci` — modo CI. Ver `${CLAUDE_PLUGIN_ROOT}/shared/ci-mode.md`. Default: off.
- `export-report` — gravar relatório. Ver `${CLAUDE_PLUGIN_ROOT}/shared/report-format.md`.

## Metodologia

### 1. Detectar framework e stack UI

Framework: `react`/`*.tsx` (React), `vue`/`*.vue` (Vue), `angular.json` (Angular),
`svelte` (Svelte), `solid-js` (Solid), `astro.config.*` (Astro), `next.config.*` (Next),
`nuxt.config.*` (Nuxt), `*.html` no root sem SPA (HTML estático), `react-native` (RN).
Styling: `tailwind.config.*` (Tailwind), `*.module.css` (CSS Modules), `styled-components`,
`@emotion/*`, `@mui/*`, `@chakra-ui/*`, `components/ui/` + Radix (shadcn/ui), `@mantine/*`,
`bootstrap`, inline `style=` predominante (CSS-in-JS custom).

Se não houver framework de UI nem `*.html`, informar que o `ux-audit` não se aplica e parar.

### 2. Carregar regras do projecto

Se existir `rules/audit/ux.md` na raiz do projecto auditado, ler e incorporar (design
tokens, componentes canónicos, padrões obrigatórios, brand guidelines, limites de
qualidade). Se não existir, prosseguir só com o baseline universal. (o devkit não empacota templates de rules nem oferece criá-los — ver devkit/CLAUDE.md)

### 3. Carregar references conforme o scope e lançar agentes paralelos

| Scope | Reference | Agente |
|-------|-----------|--------|
| `a11y` | `references/wcag.md` | Acessibilidade WCAG 2.1 AA |
| `usability` | `references/usability.md` | Heurísticas de Nielsen |
| `responsive` | `references/responsive.md` | Responsividade + breakpoints do projecto |
| `design-system` / `components` | `references/design-system.md` | Qualidade de componentes + design system |

Lançar um agente por scope activo, em paralelo.

### 4. Scoring

Score por dimensão e total conforme `${CLAUDE_PLUGIN_ROOT}/shared/scoring.md`.
Para `design-system`, reportar adicionalmente a % de compliance (violations / componentes verificados).

### 5. Relatório

- Modo interactivo: estrutura de `${CLAUDE_PLUGIN_ROOT}/shared/report-format.md`.
- Modo `ci`: comportamento de `${CLAUDE_PLUGIN_ROOT}/shared/ci-mode.md` — JSON, exit code
  por severidade, sem auto-fix.
- Com `export-report`: gravar em `docs/ux/UX_REPORT_<YYYY-MM-DD>.md`.

### 6. Correcções

Fora de `ci`: depois do relatório, perguntar "Queres que corrija os CRITICAL e HIGH?
[s/n/seleccionar]". Correcções autónomas seguras: `aria-label`, `htmlFor`, headers
semânticos, `alt=""`. Alterações de copy/idioma e mudanças visuais exigem aprovação.
Em `ci`: nunca corrigir.

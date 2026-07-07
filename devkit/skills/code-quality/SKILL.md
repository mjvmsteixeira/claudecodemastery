---
name: code-quality
description: Auditoria de qualidade de código do projecto actual — dead code e inconsistências, arquitectura e padrões (layering, error handling, type safety, cross-feature integration), métricas de complexidade (ciclomática, tamanho de ficheiros, duplicação) e cobertura de testes. Linguagem-agnóstico. Dispara em "audita a qualidade do código", "code quality", "dead code", "isto está bem arquitecturado?", "complexidade do código", "cobertura de testes", "tech debt". Read-only por defeito. NÃO confundir com performance (skill performance-audit — N+1, queries lentas, leaks) nem segurança (skill security-scan).
---

# code-quality

Auditoria de qualidade de código linguagem-agnóstica. Read-only por defeito.

## Trigger

- `/code-quality [flags]`
- `"audita a qualidade do código"`, `"code quality"`, `"dead code"`, `"complexidade"`, `"cobertura de testes"`

## Parâmetros (passados pelo command ou inferidos do pedido)

- `scope` — um ou mais de `dead-code|architecture|complexity|test-coverage`. Default: todos.
- `ci` — modo CI. Ver `${CLAUDE_PLUGIN_ROOT}/shared/ci-mode.md`. Default: off.
- `export-report` — gravar relatório. Ver `${CLAUDE_PLUGIN_ROOT}/shared/report-format.md`.

## Metodologia

### 1. Detectar stack e estrutura

Identificar linguagens, frameworks e padrão arquitectural. Mapear a estrutura de directórios.

### 2. Carregar regras do projecto

Se existir `rules/audit/code-quality.md` na raiz do projecto auditado, ler e incorporar
(limites de complexidade, limiares de cobertura, caminhos críticos do projecto). Se não
existir, prosseguir com o baseline universal.

### 3. Carregar references conforme o scope e lançar agentes paralelos

| Scope | Reference | Agente |
|-------|-----------|--------|
| `dead-code` | `references/dead-code.md` | Dead code e inconsistências |
| `architecture` | `references/architecture.md` | Arquitectura, padrões, cross-feature |
| `complexity` | `references/complexity-metrics.md` | Complexidade ciclomática, tamanho, duplicação |
| `test-coverage` | `references/test-coverage.md` | Framework de testes + cobertura |

Lançar um agente por scope activo, em paralelo.

### 4. Scoring

Score por dimensão e total conforme `${CLAUDE_PLUGIN_ROOT}/shared/scoring.md`.
As dimensões são os scopes avaliados. (Esta skill passa a emitir scoring X.X/10 —
o command original não o fazia.)

### 5. Relatório

- Modo interactivo: estrutura de `${CLAUDE_PLUGIN_ROOT}/shared/report-format.md`. Separar
  explicitamente "Corrigir agora" de "Tech debt aceitável".
- Modo `ci`: comportamento de `${CLAUDE_PLUGIN_ROOT}/shared/ci-mode.md` — JSON sempre,
  SARIF adicional (é audit de código), exit code por severidade, sem auto-fix.
- Com `export-report`: gravar em `docs/code-quality/CODE-QUALITY_REPORT_<YYYY-MM-DD>.md`.

### 6. Correcções

**Antes de aplicar qualquer correcção, executar os gates de
`${CLAUDE_PLUGIN_ROOT}/shared/safe-apply.md`** (modo, sample-detection, acções
destrutivas).

Fora de `ci`: depois do relatório, perguntar quais findings corrigir. Apagar/mover
ficheiros, remover imports/funções marcadas como dead-code, ou mexer em
`config/initializers/`/`spec/`/`test/` exigem confirmação humana individual com diff
(Gate 3) — não são auto-aplicáveis em batch. Em `ci`: nunca corrigir.

## Fronteira com outras skills

- Performance (N+1 queries, I/O bloqueante, leaks) → skill `performance-audit`.
- Vulnerabilidades e secrets → skill `security-scan`.
- Acessibilidade e componentes de UI → skill `ux-audit`.

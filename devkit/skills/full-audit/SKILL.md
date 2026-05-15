---
name: full-audit
description: Auditoria completa do projecto actual em paralelo — orquestra security-scan, infra-audit, code-quality e performance-audit (sempre) e ux-audit (se houver framework de UI), consolida tudo num relatório único com scoring unificado e, fora do modo CI, corrige TODOS os issues automaticamente sem perguntar. Dispara em "full audit", "auditoria completa", "audita tudo", "audita este projecto", "scan completo", "revê tudo". NÃO usar para auditar um único domínio — para isso usar a skill específica (security-scan, infra-audit, ux-audit, code-quality, performance-audit).
---

# full-audit

Orquestrador de auditoria completa. Corre os audits em paralelo, consolida e (fora de
`--ci`) corrige tudo automaticamente.

## Trigger

- `/full-audit [flags]`
- `"full audit"`, `"auditoria completa"`, `"audita tudo"`, `"audita este projecto"`, `"scan completo"`, `"revê tudo"`

## Parâmetros (passados pelo command ou inferidos do pedido)

- `ci` — modo CI. Ver `${CLAUDE_PLUGIN_ROOT}/shared/ci-mode.md`. Default: off.
- `export-report` — gravar relatório consolidado. Default: off.

## Metodologia

### Fase 1 — Contexto MemPalace (opcional)

Se existir `.mempalace/` na raiz do projecto, carregar e seguir
`references/mempalace-integration.md`.
Se não existir, saltar esta fase silenciosamente.

### Fase 2 — Executar audits em paralelo

Detectar se o projecto tem frontend (framework de UI ou `*.html` com assets).

Lançar em paralelo (Agent tool), cada agente a seguir a skill respectiva:

| Agente | Skill | Condição |
|--------|-------|----------|
| 1 | `security-scan` | sempre |
| 2 | `infra-audit` | sempre |
| 3 | `code-quality` | sempre |
| 4 | `performance-audit` | sempre |
| 5 | `ux-audit` | **só se houver frontend** |

Cada agente corre no modo herdado (interactivo ou `ci`), **sem** auto-fix nesta fase —
a recolha de findings é separada da correcção.

### Fase 3 — Consolidar e fazer scoring

Juntar todos os findings. Calcular o score de cada audit e o TOTAL conforme
`${CLAUDE_PLUGIN_ROOT}/shared/scoring.md` (média das dimensões avaliadas; audits não
corridos, como `ux` sem frontend, são omitidos).

Apresentar o relatório consolidado conforme `${CLAUDE_PLUGIN_ROOT}/shared/report-format.md`,
com uma secção por audit e um resumo executivo global. Nunca omitir findings.

### Fase 4 — Correcção

- **Modo interactivo (sem `ci`):** corrigir TODOS os issues automaticamente, sem pedir
  confirmação, pela ordem CRITICAL → HIGH → MEDIUM → LOW → dependências. Para cada
  correcção mostrar o diff (antes → depois) e o `ficheiro:linha`. **Excepção:** uma
  correcção destrutiva (drop de tabela, delete de ficheiro não versionado) é a única
  coisa que pede confirmação individual antes de executar.
- **Modo `ci`:** não corrigir nada. Emitir o JSON consolidado — um objecto com
  `"audit": "full-audit"` no topo e um array `"audits"` com o JSON individual de cada
  audit corrido (estrutura de cada um conforme `${CLAUDE_PLUGIN_ROOT}/shared/ci-mode.md`)
  — e usar o exit code mais severo de entre os audits.

Após as correcções (modo interactivo), reapresentar o scoring (antes → depois).

### Fase 5 — Registo MemPalace (opcional)

Se a Fase 1 carregou a integração MemPalace, registar fixes e decisões conforme
`references/mempalace-integration.md`.

## Regras críticas

- Nunca omitir issues por serem "menores" — listar TODOS.
- Nunca parar a meio — completar todas as fases sem pedir confirmação (excepto a
  correcção destrutiva da Fase 4).
- Fora de `ci`, nunca perguntar "queres que corrija?" — corrigir directamente.
- Com `export-report`: gravar o consolidado em `docs/audit/FULL_AUDIT_REPORT_<YYYY-MM-DD>.md`.

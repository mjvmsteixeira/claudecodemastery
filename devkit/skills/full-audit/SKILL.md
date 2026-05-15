---
name: full-audit
description: Auditoria completa do projecto actual em paralelo — orquestra security-scan, infra-audit, code-quality e performance-audit (sempre) e ux-audit (se houver framework de UI), consolida tudo num relatório único com scoring unificado. **Read-only por defeito**: gera relatório e nada mais. Correcção é opt-in via flag `--apply` (ou parâmetro `apply`); mesmo com `--apply`, cada sub-audit respeita os seus próprios safeguards (ex.: `security-scan` continua a exigir `--auto-fix-safe`). Dispara em "full audit", "auditoria completa", "audita tudo", "audita este projecto", "scan completo", "revê tudo". NÃO usar para auditar um único domínio — para isso usar a skill específica (security-scan, infra-audit, ux-audit, code-quality, performance-audit).
---

# full-audit

Orquestrador de auditoria completa. Corre os audits em paralelo, consolida e gera
relatório. **Read-only por defeito** — só aplica correcções se o utilizador passar
`--apply` explicitamente.

## Trigger

- `/full-audit [flags]`
- `"full audit"`, `"auditoria completa"`, `"audita tudo"`, `"audita este projecto"`, `"scan completo"`, `"revê tudo"`

## Parâmetros (passados pelo command ou inferidos do pedido)

- `apply` — aplicar correcções após o relatório. Default: **off** (report-only).
  Mesmo com `apply`, cada sub-audit respeita os seus próprios safeguards
  (ex.: `security-scan` continua a exigir `--auto-fix-safe`; correcções destrutivas
  pedem confirmação individual).
- `ci` — modo CI. Ver `${CLAUDE_PLUGIN_ROOT}/shared/ci-mode.md`. Default: off.
  Incompatível com `apply` (CI nunca corrige).
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

Cada agente corre em modo de **recolha pura**: report-only, sem `--apply`, sem
`--auto-fix-safe`, mesmo quando o orquestrador foi invocado com `apply`. A correcção
acontece exclusivamente na Fase 4 e dentro das restrições aí definidas — a recolha de
findings é separada da correcção.

**Instrução obrigatória no prompt de cada Agent dispatch:** prefixar o pedido com
"Modo de recolha pura — não aplicar nenhuma correcção, não perguntar 'queres que
corrija?'. Devolver apenas o relatório/JSON estruturado da skill `<nome>` para o
orquestrador `full-audit` consolidar." O orquestrador é o único que pode (na Fase 4,
com `apply`) aplicar correcções; os sub-agentes nunca o fazem.

### Fase 3 — Consolidar e fazer scoring

Juntar todos os findings. Calcular o score de cada audit e o TOTAL conforme
`${CLAUDE_PLUGIN_ROOT}/shared/scoring.md` (média das dimensões avaliadas; audits não
corridos, como `ux` sem frontend, são omitidos).

Apresentar o relatório consolidado conforme `${CLAUDE_PLUGIN_ROOT}/shared/report-format.md`,
com uma secção por audit e um resumo executivo global. Nunca omitir findings.

### Fase 4 — Correcção

- **Default (sem `apply`, sem `ci`): report-only.** Apresentar o relatório da Fase 3 e
  parar. No fim, indicar explicitamente: "Para aplicar correcções, correr novamente
  com `--apply` (ou pedir 'aplica as correcções')". Nunca editar, apagar ou mover
  ficheiros nesta fase.
- **Modo `apply` (utilizador passou `--apply` ou `apply=true`):** antes de aplicar
  qualquer correcção, executar **todos os gates de
  `${CLAUDE_PLUGIN_ROOT}/shared/safe-apply.md`** (Gate 1 modo, Gate 2 sample-detection,
  Gate 3 acções destrutivas). Só depois, percorrer os findings pela ordem CRITICAL →
  HIGH → MEDIUM → LOW → dependências, mostrando diff (antes → depois) e `ficheiro:linha`
  por cada uma. **Restrições adicionais:**
    - Cada sub-audit respeita os seus próprios safeguards. Ex.: `security-scan` só
      auto-fixa o que cabe em `--auto-fix-safe`; o resto fica como recomendação textual.
    - Se algum gate falhar, degradar para report-only e dizer claramente porquê.
- **Modo `ci`:** não corrigir nada (apply é ignorado se passado junto). Emitir o JSON
  consolidado — um objecto com `"audit": "full-audit"` no topo e um array `"audits"`
  com o JSON individual de cada audit corrido (estrutura de cada um conforme
  `${CLAUDE_PLUGIN_ROOT}/shared/ci-mode.md`) — e usar o exit code mais severo de entre
  os audits.

Após as correcções (modo `apply`), reapresentar o scoring (antes → depois).

### Fase 5 — Registo MemPalace (opcional)

Se a Fase 1 carregou a integração MemPalace, registar fixes e decisões conforme
`references/mempalace-integration.md`.

## Regras críticas

- Nunca omitir issues por serem "menores" — listar TODOS.
- Nunca parar a meio nas fases de recolha (1–3) — completar até ter o relatório.
- **Sem `apply`**, nunca tocar em ficheiros — report-only é o default e é literal.
- Com `apply`, **nunca** auto-classificar uma acção destrutiva como "low-risk":
  apagar/mover ficheiros, alterar `.env`/secrets, remover initializers/middleware,
  mexer em `.gitignore`/`test.rb`/`filter_parameter_logging.rb` exige confirmação
  humana individual mesmo dentro do modo `apply`.
- Com `export-report`: gravar o consolidado em `docs/audit/FULL_AUDIT_REPORT_<YYYY-MM-DD>.md`.

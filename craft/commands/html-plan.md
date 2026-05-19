---
name: html-plan
description: Produz HTML designed em 2 fases (roadmap markdown → HTML self-contained) com disciplina anti-AI-slop (8px baseline grid, contraste WCAG AA, sem pure black/white, real data, focus-visible real). 5 surfaces — web/deck/poster/frame/mockup. Wrapper que invoca a skill html-plan explicitamente.
allowed-tools: Read, Write, Bash
argument-hint: "<surface> <brief curto>"
---

# /html-plan `<surface>` `<brief>`

Invoca a skill `html-plan` para produzir HTML designed em 2 fases. Surfaces aceites: `web`, `deck`, `poster`, `frame`, `mockup`.

## Argumento de invocação

- `<surface>` (obrigatório) — uma das 5: `web`, `deck`, `poster`, `frame`, `mockup`
- `<brief>` (obrigatório) — frase curta a descrever o que se quer (e.g. "landing page para SaaS de billing", "pitch deck Series A produto RAG")

Se o user invocar sem surface, perguntar **antes** de produzir roadmap. Sem brief, perguntar pelo content/target audience.

## Passo 1 — Carregar a skill

Ler o ficheiro:

```
${CLAUDE_PLUGIN_ROOT}/skills/html-plan/SKILL.md
```

Seguir **exactamente** o workflow definido lá (Phase 1 roadmap → user approval → Phase 2 HTML).

## Passo 2 — Phase 1: roadmap

Produzir roadmap markdown inline no chat usando o template em SKILL.md ("Phase 1 — Roadmap"). Mapear o `<brief>` para os campos do roadmap. Calcular contrast ratios para os pares ink/ground escolhidos.

Terminar Phase 1 com a linha exacta: **"Approved? Or change anything before I write the HTML?"**

**Não avançar para Phase 2 sem aprovação explícita do user.**

## Passo 3 — Phase 2: HTML

Após aprovação, ler:
- `${CLAUDE_PLUGIN_ROOT}/skills/html-plan/references/principles.md` — hard constraints completos
- `${CLAUDE_PLUGIN_ROOT}/skills/html-plan/references/surfaces.md` — secção da surface escolhida em Passo 1

Produzir HTML self-contained em `${WORKSPACE:-$PWD}/<nome-derivado-do-brief>.html`. Validar contra a 5-dimension self-critique antes de declarar feito.

## Notas

- Esta command é wrapper fino — toda a lógica vive em `skills/html-plan/SKILL.md`. Não duplicar instruções.
- Em Claude Code o user vê o ficheiro `.html` directamente no filesystem; não usar `present_files` (esse é mecanismo do Anthropic sandbox).
- Se o user pedir para skipar Phase 1, recusar conforme a skill especifica — oferecer roadmap-em-um-parágrafo como compromisso.

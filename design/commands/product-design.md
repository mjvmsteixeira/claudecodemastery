---
name: product-design
description: Conduz o design de um produto invocando a stack nativa do Claude (frontend-design + Artifact + design-sync). Dois modos — mockup (uma surface designed renderizada) e system (design system do produto). Wrapper que invoca a skill product-design explicitamente.
allowed-tools: Read, Write, Bash
argument-hint: "[mockup|system] <brief>"
---

# /product-design `[mockup|system]` `<brief>`

Invoca a skill `product-design` — condutor fino que orquestra a stack nativa de design do
Claude (não reimplementa regras de design).

## Argumentos

- `[mockup|system]` (opcional) — força o modo. Sem ele, o skill infere do brief; se ambíguo,
  pergunta antes de arrancar.
- `<brief>` (obrigatório) — o que se quer (ex.: "mockup landing page para SaaS de billing",
  "system design tokens + componentes para o produto X").

Sem modo nem brief, perguntar antes de produzir seja o que for.

## Passo 1 — Carregar a skill

Ler `${CLAUDE_PLUGIN_ROOT}/skills/product-design/SKILL.md` e seguir **exactamente** o
workflow (routing → pipeline do modo → quality floor).

## Passo 2 — Seguir o pipeline do modo

- **mockup**: gate → frontend-design → build → Artifact (fallback HTML local) → quality floor.
- **system**: gate → frontend-design → Claude Design project → design-sync → validação.

Detalhe de cada handoff em `${CLAUDE_PLUGIN_ROOT}/skills/product-design/references/native-handoffs.md`.

## Notas

- Wrapper fino — toda a lógica vive no SKILL.md. Não duplicar.
- Em Claude Code o utilizador vê ficheiros locais diretamente no filesystem.

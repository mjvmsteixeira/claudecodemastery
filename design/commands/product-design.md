---
name: product-design
description: Conduz o design de um produto invocando a stack nativa do Claude (frontend-design + Artifact + design-sync). Dois modos — mockup (uma surface designed renderizada) e system (design system do produto). Wrapper que invoca a skill product-design explicitamente.
allowed-tools: Read, Write, Bash
argument-hint: "[mockup|system] <brief>"
---

# /product-design `[mockup|system]` `<brief>`

Invoca a skill `product-design`. Carrega `${CLAUDE_PLUGIN_ROOT}/skills/product-design/SKILL.md`
e segue-o exactamente. Sem modo nem brief, pergunta antes de arrancar.

> STUB — os passos detalhados são escritos nas Fases 2 e 3, alinhados com o SKILL.md.

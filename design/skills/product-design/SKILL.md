---
name: product-design
description: "Use this skill ONLY when the user explicitly invokes it by name — 'use product-design', 'invoke product-design', '/product-design', or names the skill directly. A thin conductor that orchestrates Claude's native design stack instead of reinventing design rules: it routes between a mockup mode (one designed surface, rendered to a visible Artifact) and a system mode (a product design system materialized into a Claude Design project via design-sync). It hands aesthetic direction to the native frontend-design skill, renders visual mockups with the Artifact tool, and builds the component library with the design-sync skill and DesignSync tool. It owns routing, gating, sequencing, a verifiable quality floor, and dependency degradation — never palettes, grids, or surface CSS. Do NOT auto-trigger on generic 'make me a webpage' requests — only on explicit invocation."
---

# product-design

> STUB — o corpo (routing + pipelines + quality floor) é escrito nas fases 2 e 3.
> O frontmatter acima é final. As references e o command já existem como stubs.

Este skill é um **condutor fino**: não tem regras de design próprias. A estética vem da
skill nativa `frontend-design`; o render de mockups vem da tool `Artifact`; o design system
vem da skill `design-sync` + tool `DesignSync`.

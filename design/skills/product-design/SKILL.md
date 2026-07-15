---
name: product-design
description: "Use this skill ONLY when the user explicitly invokes it by name — 'use product-design', 'invoke product-design', '/product-design', or names the skill directly. A thin conductor that orchestrates Claude's native design stack instead of reinventing design rules: it routes between a mockup mode (one designed surface, rendered to a visible Artifact) and a system mode (a product design system materialized into a Claude Design project via design-sync). It hands aesthetic direction to the native frontend-design skill, renders visual mockups with the Artifact tool, and builds the component library with the design-sync skill and DesignSync tool. It owns routing, gating, sequencing, a verifiable quality floor, and dependency degradation — never palettes, grids, or surface CSS. Do NOT auto-trigger on generic 'make me a webpage' requests — only on explicit invocation."
---

# product-design

Um **condutor fino** para o design de produto. Não tem regras de design próprias — nenhuma
paleta, nenhum grid, nenhuma surface CSS. Garante que a stack nativa do Claude é usada, na
ordem certa, sempre, e adiciona o que falta: routing, gating, sequenciamento, um quality
floor verificável e degradação de dependências.

A estética vem da skill nativa **`frontend-design`**. O render de mockups vem da tool
**`Artifact`**. O design system vem da skill **`design-sync`** + tool **`DesignSync`**.

## When to trigger

SÓ em invocação explícita: `/product-design`, "use product-design", "invoke product-design",
ou nomeando o skill. Se o utilizador só disser "make me a webpage" / "design this page" sem
nomear, **não triggerar** — tem outro caminho em mente.

## Routing

Decidir entre **mockup mode** e **system mode** e detetar dependências antes de arrancar.
Regras completas em `references/routing.md`. Resumo: sub-comando explícito ganha; senão,
sinais no brief; se ambíguo, uma pergunta de confirmação.

## Mockup mode — pipeline

Uma surface designed, renderizada e visível.

1. **Gate & brief** — invocação explícita confirmada. Se subject/audience/job não estiverem
   claros, pinar antes de continuar.
2. **frontend-design** — invocar a skill nativa para obter o token plan + signature + a
   auto-crítica anti-default. Contrato em `references/native-handoffs.md` (→ frontend-design).
   Se ausente, usar o fallback de plano mínimo (`references/quality-floor.md`), rotulado.
3. **Build** — escrever o HTML self-contained derivado do plano. Todo o valor traça ao plano;
   nada de cores/tamanhos inventados aqui.
4. **Render** — publicar via `Artifact` (página privada partilhável); reportar o URL.
   Contrato em `references/native-handoffs.md` (→ Artifact). Sem login claude.ai, cair para
   HTML local e dizê-lo.
5. **Quality floor** — aplicar a checklist de `references/quality-floor.md`; screenshot +
   auto-crítica se possível; reportar compromissos.

## System mode — pipeline

> STUB — escrito na Fase 3 (materializa um Claude Design project via design-sync/DesignSync).

## Dependências (degradação)

- `frontend-design`: soft — sem ela, plano mínimo rotulado.
- `Artifact` (login claude.ai): soft no mockup mode — sem login, HTML local.
- `design-sync`/`DesignSync` (login + design scopes): hard no system mode — sem autorização,
  modo indisponível (`/design-login`). Detalhe na Fase 3.

Nunca falhar duro no mockup mode.

## O que este skill NÃO faz

- Não define paletas, grids nem surface CSS — isso é da `frontend-design` e das tools nativas.
- Não gera `.pptx`/`.pdf`/`.mp4`.
- Não auto-triggera.

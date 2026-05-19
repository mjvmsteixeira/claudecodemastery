---
name: html-plan
description: "Use this skill ONLY when the user explicitly invokes it by name — phrases like 'use html-plan', 'invoke html-plan', 'skill html-plan', or directly names the skill. Produces a two-phase deliverable for designed HTML content. Phase 1 is a structured markdown roadmap covering goal, audience, surface, type scale, palette with contrast ratios, 8px grid layout, components, interactive states, real data, and self-critique. Phase 2 is a single self-contained .html file that strictly follows anti-AI-slop design discipline borrowed from the nexu-io/html-anything project — 8px baseline grid, contrast ratio at or above 4.5, no pure black or pure white, soft shadows, rounded corners, real focus-visible states, real data and never lorem ipsum. Covers five surfaces — web (landing, dashboard, article, docs), deck (1920x1080 slides), poster (1080x1920 or A4), frame (single video frame), and mockup (device chrome). Do NOT trigger on generic 'make me a webpage' requests — only on explicit invocation."
---

# html-plan

Produces designed HTML in two phases: first a written **roadmap** that locks the design decisions, then the actual **HTML file**. The discipline comes from the `nexu-io/html-anything` project — anti-AI-slop constraints, 8px baseline grid, contrast ≥ 4.5, real data, no lorem ipsum, no pure black or white.

The point of the two phases: most AI-generated HTML feels generic because the model picks colors, sizes, and spacing on the fly. Locking those decisions in a roadmap first — and getting the user's sign-off — produces something that looks designed instead of vibed.

## When to trigger

ONLY on explicit invocation. The user will name the skill:

- "use html-plan to make a landing page for Acme"
- "invoke html-plan for a pitch deck"
- "html-plan: pricing page"
- "let's run html-plan on this brief"

If they just say "make me a webpage" or "design this page" without naming the skill, **do not trigger** — the user has another path in mind.

## The two-phase workflow

### Phase 1 — Roadmap (always do this first)

Before writing any HTML, produce a roadmap as a markdown block in the chat. The user reads it, confirms or asks for changes, THEN you move to Phase 2.

Use this exact template:

```markdown
# [Page title] — design roadmap

## 1. Brief
- **Goal**: what action should the reader take after seeing this?
- **Audience**: who reads it (role, context, device)?
- **Surface**: web / deck / poster / frame / mockup
- **Real data**: the actual content provided (no placeholders)

## 2. Type scale
- **Font stack**: e.g. `Inter, system-ui, sans-serif` (add `Noto Sans SC` first if CJK)
- **Scale**: list the sizes in px, every one a multiple of 8 (e.g. 56 / 32 / 20 / 16 / 13)
- **Line-height**: also multiples of 8 (e.g. 64 / 40 / 28 / 24)
- **Weights**: which weights for which roles (display / body / caption)

## 3. Palette
- **Ground**: hex — NOT `#ffffff`. Use off-whites: `#faf9f6`, `#f5f4ed`, `#fcfcfa`, `#0f1419` for dark mode.
- **Ink**: hex — NOT `#000000`. Use near-blacks: `#1a1a1a`, `#1e2327`, `#0f1419`.
- **Accent**: ONE saturated color, only one. Examples: Klein Blue `#002fa7`, Safety Orange `#ff6b35`, Lemon `#f7d046`, Mint `#3cb371`.
- **Contrast**: write the actual ratio of ink-on-ground (must be ≥ 4.5 for body text, ≥ 3 for large display).

## 4. Layout
- **Grid**: 8px baseline. Every spacing, padding, margin is a multiple of 8.
- **Container**: width + side padding (e.g. `max-width: 1200px`, `padding-inline: 32px`)
- **Sections**: ordered list of what stacks vertically (1. nav, 2. hero, 3. features, 4. CTA, 5. footer)

## 5. Components
List the components top-to-bottom. For each, name it and specify dimensions (in 8px multiples), inner spacing, and what it contains. Be concrete — "card: 320×400, padding 24, contains icon (40), title (h3), 2-line description, accent CTA link".

## 6. Interactive states
For every clickable element, define:
- `:hover` — what changes (color shift, shadow lift, etc.)
- `:focus-visible` — MUST be visible (outline or ring). Never `outline: none` alone.
- `:active` — pressed state
- `:disabled` — if applicable

## 7. Self-critique (5 dimensions, score 1–5)
- **Typography hierarchy** — can the eye find the next thing without effort?
- **Color discipline** — exactly one ground, one ink, one accent. No more.
- **Spacing rhythm** — does everything snap to 8px?
- **Real data** — zero "Lorem ipsum", zero "John Doe", zero "Company Name Here"
- **Accessibility** — contrast verified, `:focus-visible` real

Any dimension below 4 → revise before Phase 2.
```

After producing the roadmap, end with one line: **"Approved? Or change anything before I write the HTML?"**

Wait for explicit approval (or revisions). Do not silently jump to Phase 2.

### Phase 2 — Generate the HTML

Only after the roadmap is approved. Before writing, read:

- `references/principles.md` — the hard constraints in full detail
- `references/surfaces.md` — the specific dimensions and conventions for the chosen surface

Then produce a single self-contained `.html` file:

- One `<style>` block in `<head>` (or Tailwind via CDN if the roadmap chose Tailwind)
- All assets inline (inline SVG, no `<img src="...">` to files that don't exist)
- System fonts or Google Fonts CDN — never reference local font files
- Every number in the CSS traces back to the roadmap. If a value isn't in the roadmap, don't invent one — go back and add it.
- Save to `${WORKSPACE:-$PWD}/<filename>.html` (workspace do user; fora do Claude Code, default cwd). Não usar `present_files` — em Claude Code o ficheiro fica disponível no filesystem que o user vê.

After delivering, do a quick self-check in chat: did every hard constraint hold? Call out any compromise.

## Hard constraints (summary — full version in `references/principles.md`)

These are non-negotiable. If the user pushes back, explain *why* (anti-AI-slop) and offer an alternative that still meets the rule.

1. **8px baseline grid** — every spacing, padding, margin, line-height, font-size is a multiple of 8.
2. **No pure black, no pure white** — use the `#1a1a1a` / `#faf9f6` family.
3. **Contrast ≥ 4.5** for body text. Run the actual check.
4. **One accent color** — not three. Restraint reads as design; abundance reads as a template.
5. **Real `:focus-visible`** — never `outline: none` without a replacement.
6. **Soft shadow + rounded corners** unless the surface explicitly calls for brutalist or hard-edge.
7. **Real data only** — no lorem ipsum, no "John Doe", no "Lorem street 42". If the user hasn't provided data, ask for it or generate plausible domain-specific content and **call it out as a placeholder to replace**.
8. **CJK-aware font stack** when content contains CJK characters — `Noto Sans SC` (or `Noto Serif SC`) first in the stack.

## Surface routing

The user must name a surface, or the roadmap can't be written. The five surfaces:

| Surface | Dimensions | Best for |
|---|---|---|
| **web** | fluid, ~1200px container | Landing, dashboard, article, docs, product page |
| **deck** | 1920×1080 per slide | Pitch deck, keynote, internal review |
| **poster** | 1080×1920 (social) or A4 | Print, IG story, magazine cover |
| **frame** | 1920×1080 single frame | Video opener / outro, title card, transition |
| **mockup** | device chrome wrapping a screen | Product shot for marketing |

If the user's request doesn't name a surface, ask which one fits before starting the roadmap. Don't guess.

Full conventions per surface live in `references/surfaces.md`.

## Common pushback to handle gracefully

- **"Skip the roadmap, just write the HTML"** — politely decline. Offer a one-paragraph roadmap (the briefest version) instead of skipping. The roadmap is what stops the output from feeling AI-generated.
- **"Use lorem ipsum"** — decline. Ask for real content or generate plausible domain-specific content and label it `[PLACEHOLDER — replace before shipping]`.
- **"Make it pure black on white"** — counter-propose `#1a1a1a` on `#faf9f6`. Looks identical to the eye; doesn't fry it under bright light.
- **"Three accent colors"** — counter-propose one accent + two neutrals at different weights. Achieves the same visual variety with restraint.

## What this skill does NOT do

- Does not replicate the 75 templates from `html-anything` verbatim. Only the design discipline transfers.
- Does not generate `.pptx`, `.docx`, `.pdf`, or `.mp4`. Output is always a single `.html` file.
- Does not auto-trigger. Always requires explicit invocation.

# Design Principles — full reference

Read this before writing HTML in Phase 2. Each rule has a *why* so you can defend it (or knowingly break it).

## 1. The 8px baseline grid

**Rule**: Every spacing, padding, margin, line-height, font-size, border-radius, and component dimension is a multiple of 8.

**Why**: AI-generated HTML reads as "vibed" because numbers are arbitrary — `padding: 13px`, `font-size: 17px`, `margin-top: 22px`. A baseline grid is the single fastest way to make output feel intentional. The human eye doesn't measure pixels, but it *does* perceive rhythm, and 8px is the standard cadence across iOS, Material, Tailwind, and most design systems.

**The allowed scale**: 4, 8, 16, 24, 32, 40, 48, 56, 64, 72, 80, 96, 128, 160, 192, 256, 320, 384, 512, 640, 768, 896, 1024, 1280, 1536.

(4px is allowed only for hairline borders and the smallest icon details. Everything else: 8 and up.)

**Type scale** (the standard ladder):
- Display: 56 / 48 / 40
- H1: 32
- H2: 24
- H3: 20
- Body: 16
- Caption: 13 (the one exception — 13px body-caption is more legible than 12 or 16)

**Line-height** is also on the grid: 64 / 56 / 48 / 40 / 32 / 28 / 24.

## 2. No pure black, no pure white

**Rule**: Never use `#000000` or `#ffffff`. Use near-blacks and off-whites.

**Why**: Pure black on pure white is what plain `<body>` defaults to. It's also genuinely harsh — the contrast ratio is 21:1, far beyond what's comfortable for sustained reading. Designed interfaces sit at 12:1 to 16:1, which is still highly accessible but easier on the eye.

**Ground (background) palette**:
- `#faf9f6` — warm off-white (Kraft / parchment feel)
- `#f5f4ed` — slightly more pigmented warm white
- `#fcfcfa` — barely-off white (most neutral)
- `#f7f7f5` — cool off-white
- `#0f1419` — near-black for dark mode
- `#1a1a1a` — flat near-black for dark mode
- `#1e2327` — slightly blue-tinted near-black

**Ink (foreground/text) palette**:
- `#1a1a1a` — default
- `#1e2327` — slightly cooler
- `#0f1419` — for high-contrast headlines
- `#2d3748` — muted body text
- `#4a5568` — secondary text
- `#faf9f6` / `#f5f4ed` — ink for dark mode

## 3. One accent color

**Rule**: Pick exactly one saturated accent. Use it for CTAs, links, key highlights — nothing else.

**Why**: Multiple accents fragment attention. "Where do I look?" → "Everywhere" → "Nowhere". Restraint is the single biggest tell that a designer touched something.

**Accent palette** (pick one):
- `#002fa7` — Klein Blue (institutional, serious)
- `#ff6b35` — Safety Orange (energetic, modern)
- `#f7d046` — Lemon (editorial, optimistic)
- `#3cb371` — Mint (calm, fresh)
- `#e63946` — Vermilion (urgent, bold)
- `#6b46c1` — Royal Purple (premium, technical)
- `#0891b2` — Teal (professional, friendly)

If the user provides brand colors, use them — but still only pick ONE as the accent.

## 4. Contrast ≥ 4.5

**Rule**: Body text against its background must have a contrast ratio of at least 4.5:1. Large display text (24px+) can drop to 3:1.

**Why**: WCAG AA. Not optional. Many AI-generated palettes look fine on the screen they were generated on and fail on phones in sunlight.

**How to check**: Use [webaim.org/resources/contrastchecker](https://webaim.org/resources/contrastchecker) or compute it. Pairs that work:
- `#1a1a1a` on `#faf9f6` → 16.9:1 ✓
- `#1e2327` on `#f5f4ed` → 15.2:1 ✓
- `#2d3748` on `#fcfcfa` → 11.1:1 ✓
- `#4a5568` on `#faf9f6` → 7.6:1 ✓ (secondary text)
- `#faf9f6` on `#1a1a1a` → 16.9:1 ✓ (dark mode)

## 5. Real `:focus-visible`

**Rule**: Every interactive element (links, buttons, inputs, custom controls) has a visible `:focus-visible` state. Never `outline: none` without a replacement.

**Why**: Keyboard navigation. Power users tab through pages. Screen readers respect focus. Removing the default outline without replacing it is the most common accessibility failure on AI-generated pages.

**Pattern**:
```css
button:focus-visible,
a:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
```

Or a ring:
```css
button:focus-visible {
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 40%, transparent);
}
```

## 6. Soft shadow + rounded corners

**Rule**: Default to soft shadows (`box-shadow: 0 1px 2px rgba(0,0,0,0.06), 0 4px 8px rgba(0,0,0,0.04)`) and rounded corners (`border-radius: 8px` or `12px` for cards, `4px` for inputs, `999px` for pills).

**Why**: Hard edges and no shadow read as either "wireframe" or "brutalist". Both are valid surfaces, but they have to be chosen deliberately — not as the default.

**Exceptions**:
- Brutalist poster / web — hard edges, no shadows, deliberately raw
- Swiss International deck — sharp 90° corners, no shadows
- Print poster — no shadows (they don't print well)

If the roadmap names one of these surfaces, override this rule.

## 7. Real data, never lorem ipsum

**Rule**: Every piece of content in the HTML is either real data from the user, or plausible domain-specific content explicitly labeled as a placeholder.

**Why**: Lorem ipsum is the single biggest tell of generated work. It announces "this is a draft, look at it as a wireframe" — but the user wanted a finished page. If they wanted a wireframe, they'd have asked for one.

**If the user didn't provide content**:
- Ask: "What's the actual product name / company / metric?"
- If they want you to fill it in, generate plausible content for the domain (e.g. for a SaaS landing: "Datapine", "Reduce time-to-insight by 70%", "Trusted by 800+ teams at Acme, Globex, Initech") and **annotate every placeholder** with an HTML comment: `<!-- PLACEHOLDER: replace with real customer name -->`

**Never use**: "Lorem ipsum", "John Doe", "Jane Smith", "Company Name", "Your Product Here", "Acme Inc." (without explicit placeholder annotation), "example@example.com".

## 8. CJK-aware font stack

**Rule**: If the content contains any CJK characters (Chinese, Japanese, Korean), put a CJK font first in the stack.

**Why**: Latin fonts like Inter render CJK using a fallback that often clashes — different x-height, different baseline, different weight. Putting `Noto Sans SC` (or `Noto Serif SC`, `Source Han Sans`) first ensures CJK characters render in a font designed for them, and Latin characters fall back gracefully to Inter or system.

**Standard stacks**:

Latin-only:
```css
font-family: 'Inter', system-ui, -apple-system, sans-serif;
```

CJK-aware:
```css
font-family: 'Noto Sans SC', 'Inter', system-ui, -apple-system, sans-serif;
```

Serif (editorial):
```css
font-family: 'Noto Serif SC', 'Source Serif Pro', Georgia, serif;
```

## 9. Layout-token discipline

**Rule**: Define design tokens as CSS custom properties at the top, then use them throughout. No magic numbers in component CSS.

**Why**: If a value appears in three places, it gets out of sync. A token forces a single source of truth and makes the design feel coherent.

**Standard token set**:
```css
:root {
  /* Color */
  --ground: #faf9f6;
  --ink: #1a1a1a;
  --ink-muted: #4a5568;
  --accent: #002fa7;
  --line: #e5e3dc;

  /* Type */
  --font-sans: 'Inter', system-ui, sans-serif;
  --font-serif: 'Noto Serif SC', Georgia, serif;

  /* Space (8px scale) */
  --space-1: 8px;
  --space-2: 16px;
  --space-3: 24px;
  --space-4: 32px;
  --space-6: 48px;
  --space-8: 64px;
  --space-12: 96px;

  /* Radius */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-pill: 999px;

  /* Shadow */
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.06);
  --shadow-md: 0 1px 2px rgba(0,0,0,0.06), 0 4px 8px rgba(0,0,0,0.04);
  --shadow-lg: 0 4px 12px rgba(0,0,0,0.08), 0 16px 32px rgba(0,0,0,0.06);
}
```

## 10. The 5-dimension self-critique

Before declaring the HTML done, score it 1–5 on each dimension. Below 4 on anything → revise.

1. **Typography hierarchy** — can the eye find the next thing without effort? Display → H1 → H2 → body should be obvious from 2 meters away.
2. **Color discipline** — one ground, one ink (+ muted variant), one accent. No more.
3. **Spacing rhythm** — does everything snap to 8px? Open DevTools and check three random elements.
4. **Real data** — zero placeholders that aren't labeled as such.
5. **Accessibility** — contrast verified (write the numbers), `:focus-visible` real on every interactive element.

This is the same critique the user agrees to in the roadmap. The HTML must satisfy it.

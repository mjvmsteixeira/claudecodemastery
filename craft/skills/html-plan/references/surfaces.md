# Surfaces — full reference

Read the section for the surface the roadmap chose. Each section has dimensions, layout conventions, what to include and what to exclude.

## web

The most flexible surface. Includes landing pages, dashboards, articles, docs, product pages.

**Dimensions**:
- Container: `max-width: 1200px` (1280px allowed for data-dense dashboards)
- Side padding: `32px` on desktop, `16px` on mobile (use `clamp(16px, 4vw, 32px)`)
- Section vertical rhythm: `96px` between major sections, `48px` within

**Required**:
- Skip-link for keyboard users: `<a class="sr-only-focusable" href="#main">Skip to content</a>`
- Semantic HTML: `<header>`, `<nav>`, `<main>`, `<footer>`, `<section>` with headings
- Mobile viewport meta tag
- Responsive — at least breakpoint at 768px

**Sub-types**:

**Landing page** — hero / features / social-proof / pricing / FAQ / CTA / footer. Hero takes ~80% of first viewport. CTA is the accent color, everything else is ground+ink. One primary CTA per section, max one secondary.

**Dashboard** — left rail (240px) + main content. Dense data layout, `font-size: 13px` for table body is fine, headers stay 16px. Use the accent color sparingly — for active state + one chart highlight only.

**Article** — single column, `max-width: 720px` for reading, larger images break out of the column. Serif font is appropriate. Line-height generous (`1.7` for body).

**Docs** — three columns on desktop: 240px nav / 720px content / 240px TOC. Mono font for code blocks. Hierarchy of H1 > H2 > H3 must be brutally consistent.

## deck

Keynote-style slide decks. Each slide is a fixed-dimension surface, slides are siblings.

**Dimensions**: `1920×1080` per slide (16:9). Use `aspect-ratio: 16/9` and `transform: scale()` to fit smaller viewports.

**Layout convention**:
- Slide outer padding: `96px` on all sides
- Title zone: top 160px
- Body zone: rest
- Page number + footer text: bottom 48px

**Required**:
- Keyboard navigation: ← / → / Space / Esc (overview mode)
- Each slide has a unique ID (`#slide-1`, `#slide-2`)
- Maximum 5 elements per slide. If you have more, split the slide.
- One slide = one idea. If you can't summarize the slide in one sentence, it's two slides.

**Forbidden**:
- Bullet lists longer than 4 items
- Body text smaller than 24px (it won't read from the back of a room)
- More than two type sizes per slide

**Sub-types**:

**Pitch deck** — problem / solution / market / product / traction / team / ask. 10–12 slides max.

**Tech-sharing deck** — Q&A-friendly, allow code blocks at 20px mono. Title slide → context → demo → takeaways → links. ~15 slides.

**Editorial deck** — magazine-style, serif headlines, one big image per slide. Cool, calm, low-density. Inspired by `deck-guizang-editorial` from html-anything.

**Swiss International deck** — Helvetica grid maximalism, one saturated accent (Klein Blue / Lemon / Mint / Safety Orange), 16-column grid, sharp 90° corners. No shadows. Inspired by `deck-swiss-international`.

## poster

Single-page display. Print or social-first.

**Dimensions**:
- Social (IG story / Xiaohongshu): `1080×1920` (9:16)
- A4 portrait: `210×297mm` (use `@page` rules for print + `aspect-ratio: 210/297`)
- A3 / wall poster: scale A4 proportions

**Layout convention**:
- Margins: 8% of shortest side
- One dominant focal element (headline, image, or number)
- Maximum 3 hierarchy levels: hero / supporting / metadata

**Required**:
- Oversized type for the headline — `clamp(72px, 12vw, 144px)` for social, larger for print
- One image OR one color block, never both fighting
- Footer with metadata (date, source, attribution) at the very bottom

**Sub-types**:

**Editorial poster** — newsprint feel, oversized serif headline, two-column body, six numbered sections, dot-pattern ground. Inspired by `magazine-poster`.

**Marketing poster** — single image + headline + small CTA. The image does the work; the type just labels it.

**Data poster** — one massive number + context + supporting smaller stats. Used for "we raised $50M" / "100k users" announcements.

## frame

A single video frame — opener, outro, title card, or transition. Static HTML that conforms to a frame-script schema for rendering to video.

**Dimensions**: `1920×1080` (16:9). Aspect-ratio fixed.

**Layout convention**:
- Full-bleed background (gradient, image, or solid color from the accent palette)
- One headline, max one subhead
- One logo or attribution
- Optional motion cues as HTML comments (for downstream Remotion / Hyperframes rendering)

**Required**:
- All assets inline (background colors, SVG logos, no external images)
- Hidden metadata for video duration: `<meta name="frame-duration" content="3000">` (ms)
- Transitions described in comments: `<!-- transition-in: fade 400ms -->`

**Sub-types**:

**Title card** — product name + tagline + brand color. Minimal.

**Glitch title** — chromatic offset (cyan/magenta), CRT scanlines, ASCII noise. Inspired by `frame-glitch-title`.

**Logo outro** — logo + tagline + CTA. The closing card. Inspired by `frame-logo-outro`.

**Data chart frame** — one big chart, one headline, source attribution. NYT-style. Inspired by `frame-data-chart-nyt`.

**Light-leak cinema** — warm orange/yellow gradient overlay, simulated film grain, serif title. Inspired by `frame-light-leak-cinema`.

## mockup

Device chrome wrapping a screen. Used for product marketing — "here's what our app looks like on iPhone".

**Dimensions**:
- iPhone 15 Pro frame: `393×852` viewport, frame adds ~`56px` total around (use SVG for the chrome)
- MacBook Pro frame: `1440×900` viewport, frame adds ~`80px` total
- iPad: `820×1180`

**Layout convention**:
- Device chrome is SVG, never a PNG (so it scales cleanly)
- The "screen" content is its own self-contained HTML region inside the chrome
- One device per mockup. Two devices = two mockups side by side.
- Background can be a soft gradient, a color block, or `transparent` (for compositing)

**Required**:
- Realistic status bar (time `9:41`, signal, battery)
- Rounded corners that match the actual device (iPhone 15 Pro: `47.33px`)
- Drop shadow under the device (`0 24px 48px rgba(0,0,0,0.16)`)

**Forbidden**:
- Don't show real iOS / macOS icons or logos — generic representations only
- Don't use copyrighted device PNGs from Apple's marketing site

**Sub-types**:

**Product hero shot** — single device, centered, branded background. Used in marketing hero sections.

**Multi-device** — phone + laptop side by side, showing responsive design. Phone overlaps the corner of the laptop.

**In-context mockup** — device on a desk, with hand or ambient props. Generally requires a photo background (provide a placeholder).

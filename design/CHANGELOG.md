# Changelog — prumo-design

Formato: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versionamento: [SemVer](https://semver.org/spec/v2.0.0.html).

## v0.6.0 — 2026-07-15

**BREAKING — `prumo-craft` → `prumo-design`, redesign completo.** O plugin deixa de reimplementar
regras de design (o antigo skill `html-plan`) e passa a orquestrar a stack nativa do Claude.

### Removed
- Skill `html-plan` e command `/html-plan` (+ references `principles.md`, `surfaces.md`). As
  regras copiadas do `nexu-io/html-anything` (8px grid fixo, paletas fixas) contradiziam a
  skill nativa `frontend-design`, que nomeia esses defaults como anti-padrões.

### Added
- Skill `product-design` + command `/product-design` — condutor fino, dois modos:
  - **mockup**: gate → `frontend-design` (estética) → build → `Artifact` (render partilhável;
    fallback HTML local sem login) → quality floor verificável.
  - **system**: gate → `frontend-design` → Claude Design project → `design-sync`/`DesignSync`
    (foundation cards → componentes, `@dsCard`) → validação `.render-check.json`. Hard-require
    login claude.ai/design.
- References: `routing.md` (decisão de modo + deteção/degradação de deps),
  `native-handoffs.md` (contratos frontend-design / Artifact / design-sync), `quality-floor.md`
  (checklist verificável).

### Changed
- Dir `craft/` → `design/`; `name` `prumo-craft` → `prumo-design`; tooling do repo
  (`marketplace.json`, `.gitignore`, `scripts/validate.sh`, `scripts/package.sh`) atualizado.
- Deixa de ser "zero deps": depende da stack nativa de design (soft em mockup, hard em system).

### Upgrade
- `/plugin uninstall prumo-craft@prumo` seguido de `/plugin install prumo-design@prumo`.

## v0.5.0 — 2026-07-07

**Alinhamento de versão** ao release coordenado do marketplace `prumo` (todos os plugins passam a 0.5.0). Sem alterações funcionais no `html-plan`.

- Limpeza: removida a função `warn()` morta do `smoke.sh`.

## v0.2.0 — 2026-07-06

**BREAKING — rebranding wire → prumo.** O plugin passa a chamar-se `prumo-craft` no marketplace `prumo`. Sem alterações funcionais.

- Upgrade: `/plugin uninstall wire-craft@jump2new` seguido de `/plugin install prumo-craft@prumo`

## v0.1.0 — 2026-05-19

### Adicionado

- **Plugin inicial** — 4º plugin do marketplace `jump2new`, ao lado de `wire-base`, `wire-secops`, `wire-devkit`. Categoria: tooling generativo com disciplina.

- **Skill `html-plan`** — produz HTML designed em 2 fases.
  - Phase 1: roadmap markdown (brief, type scale múltiplos de 8, palette com contraste calculado, layout 8px, components, interactive states, real data, self-critique 5-dimensões com score 1-5).
  - Phase 2: HTML self-contained (single file, inline CSS, system fonts ou Google Fonts CDN, todos os valores trazem-se do roadmap).
  - Hard constraints: 8px baseline grid, sem `#000000`/`#ffffff` (off-whites / near-blacks), contraste ≥ 4.5 body / ≥ 3 display, um único accent saturado, `:focus-visible` real, soft shadow + rounded corners (excepto brutalist/swiss/print), real data sem lorem ipsum, CJK-aware font stack quando aplicável, tokens CSS no `:root`.
  - 5 surfaces: web (landing/dashboard/article/docs), deck (1920×1080), poster (1080×1920 ou A4), frame (1920×1080 video), mockup (device chrome SVG).
  - Trigger **explícito por nome** apenas — não auto-triggera em pedidos genéricos como "make me a webpage".

- **Command `/html-plan`** — wrapper fino que invoca a skill `html-plan`. Padrão B+C (skill é o cérebro, command é a entrada discoverable via `/`). Aceita `<surface>` e `<brief>` como argumentos iniciais.

- **smoke.sh** — sanity check read-only: `plugin.json` válido, frontmatter da skill, references presentes, frontmatter do command.

### Ajuste local à skill original

- Output path da Phase 2 foi alterado de `/mnt/user-data/outputs/` (path do sandbox Anthropic onde a skill foi originalmente desenhada) para `${WORKSPACE:-$PWD}` — torna a skill nativa em Claude Code sem assumir paths Anthropic. Edição cirúrgica de 1 linha; resto do SKILL.md vem byte-a-byte do `.skill` original.

### Roadmap

- **v0.2.0** — `logo-generator` (SVG logos + showcase via Gemini). Requer Python venv + `GEMINI_API_KEY` via Vault `secret/ai/gemini`. Iteração dedicada para bootstrap de deps externas sem fricção (provável `/wire-craft-bootstrap`).
- **v0.3.0+** — possíveis: deck-builder, copy-generator, data-poster.

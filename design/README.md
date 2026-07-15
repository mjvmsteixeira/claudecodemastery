# prumo-design

Plugin Claude Code · orquestrador de design do ecossistema prumo · v0.6.0

---

## Dependências

**Standalone quanto a outros plugins prumo** (não recomenda `prumo-base`). Depende, sim, da
**stack nativa de design do Claude**:

| Peça nativa | Papel | Necessário para |
|---|---|---|
| skill `frontend-design` | direção estética (tokens, signature, anti-default) | ambos os modos (soft — degrada) |
| tool `Artifact` + skill `artifact-design` | render de mockup visível/partilhável | mockup mode (soft — fallback HTML local) |
| skill `design-sync` + tool `DesignSync` | design system num Claude Design project | system mode (**hard** — login claude.ai) |

---

## O que faz

`product-design` é um **condutor fino**: não reimplementa regras de design — invoca a stack
nativa e garante que é usada, na ordem certa, sempre. Owns routing, gating, sequenciamento,
quality floor e degradação de dependências; **não** owns paletas, grids nem surface CSS.

| Componente | Tipo | Domínio |
|---|---|---|
| **product-design** | skill + command `/product-design` | Conduz o design de produto em 2 modos. **mockup**: uma surface designed renderizada via Artifact (fallback HTML local). **system**: tokens + biblioteca de componentes num Claude Design project via design-sync. Invocação **explícita por nome**. |

---

## Dois modos

- **mockup** — `/product-design mockup <brief>` → gate → frontend-design → build → Artifact →
  quality floor. Uma surface, um artefacto visível.
- **system** — `/product-design system <brief>` → gate → frontend-design → Claude Design
  project → design-sync (foundation cards → componentes) → validação. Um design system
  reutilizável. Requer login claude.ai/design.

Sem sub-comando, o skill infere do brief; se ambíguo, pergunta antes de arrancar.

---

## Por que não reimplementa design

O Claude já tem uma skill nativa de design (`frontend-design`) mais fina e atual, que avisa
explicitamente contra os "looks AI-default". Um plugin que codificasse paletas/grids fixos
duplicaria-a — pior, contradizia-a. `prumo-design` faz o oposto: delega a estética à nativa e
concentra-se na orquestração, no render visual e na materialização de um design system.

---

## Como invocar

```
/product-design mockup landing page para um SaaS de billing automation
/product-design system tokens + componentes para o produto Acme
"use product-design to mock the pricing screen"
```

---

## Instalação

```bash
/plugin marketplace add mjvmsteixeira/claudecodemastery
/plugin install prumo-design@prumo
/plugin list                                  # verificar prumo-design v0.6.0
```

Se substitui um plugin anterior: `/plugin uninstall <anterior>@prumo` seguido de
`/plugin install prumo-design@prumo`.

---

© 2026 prumo · Uso interno · Versão 0.6.0

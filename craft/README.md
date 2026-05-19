# wire-craft

Plugin Claude Code · tooling generativo do ecossistema Wire · v0.1.0

---

## Dependências

**Nenhuma.** Standalone. Não recomenda `wire-base` nem outro plugin. Zero deps externas (markdown + bash; sem Python, sem API keys, sem Vault).

---

## O que faz

Casa tooling generativo com **disciplina** — produz output design-quality em vez de output AI-slop. Cada skill segue regras concretas (grid, contraste, naming, real data) e tem self-critique antes de entregar.

Ship inicial cobre **uma** skill (`html-plan`). v0.2.0+ adiciona mais à medida que valem o esforço.

| Componente | Tipo | Domínio |
|------------|------|---------|
| **html-plan** | skill + command `/html-plan` | Produz HTML designed em 2 fases (roadmap markdown → HTML self-contained). 8px baseline grid, contraste WCAG AA, sem pure black/white, real data, `:focus-visible` real, 5 surfaces (web / deck / poster / frame / mockup). Invocação **explícita por nome** — não auto-triggera em "make me a webpage" genérico. |

---

## Skill triggers

| Sintoma do utilizador | Skill / Command que dispara |
|-----------------------|------------------------------|
| "use html-plan to make X", "invoke html-plan", `/html-plan ...` | `html-plan` |
| "make me a webpage", "design this page" (sem nomear) | **Não triggera** — usa outro path. |

A regra: `html-plan` é uma escolha consciente do user para entrar no modo de discipline. Sem nomeá-la, fica fora.

---

## Princípios da família craft

1. **Disciplina antes de output.** Phase 1 é sempre um roadmap escrito (cores com contraste calculado, tipos em múltiplos de 8, layout em grid). Só depois Phase 2 escreve o ficheiro real.
2. **Anti-slop.** Sem `#000000`/`#ffffff`. Sem lorem ipsum. Sem "John Doe". Sem três accents. Sem `outline: none` sem replacement.
3. **Real data.** Se o user não fornece content, a skill pergunta ou gera placeholders **explicitamente labeled**.
4. **Self-critique mensurável.** 5 dimensões (typography, color, spacing, real data, accessibility), score 1–5. Abaixo de 4 → revê antes de avançar.
5. **Surfaces deliberadas.** Cinco categorias com convenções próprias (web, deck, poster, frame, mockup). User escolhe; a skill não adivinha.

---

## Arquitectura

```
craft/
├── .claude-plugin/
│   └── plugin.json
├── README.md
├── CHANGELOG.md
├── smoke.sh
├── commands/
│   └── html-plan.md                    # /html-plan — wrapper fino que invoca a skill
└── skills/
    └── html-plan/
        ├── SKILL.md                    # 2-phase workflow + hard constraints summary
        └── references/
            ├── principles.md           # full design principles (8px grid, palettes, contraste, etc)
            └── surfaces.md             # conventions per surface (web/deck/poster/frame/mockup)
```

---

## Como invocar

**Via slash command** (recomendado para descoberta):

```
/html-plan <surface> <brief curto>
```

Exemplo:

```
/html-plan web landing page para um SaaS de billing automation
/html-plan deck pitch deck Series A para um produto de RAG
/html-plan poster A4 para evento NIS2 (Lisbon, June 2026)
```

**Via nome da skill** (igualmente válido):

```
"use html-plan to build a landing page for Acme"
"invoke html-plan for a tech-sharing deck on Postgres RLS"
```

---

## Roadmap

- **v0.2.0** — `logo-generator` (SVG logos + showcase via Gemini API). Requer Python venv + `GEMINI_API_KEY` em Vault `secret/ai/gemini`. Iteração dedicada para resolver bootstrap de deps externas sem fricção (provavelmente `/wire-craft-bootstrap` à la `/wire-vault-bootstrap`).
- **v0.3.0+** — possíveis adições conforme valem o esforço: deck-builder (slides com discipline equivalente ao html-plan), copy-generator (texto editorial sem AI-tropes), data-poster (visualizações com tipografia editorial).

---

## Instalação

```bash
# 1 · Instalar via marketplace jump2new
/plugin marketplace add mjvmsteixeira/claudecodemastery
/plugin install wire-craft@jump2new

#    (alternativa · empacotar localmente)
cd craft
zip -r /tmp/wire-craft.plugin . -x "*.DS_Store" "smoke.sh"
/plugin install /tmp/wire-craft.plugin

# 2 · Sanity check
/plugin list                                  # verificar wire-craft v0.1.0
/html-plan web a really small test page       # confirmar Phase 1 produz roadmap
```

---

## Nota de naming

O prefixo `wire-` é da **família do marketplace `jump2new`** (alinha com `wire-base`, `wire-secops`, `wire-devkit`) — **não tem ligação operacional** ao SaaS Wire propriamente dito. `wire-craft` serve qualquer projecto que precise de output designed com discipline, não só os 170+ municípios em produção.

---

© 2026 jump2new · Uso interno · Versão 0.1.0

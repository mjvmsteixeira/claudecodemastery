---
name: prumo-onboard
description: Setup wizard end-to-end do ecossistema prumo — detecta quais plugins (prumo-base, prumo-secops, prumo-devkit) estão instalados, guia a instalação dos que faltam (com a ordem certa) e sugere smoke tests por plugin. Dispara em "setup prumo", "instalar plugins prumo", "onboard prumo", "começar com prumo", "estou novo no prumo", "instala o ecossistema", "prumo onboarding". Idempotente — pode correr múltiplas vezes; só age sobre gaps.
---

# prumo-onboard

Skill-trigger que delega para o command `/prumo-onboard`. Toda a lógica de detecção, gaps e smoke tests vive no command — esta skill apenas activa-o por intenção do utilizador.

## Trigger

- `"setup prumo"`, `"onboard prumo"`, `"estou novo no prumo"`, `"começar com prumo"`
- `"instala o ecossistema prumo"`, `"instalar plugins prumo"`
- `"como começo?"` (quando o contexto da conversa é prumo / SecOps / SaaS)

## Acção

Invocar `/prumo-onboard`. O command:

1. Detecta plugins instalados na cache (`~/.claude/plugins/cache`).
2. Para cada plugin em falta, emite as linhas `/plugin marketplace add` e `/plugin install` para o utilizador colar.
3. Para cada plugin instalado, sugere um smoke test (`/vault-list`, `/prumo-stack-doctor`, `/full-audit --ci`).
4. Propõe configurar `PRUMO_OPERATING_MODE` se ainda não houver `~/.prumo/mode`.
5. Imprime relatório final com pendentes.

Nada é instalado automaticamente — Claude Code não permite a um slash command executar `/plugin install`. O command emite as linhas exactas para o utilizador colar.

## Pré-requisito

Ter o `prumo-base` instalado para esta skill auto-disparar — é onde ela vive. Para o primeiro install do ecossistema, a fonte de verdade é o README do marketplace.

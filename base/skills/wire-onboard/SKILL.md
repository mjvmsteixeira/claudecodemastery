---
name: wire-onboard
description: Setup wizard end-to-end do ecossistema Wire — detecta quais plugins (wire-base, wire-secops, wire-devkit) estão instalados, guia a instalação dos que faltam (com a ordem certa) e sugere smoke tests por plugin. Dispara em "setup wire", "instalar plugins wire", "onboard wire", "começar com wire", "estou novo no wire", "instala o ecossistema", "wire onboarding". Idempotente — pode correr múltiplas vezes; só age sobre gaps.
---

# wire-onboard

Skill-trigger que delega para o command `/wire-onboard`. Toda a lógica de detecção, gaps e smoke tests vive no command — esta skill apenas activa-o por intenção do utilizador.

## Trigger

- `"setup wire"`, `"onboard wire"`, `"estou novo no wire"`, `"começar com wire"`
- `"instala o ecossistema wire"`, `"instalar plugins wire"`
- `"como começo?"` (quando o contexto da conversa é Wire / SecOps / SaaS)

## Acção

Invocar `/wire-onboard`. O command:

1. Detecta plugins instalados na cache (`~/.claude/plugins/cache`).
2. Para cada plugin em falta, emite as linhas `/plugin marketplace add` e `/plugin install` para o utilizador colar.
3. Para cada plugin instalado, sugere um smoke test (`/vault-list`, `/wire-stack-doctor`, `/full-audit --ci`).
4. Propõe configurar `WIRE_OPERATING_MODE` se ainda não houver `~/.wire/mode`.
5. Imprime relatório final com pendentes.

Nada é instalado automaticamente — Claude Code não permite a um slash command executar `/plugin install`. O command emite as linhas exactas para o utilizador colar.

## Pré-requisito

Ter o `wire-base` instalado para esta skill auto-disparar — é onde ela vive. Para o primeiro install do ecossistema, a fonte de verdade é o README do marketplace.

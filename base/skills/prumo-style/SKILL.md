---
name: prumo-style
description: Activa/remove um estilo de output conciso e directo ("talk-normal") injectando um bloco versionado num CLAUDE.md, com dois perfis (normal e focus). Dispara em "torna o Claude conciso", "modo conciso", "respostas mais curtas", "prumo style", "tira o filler das respostas", "modo focus", "quero ver o progresso durante a execução", "desactiva o estilo conciso". Scope projecto por default; --user para o global.
---

# prumo-style

Skill-trigger que delega para `/prumo-style`. Permite ligar/desligar um estilo de output conciso sem editar `CLAUDE.md` à mão.

## Trigger

- `"torna o Claude conciso"`, `"modo conciso"`, `"respostas mais curtas"`, `"tira o filler"`
- `"prumo style"`, `"o estilo conciso está activo?"`
- `"modo focus"`, `"quero acompanhar o progresso durante a execução"`, `"diz-me sempre em que passo vais"`
- `"desactiva o estilo conciso"`, `"remove o prumo style"`

## Acção

Invocar `/prumo-style <arg>` com base na intenção:

| Intenção do utilizador | Invocação |
|------------------------|-----------|
| "está activo?" / "qual o estado?" | `/prumo-style` (ou `/prumo-style status`) |
| "activa neste projecto" | `/prumo-style on` |
| "activa em todo o lado / global" | `/prumo-style on --user` |
| "quero ver progresso / execução longa" | `/prumo-style on --profile focus` |
| "volta ao normal, sem os updates de estado" | `/prumo-style on --profile normal` |
| "desactiva neste projecto" | `/prumo-style off` |
| "desactiva global" | `/prumo-style off --user` |

O command injecta (ou remove) um bloco delimitado por marcadores `<!-- prumo-style BEGIN vN profile=X -->` / `<!-- prumo-style END -->`, com backup automático do `CLAUDE.md` em `~/.prumo/backups/` antes de escrever.

Dois perfis: `normal` (default, 9 regras de concisão) e `focus` (as 9 + 4 regras de execução multi-passo — reafirmar estado, tornar visível o que já funciona, fechar com uma acção seguinte, estimativas concretas). Escolhe `focus` quando o pedido é sobre acompanhar progresso; `normal` para concisão geral. `on` sem `--profile` preserva o perfil já instalado.

## Fronteira

- Scope default é **projecto** (`./CLAUDE.md`); só vai ao global com `--user`. Se o utilizador já tem regras de estilo no `~/.claude/CLAUDE.md`, não as dupliques — pergunta antes de usar `--user`.
- É injecção de config, **não** um hook nem reescrita de output em runtime. Não respeita `PRUMO_OPERATING_MODE`.
- Tudo fora dos marcadores nunca é tocado. Para reverter: `/prumo-style off`.
- O efeito só entra em vigor na próxima sessão (o Claude Code relê `CLAUDE.md` no arranque) — avisa o utilizador para recarregar.

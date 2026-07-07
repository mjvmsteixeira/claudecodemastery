---
name: prumo-style
description: Activa/remove um estilo de output conciso e directo ("talk-normal") injectando um bloco versionado num CLAUDE.md. Dispara em "torna o Claude conciso", "modo conciso", "respostas mais curtas", "prumo style", "tira o filler das respostas", "desactiva o estilo conciso". Scope projecto por default; --user para o global.
---

# prumo-style

Skill-trigger que delega para `/prumo-style`. Permite ligar/desligar um estilo de output conciso sem editar `CLAUDE.md` à mão.

## Trigger

- `"torna o Claude conciso"`, `"modo conciso"`, `"respostas mais curtas"`, `"tira o filler"`
- `"prumo style"`, `"o estilo conciso está activo?"`
- `"desactiva o estilo conciso"`, `"remove o prumo style"`

## Acção

Invocar `/prumo-style <arg>` com base na intenção:

| Intenção do utilizador | Invocação |
|------------------------|-----------|
| "está activo?" / "qual o estado?" | `/prumo-style` (ou `/prumo-style status`) |
| "activa neste projecto" | `/prumo-style on` |
| "activa em todo o lado / global" | `/prumo-style on --user` |
| "desactiva neste projecto" | `/prumo-style off` |
| "desactiva global" | `/prumo-style off --user` |

O command injecta (ou remove) um bloco delimitado por marcadores `<!-- prumo-style BEGIN vN -->` / `<!-- prumo-style END -->`, com backup automático do `CLAUDE.md` em `~/.prumo/backups/` antes de escrever.

## Fronteira

- Scope default é **projecto** (`./CLAUDE.md`); só vai ao global com `--user`. Se o utilizador já tem regras de estilo no `~/.claude/CLAUDE.md`, não as dupliques — pergunta antes de usar `--user`.
- É injecção de config, **não** um hook nem reescrita de output em runtime. Não respeita `PRUMO_OPERATING_MODE`.
- Tudo fora dos marcadores nunca é tocado. Para reverter: `/prumo-style off`.
- O efeito só entra em vigor na próxima sessão (o Claude Code relê `CLAUDE.md` no arranque) — avisa o utilizador para recarregar.

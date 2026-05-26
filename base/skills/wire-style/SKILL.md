---
name: wire-style
description: Activa/remove um estilo de output conciso e directo ("talk-normal") injectando um bloco versionado num CLAUDE.md. Dispara em "torna o Claude conciso", "modo conciso", "respostas mais curtas", "wire style", "tira o filler das respostas", "desactiva o estilo conciso". Scope projecto por default; --user para o global.
---

# wire-style

Skill-trigger que delega para `/wire-style`. Permite ligar/desligar um estilo de output conciso sem editar `CLAUDE.md` à mão.

## Trigger

- `"torna o Claude conciso"`, `"modo conciso"`, `"respostas mais curtas"`, `"tira o filler"`
- `"wire style"`, `"o estilo conciso está activo?"`
- `"desactiva o estilo conciso"`, `"remove o wire style"`

## Acção

Invocar `/wire-style <arg>` com base na intenção:

| Intenção do utilizador | Invocação |
|------------------------|-----------|
| "está activo?" / "qual o estado?" | `/wire-style` (ou `/wire-style status`) |
| "activa neste projecto" | `/wire-style on` |
| "activa em todo o lado / global" | `/wire-style on --user` |
| "desactiva neste projecto" | `/wire-style off` |
| "desactiva global" | `/wire-style off --user` |

O command injecta (ou remove) um bloco delimitado por marcadores `<!-- wire-style BEGIN vN -->` / `<!-- wire-style END -->`, com backup automático do `CLAUDE.md` em `~/.wire/backups/` antes de escrever.

## Fronteira

- Scope default é **projecto** (`./CLAUDE.md`); só vai ao global com `--user`. Se o utilizador já tem regras de estilo no `~/.claude/CLAUDE.md`, não as dupliques — pergunta antes de usar `--user`.
- É injecção de config, **não** um hook nem reescrita de output em runtime. Não respeita `WIRE_OPERATING_MODE`.
- Tudo fora dos marcadores nunca é tocado. Para reverter: `/wire-style off`.
- O efeito só entra em vigor na próxima sessão (o Claude Code relê `CLAUDE.md` no arranque) — avisa o utilizador para recarregar.

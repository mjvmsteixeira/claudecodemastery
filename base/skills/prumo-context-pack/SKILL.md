---
name: prumo-context-pack
description: Prepara um pack de contexto curado (cheat-sheet) cross-plugin para sessões IR, release ou audit — agrupa skills, commands, agents, paths Vault, AppRoles, logs e one-liners por scope. Dispara em "prepara contexto IR", "context pack release", "preciso do cheat-sheet de audit", "pack para incidente", "o que tenho para release?", "prumo context pack". Read-only — não corre nada, só lista. NÃO confundir com /prumo-doctor (que audita o setup) nem /full-audit (que audita um projecto).
---

# prumo-context-pack

Skill-trigger que delega para `/prumo-context-pack <scope>`. Emite um **cheat-sheet estruturado** para primar uma sessão com o vocabulário operacional certo — sem fetch de live data.

## Trigger

- `"prepara contexto IR"`, `"pack IR"`, `"contexto para incidente"`, `"vou abrir uma IR"`
- `"context pack release"`, `"pack release"`, `"o que tenho para release?"`, `"vou fazer um deploy"`
- `"cheat-sheet de audit"`, `"pack audit"`, `"contexto para audit"`, `"vou auditar"`
- `"prumo context pack"`, `"todos os packs"`, `"contexto completo"` → scope `all`

## Acção

Inferir o `scope` da intenção do utilizador e invocar o command:

| Intenção do utilizador | Invocação |
|------------------------|-----------|
| Incidente, IR, breach, propagação cross-tenant | `/prumo-context-pack ir` |
| Release, deploy, canary, rollback, gates | `/prumo-context-pack release` |
| Audit, compliance, segurança, code quality, perf | `/prumo-context-pack audit` |
| Sem scope claro / pedido explícito de tudo | `/prumo-context-pack all` |

Se o utilizador disser explicitamente o scope (ex: `"pack ir"`, `"context pack release"`), respeitar.

## O que o pack contém (por scope)

- **Skills** relevantes (auto-trigger por intenção)
- **Commands** disponíveis (orquestradores + utilitários)
- **Agents** específicos (em plugins que os trazem)
- **Vault** — paths KV, AppRoles, SSH roles relevantes
- **Logs e telemetria** — caminhos para CEF, SIEM, syslog
- **One-liners** úteis para diagnose rápido
- **Princípios operacionais** (apenas no pack IR)

Itens de plugins não instalados são marcados `(plugin em falta)` com link para `/plugin install`.

## Fronteira

- Esta skill **não corre** nada — só lista. Para correr de facto, usar os commands listados no pack.
- Não substitui `/prumo-doctor` (que audita o setup local) nem `/full-audit` (que audita um projecto).
- O pack é um **mapa**, não uma acção. Serve para primar sessões novas (ou um modelo em pair-programming) com o vocabulário operacional certo.

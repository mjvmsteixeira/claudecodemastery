---
name: prumo-mode
description: Mostra o PRUMO_OPERATING_MODE (prod/dev/lab) que os hooks do ecossistema prumo respeitam e como o alterar. Dispara em "muda para dev", "modo dev", "modo prod", "activa lab mode", "qual o modo actual?", "prumo mode". Lê ~/.prumo/mode e o marker ~/.prumo/lab-mode; a alteração é humana.
---

# prumo-mode

Skill-trigger que delega para `/prumo-mode`. Mostra o modo operacional dos plugins prumo e os caminhos humanos para o mudar (`/prumo-guard-mode` ou o terminal).

## Trigger

- `"muda para dev"`, `"modo dev"`, `"passa para prod"`, `"activa lab mode"`
- `"qual o modo actual?"`, `"prumo mode"`, `"como é que está o PRUMO_OPERATING_MODE?"`
- `"warn-only nos hooks"`, `"fail-closed nos hooks"`

## Acção

Invocar `/prumo-mode <arg>` com base na intenção:

| Intenção do utilizador | Invocação |
|------------------------|-----------|
| "qual o modo actual?" | `/prumo-mode` (ou `/prumo-mode status`) |
| "muda para prod" | `/prumo-mode prod` |
| "muda para dev" | `/prumo-mode dev` |
| "activa lab" | `/prumo-mode lab` |

O command lê o modo e mostra ao utilizador como o alterar: o hook `self-guard` bloqueia escritas do agente em `~/.prumo/mode` e `~/.prumo/lab-mode` (a alteração é humana: `/prumo-guard-mode` ou o terminal). Para `lab`, o marker `~/.prumo/lab-mode` é obrigatório por segurança — previne activação acidental.

## Resumo dos modos

- **prod** (default) — hooks fail-closed (`exit 2` em violação). Operação real.
- **dev** — hooks warn-only (logam mas não bloqueiam). Formação, demos, desenvolvimento.
- **lab** — bypass total dos hooks (silent). Exploração de novos hooks / eval; **exige marker** `~/.prumo/lab-mode` para activar.

## Fronteira

Esta skill **não** muda comportamento de plugins não-prumo nem ferramentas externas. Só afecta os hooks que sourceiam a `prumo-common.sh` (actualmente `prumo-secops/hooks/*.sh` via `_lib.sh`).

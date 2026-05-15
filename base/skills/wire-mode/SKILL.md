---
name: wire-mode
description: Configura o WIRE_OPERATING_MODE (prod/dev/lab) que os hooks do ecossistema Wire respeitam. Dispara em "muda para dev", "modo dev", "modo prod", "activa lab mode", "qual o modo actual?", "wire mode". Lê/escreve ~/.wire/mode + gere o marker ~/.wire/lab-mode.
---

# wire-mode

Skill-trigger que delega para `/wire-mode`. Permite ver e mudar o modo operacional dos plugins Wire sem editar ficheiros à mão.

## Trigger

- `"muda para dev"`, `"modo dev"`, `"passa para prod"`, `"activa lab mode"`
- `"qual o modo actual?"`, `"wire mode"`, `"como é que está o WIRE_OPERATING_MODE?"`
- `"warn-only nos hooks"`, `"fail-closed nos hooks"`

## Acção

Invocar `/wire-mode <arg>` com base na intenção:

| Intenção do utilizador | Invocação |
|------------------------|-----------|
| "qual o modo actual?" | `/wire-mode` (ou `/wire-mode status`) |
| "muda para prod" | `/wire-mode prod` |
| "muda para dev" | `/wire-mode dev` |
| "activa lab" | `/wire-mode lab` |

O command lê/escreve `~/.wire/mode` e, para `lab`, cria o marker `~/.wire/lab-mode` (obrigatório por segurança — previne activação acidental).

## Resumo dos modos

- **prod** (default) — hooks fail-closed (`exit 2` em violação). Operação real.
- **dev** — hooks warn-only (logam mas não bloqueiam). Formação, demos, desenvolvimento.
- **lab** — bypass total dos hooks (silent). Exploração de novos hooks / eval; **exige marker** `~/.wire/lab-mode` para activar.

## Fronteira

Esta skill **não** muda comportamento de plugins não-Wire nem ferramentas externas. Só afecta os hooks que sourceiam a `wire-common.sh` (actualmente `wire-secops/hooks/*.sh` via `_lib.sh`).

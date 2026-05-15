---
name: wire-smoke
description: Corre smoke tests read-only dos plugins Wire — confirma libs, hooks executáveis, ferramentas opcionais. Dispara em "smoke test wire", "instalei e funciona?", "/wire-smoke", "sanity check rápido dos plugins". Diferente de /wire-doctor (mais leve e focado em install correctness, não em diagnóstico operacional).
---

# wire-smoke

Skill-trigger que delega para `/wire-smoke [base|secops|devkit|all]`. Corre o `smoke.sh` de cada plugin para confirmar que foi instalado correctamente — libs carregam, hooks executáveis, ferramentas opcionais detectadas.

## Trigger

- `"smoke test wire"`, `"/wire-smoke"`, `"smoke base"`, `"smoke secops"`
- `"instalei o plugin, funciona?"`, `"confirma que está bem instalado"`
- `"sanity check rápido"`, `"check de install"`
- `"smoke todos os plugins"`, `"all smokes"`

## Acção

Invocar `/wire-smoke` com o scope adequado:

| Intenção | Invocação |
|----------|-----------|
| Sanity check geral | `/wire-smoke all` (ou sem argumento) |
| Verificar instalação específica | `/wire-smoke base` / `secops` / `devkit` |
| Logo após `/plugin install` | `/wire-smoke <plugin>` |

## Diferença vs `/wire-doctor`

- **`/wire-smoke`** — "este plugin está bem instalado?" (~2s por plugin, focado em correctness estrutural).
- **`/wire-doctor`** — "o setup está saudável e operacional?" (mais lento, orquestra outras skills, contexto operacional).

Para uma sessão nova: `/wire-onboard` → `/wire-smoke` → `/wire-doctor`.

## Fronteira

- Read-only. Cada `smoke.sh` é shippado dentro do plugin que testa.
- Não substitui `/wire-doctor` (operacional) nem `scripts/validate.sh` (estático source-tree).
- Não faz network requests por defeito — testa só presença local.

---
name: prumo-smoke
description: Corre smoke tests read-only dos plugins prumo — confirma libs, hooks executáveis, ferramentas opcionais. Dispara em "smoke test prumo", "instalei e funciona?", "/prumo-smoke", "sanity check rápido dos plugins". Diferente de /prumo-doctor (mais leve e focado em install correctness, não em diagnóstico operacional).
---

# prumo-smoke

Skill-trigger que delega para `/prumo-smoke [base|secops|devkit|all]`. Corre o `smoke.sh` de cada plugin para confirmar que foi instalado correctamente — libs carregam, hooks executáveis, ferramentas opcionais detectadas.

## Trigger

- `"smoke test prumo"`, `"/prumo-smoke"`, `"smoke base"`, `"smoke secops"`
- `"instalei o plugin, funciona?"`, `"confirma que está bem instalado"`
- `"sanity check rápido"`, `"check de install"`
- `"smoke todos os plugins"`, `"all smokes"`

## Acção

Invocar `/prumo-smoke` com o scope adequado:

| Intenção | Invocação |
|----------|-----------|
| Sanity check geral | `/prumo-smoke all` (ou sem argumento) |
| Verificar instalação específica | `/prumo-smoke base` / `secops` / `devkit` |
| Logo após `/plugin install` | `/prumo-smoke <plugin>` |

## Diferença vs `/prumo-doctor`

- **`/prumo-smoke`** — "este plugin está bem instalado?" (~2s por plugin, focado em correctness estrutural).
- **`/prumo-doctor`** — "o setup está saudável e operacional?" (mais lento, orquestra outras skills, contexto operacional).

Para uma sessão nova: `/prumo-onboard` → `/prumo-smoke` → `/prumo-doctor`.

## Fronteira

- Read-only. Cada `smoke.sh` é shippado dentro do plugin que testa.
- Não substitui `/prumo-doctor` (operacional) nem `scripts/validate.sh` (estático source-tree).
- Não faz network requests por defeito — testa só presença local.

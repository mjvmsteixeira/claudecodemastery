---
name: prumo-telemetry
description: Sumário local da telemetria dos guardrails prumo — quantas vezes cada hook bloqueou/avisou/bypassou/passou. Read-only. Aceita janela temporal (--since Nd|Nh|all).
allowed-tools: Bash
---

# /prumo-telemetry

Mostra, por hook, o que cada guardrail fez na prática — a partir de `~/.prumo/log/telemetry.tsv` (contagens, sem conteúdo de comando). **Read-only.**

## Correr

```bash
LIB="$(find ~/.claude/plugins/cache -path '*/prumo-base/*/lib/prumo-common.sh' -print -quit 2>/dev/null)"
if [ -z "$LIB" ]; then
  echo "prumo-base não encontrado no cache de plugins — sem telemetria." >&2
  exit 0
fi
# shellcheck source=/dev/null
source "$LIB"

SINCE="${1:-all}"   # all | Nd (ex: 7d) | Nh (ex: 24h)
echo "== Telemetria dos guardrails (janela: ${SINCE}) =="
echo "hook             decisões                              disparos/total"
prumo_telemetry_summary --since "$SINCE"
```

## Ler o resultado

- `block` — bloqueou (exit 2). `warn` — avisou (dev). `bypass` — override audit-tracked. `allow` — passou.
- `fire=B/T` — disparos (block+warn+bypass) sobre total de invocações. Um hook com `fire=0/N` alto nunca actuou: candidato a rever (ruído) ou a estar a proteger silenciosamente.
- Janela: `/prumo-telemetry 7d` (últimos 7 dias), `/prumo-telemetry 24h`, `/prumo-telemetry all` (default).

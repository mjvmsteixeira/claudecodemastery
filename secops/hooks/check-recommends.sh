#!/usr/bin/env bash
# prumo-secops · SessionStart · verifica plugins recomendados em falta.
# Não bloqueia — apenas emite nota de contexto.

set -u

if ! find ~/.claude/plugins/cache -path "*/prumo-base/*/.claude-plugin/plugin.json" -print -quit 2>/dev/null | grep -q .; then
  cat <<EOF
[prumo-secops] Note: o plugin recomendado prumo-base não está instalado.
  Os hooks (vault-ttl, pii-redact, approval-gate, second-opinion, cef-wazuh,
  vault-revoke) continuam a correr com stubs de fallback (modo prod-fail-closed),
  mas perdes prumo_log estruturado e PRUMO_OPERATING_MODE (prod/dev/lab).
  Instalar: /plugin install prumo-base@prumo
EOF
fi

exit 0

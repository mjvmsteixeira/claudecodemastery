#!/usr/bin/env bash
# wire-secops · SessionStart · verifica plugins recomendados em falta.
# Não bloqueia — apenas emite nota de contexto.

set -u

if ! find ~/.claude/plugins/cache -path "*/wire-base/*/.claude-plugin/plugin.json" -print -quit 2>/dev/null | grep -q .; then
  cat <<EOF
[wire-secops] Note: o plugin recomendado wire-base não está instalado.
  Os hooks (vault-ttl, pii-redact, approval-gate, second-opinion, cef-wazuh,
  vault-revoke) continuam a correr com stubs de fallback (modo prod-fail-closed),
  mas perdes wire_log estruturado e WIRE_OPERATING_MODE (prod/dev/lab).
  Instalar: /plugin install wire-base@jump2new
EOF
fi

exit 0

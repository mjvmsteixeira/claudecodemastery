#!/usr/bin/env bash
# Wire SecOps · pre-tool · Second-opinion via Ollama local (qwen3-coder).
# Aplica-se a comandos destrutivos/cross-tenant. Fail-closed se o modelo local estiver indisponível.
set -euo pipefail
# shellcheck source=_lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

CMD="${1:-$(cat)}"

# Aplica-se só se for cross-tenant ou destrutivo
if ! echo "$CMD" | grep -qE '(cross-tenant|all-tenants|systemctl (stop|disable) puma|cap.*deploy:rollback|vault operator seal|rm -rf /forensics|vault write transit.*rotate|DROP TABLE|TRUNCATE|DELETE FROM)'; then
  exit 0
fi

if ! curl -sf -m 3 http://127.0.0.1:11434/api/tags > /dev/null 2>&1; then
  wire_fail_or_warn "wire-secops" "second-opinion" "Ollama local não responde — second-opinion indisponível para operação destrutiva"
fi

RESPONSE=$(curl -sf -m 15 http://127.0.0.1:11434/api/generate \
  -d "$(jq -n --arg cmd "$CMD" '{
    model: "qwen3-coder",
    prompt: ("Avalia se este comando é seguro num contexto SecOps SaaS multi-tenant. Responde apenas SAFE ou UNSAFE com uma linha de justificação. Comando: " + $cmd),
    stream: false
  }')" | jq -r '.response // "UNSAFE - sem resposta"')

VERDICT=$(echo "$RESPONSE" | head -1 | awk '{print $1}')

if [ "$VERDICT" != "SAFE" ]; then
  echo "[hook] Second-opinion: $RESPONSE" >&2
  wire_fail_or_warn "wire-secops" "second-opinion" "Verdict do modelo local: $VERDICT"
fi

echo "[hook] Second-opinion: SAFE ($RESPONSE)"
exit 0

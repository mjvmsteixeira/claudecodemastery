#!/usr/bin/env bash
# Wire SecOps · pre-tool · Second-opinion via Ollama local (qwen3-coder).
# Aplica-se a comandos destrutivos/cross-tenant. Fail-closed se o modelo local estiver indisponível.
set -euo pipefail
# shellcheck source=_lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

CMD=$(hook_tool_payload "${1:-}")

OLLAMA_HOST="${OLLAMA_HOST:-http://127.0.0.1:11434}"
OLLAMA_MODEL="${OLLAMA_MODEL:-qwen3-coder:30b}"

# Aplica-se só se for cross-tenant ou destrutivo
if ! echo "$CMD" | grep -qE '(cross-tenant|all-tenants|systemctl (stop|disable) puma|cap.*deploy:rollback|vault operator seal|rm -rf /forensics|vault write transit.*rotate|DROP TABLE|TRUNCATE|DELETE FROM)'; then
  exit 0
fi

if ! curl -sf -m 3 "${OLLAMA_HOST}/api/tags" > /dev/null 2>&1; then
  prumo_fail_or_warn "prumo-secops" "second-opinion" "Ollama local não responde — second-opinion indisponível para operação destrutiva"
fi

PROMPT="Analyze this command for safety. Respond with EXACTLY one of: SAFE or UNSAFE, on a single line, nothing else.

Command: $CMD"

REQUEST_JSON=$(jq -n \
  --arg model "$OLLAMA_MODEL" \
  --arg prompt "$PROMPT" \
  '{model: $model, prompt: $prompt, stream: false}')

RESPONSE=$(curl -s "${OLLAMA_HOST}/api/generate" -d "$REQUEST_JSON" 2>/dev/null \
  | jq -r '.response // empty' 2>/dev/null || echo "")

# Aceita SAFE/UNSAFE em qualquer posição na primeira linha (LLMs prefaceiam às
# vezes com "Verdict:" ou "I think this is"). UNSAFE primeiro para que "this is
# UNSAFE because it's SAFE only if..." caia em UNSAFE.
FIRST_LINE=$(printf '%s' "$RESPONSE" | head -1)
if echo "$FIRST_LINE" | grep -qiE '\bUNSAFE\b'; then
  VERDICT="UNSAFE"
elif echo "$FIRST_LINE" | grep -qiE '\bSAFE\b'; then
  VERDICT="SAFE"
else
  VERDICT=""
fi

if [ "$VERDICT" != "SAFE" ]; then
  cat >&2 <<EOF
[hook] second-opinion · Ollama verdict não é SAFE.
  Model: ${OLLAMA_MODEL}
  Verdict raw: $(echo "$RESPONSE" | head -c 120)
  Para autorizar mesmo assim (override): PRUMO_SECOND_OPINION_BYPASS=1 <comando>
EOF
  if [ "${PRUMO_SECOND_OPINION_BYPASS:-}" = "1" ]; then
    exit 0
  fi
  prumo_fail_or_warn "prumo-secops" "second-opinion" "Ollama verdict: ${VERDICT:-EMPTY}"
fi

echo "[hook] Second-opinion: SAFE ($RESPONSE)"
exit 0

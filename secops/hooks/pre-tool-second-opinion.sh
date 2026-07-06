#!/usr/bin/env bash
# Wire SecOps · pre-tool · Guardrail semântico via Ollama local (qwen3-coder).
# Dispara SÓ na zona-cinzenta (ofuscação que a regex dos outros hooks não apanha).
# O comando entra como DADO não-confiável (anti-injeção). Veredicto estruturado
# (JSON). Conservador: em dúvida bloqueia. Fail-closed se o modelo cair, respeitando
# o modo; destrancável por PRUMO_SECOND_OPINION_BYPASS=1 (audit-tracked).
set -euo pipefail
# shellcheck source=_lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

CMD=$(hook_tool_payload "${1:-}")

OLLAMA_HOST="${OLLAMA_HOST:-http://127.0.0.1:11434}"
OLLAMA_MODEL="${OLLAMA_MODEL:-qwen3-coder:30b}"
BYPASS="${PRUMO_SECOND_OPINION_BYPASS:-}"

# ── zona-cinzenta ─────────────────────────────────────────────────────────────
# O trigger cobre (a) ofuscação/evasão que a regex dos outros hooks não apanha, e
# (b) ops destrutivas/cross-tenant sem cobertura em NENHUM outro hook. O destrutivo
# óbvio já coberto por audit-guard/approval-gate (systemctl stop puma, cap
# deploy:rollback, SQL, rm -rf /forensics) fica de fora — sem re-avaliação redundante.
# shellcheck disable=SC2016  # regex literal com ${IFS}, não expandir
# 1) ofuscação/evasão que a regex dos outros hooks não apanha
GRAYZONE_OBFUSCATION='base64[[:space:]]*(-d|--decode)|(^|[;&|[:space:]])eval([[:space:]]|$)|\$\{?IFS\}?|(^|[;&|[:space:]])(/bin/|/usr/bin/)?(bash|sh)[[:space:]]+-c\b|(python[0-9]?|perl|ruby|node)[[:space:]]+-(c|e)\b|(printf|echo)[[:space:]].*\\x[0-9a-fA-F]{2}|xxd[[:space:]]+-r|(curl|wget)[[:space:]].+\|[[:space:]]*(/bin/|/usr/bin/)?(bash|sh)([[:space:]]|$)'
# 2) ops destrutivas/cross-tenant que NENHUM outro hook cobre (retidas do baseline)
GRAYZONE_UNGUARDED='cross-tenant|all-tenants|vault[[:space:]]+operator[[:space:]]+seal|vault[[:space:]]+write[[:space:]]+transit.*rotate'
GRAYZONE_REGEX="${GRAYZONE_OBFUSCATION}|${GRAYZONE_UNGUARDED}"

if ! printf '%s' "$CMD" | grep -qiE "$GRAYZONE_REGEX"; then
  exit 0
fi

# ── bloqueio conservador com escape audit-tracked ─────────────────────────────
# Cobre TODOS os ramos de bloqueio, incluindo Ollama-down (o baseline só cobria o
# ramo do veredicto). Em prod prumo_fail_or_warn faz exit 2; em dev avisa e retorna,
# caindo depois no exit 0 (warn-only = permitir).
so_block_or_bypass() {
  if [ "$BYPASS" = "1" ]; then
    echo "[hook] second-opinion · BYPASS audit-tracked: $1" >&2
    exit 0
  fi
  prumo_fail_or_warn "prumo-secops" "second-opinion" "$1"
  exit 0
}

# ── modelo disponível? ────────────────────────────────────────────────────────
if ! curl -sf -m 3 "${OLLAMA_HOST}/api/tags" >/dev/null 2>&1; then
  so_block_or_bypass "Ollama local não responde — guardrail semântico indisponível para comando ofuscado"
fi

# ── pedido ao modelo (afinado na Task 2: anti-injeção + schema) ───────────────
PROMPT="Classify this shell command as safe or unsafe. Respond with JSON {\"verdict\":\"safe|unsafe|uncertain\"}.

Command: $CMD"
REQUEST_JSON=$(jq -n --arg model "$OLLAMA_MODEL" --arg prompt "$PROMPT" \
  '{model:$model, prompt:$prompt, stream:false, format:"json", options:{temperature:0}}')
RESPONSE=$(curl -s -m 20 "${OLLAMA_HOST}/api/generate" -d "$REQUEST_JSON" 2>/dev/null \
  | jq -r '.response // empty' 2>/dev/null || echo "")

VERDICT=$(printf '%s' "$RESPONSE" | jq -r '.verdict // empty' 2>/dev/null \
  | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]' || echo "")

case "$VERDICT" in
  safe) echo "[hook] second-opinion · veredicto: safe"; exit 0 ;;
  *)    so_block_or_bypass "veredicto do guardrail semântico: ${VERDICT:-indeterminado} · raw: $(printf '%s' "$RESPONSE" | head -c 120)" ;;
esac

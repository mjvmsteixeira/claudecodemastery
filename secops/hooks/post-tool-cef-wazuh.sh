#!/usr/bin/env bash
# Wire SecOps · post-tool · Envia evento CEF para o Wazuh com a tool call executada.
# Configurável via env: WAZUH_HOST, WAZUH_PORT (default 514/udp).
set -euo pipefail
# shellcheck source=_lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

# O Claude Code entrega o evento PostToolUse como JSON via stdin:
#   {"tool_name":"Bash","tool_input":{...},"tool_output":...,"exit_code":N,
#    "session_id":"...","cwd":"..."}
# Não há env vars CLAUDE_TOOL_* — parsear o stdin é o caminho correcto.
EVENT=$(cat 2>/dev/null || echo '{}')
get_field() { printf '%s' "$EVENT" | jq -r "$1 // empty" 2>/dev/null; }

WAZUH_HOST="${PRUMO_WAZUH_HOST:-${WAZUH_HOST:-wazuh-manager.wire.internal}}"
WAZUH_PORT="${WAZUH_PORT:-514}"
TOOL="$(get_field '.tool_name')"; TOOL="${TOOL:-unknown}"
SESSION="$(get_field '.session_id')"; SESSION="${SESSION:-${CLAUDE_SESSION_ID:-unknown}}"
AGENT="${CLAUDE_AGENT_NAME:-unknown}"
USER="${USER:-unknown}"
EXIT_CODE="$(get_field '.exit_code')"; EXIT_CODE="${EXIT_CODE:-0}"
TOOL_INPUT_JSON="$(get_field '.tool_input | tojson')"
INPUT_HASH=$(printf '%s' "$TOOL_INPUT_JSON" | shasum -a 256 | awk '{print $1}')

# Escapa campos interpolados por CEF spec antes de construir a linha: sem isto
# um TOOL/AGENT/SESSION/USER/HOSTNAME hostil (ou apenas com | ou = dentro)
# consegue forjar campos adicionais no evento entregue ao Wazuh (log
# injection). '\' tem de ser escapado primeiro para não duplicar o escaping
# de '|' e '='. Newlines são removidas (uma linha CEF por evento).
cef_escape() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/|/\\|/g' -e 's/=/\\=/g' | tr -d '\n\r'
}

TOOL_ESC=$(cef_escape "$TOOL")
AGENT_ESC=$(cef_escape "$AGENT")
SESSION_ESC=$(cef_escape "$SESSION")
USER_ESC=$(cef_escape "$USER")
HOSTNAME_ESC=$(cef_escape "${HOSTNAME:-unknown}")

CEF="CEF:0|Wire|SecOps-Agents|1.0|toolcall|Claude Code tool call|3|src=$HOSTNAME_ESC suser=$USER_ESC cs1Label=Tool cs1=$TOOL_ESC cs2Label=Agent cs2=$AGENT_ESC cs3Label=Session cs3=$SESSION_ESC cs4Label=InputHash cs4=$INPUT_HASH cn1Label=ExitCode cn1=$EXIT_CODE"

# Envia via nc UDP — fail-soft (não bloqueia operação)
if command -v nc > /dev/null 2>&1; then
  echo "$CEF" | nc -u -w 1 "$WAZUH_HOST" "$WAZUH_PORT" 2>/dev/null || true
fi

# Também persiste localmente como fallback (best-effort)
LOG_DIR="$PRUMO_LOG_DIR"
if mkdir -p "$LOG_DIR" 2>/dev/null; then
  echo "$(date -u +%FT%TZ) $CEF" >> "$LOG_DIR/cef.log" 2>/dev/null || true
fi

exit 0

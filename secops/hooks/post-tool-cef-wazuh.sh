#!/usr/bin/env bash
# Wire SecOps · post-tool · Envia evento CEF para o Wazuh com a tool call executada.
# Configurável via env: WAZUH_HOST, WAZUH_PORT (default 514/udp).
set -euo pipefail
# shellcheck source=_lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

WAZUH_HOST="${WIRE_WAZUH_HOST:-${WAZUH_HOST:-wazuh-manager.wire.internal}}"
WAZUH_PORT="${WAZUH_PORT:-514}"
TOOL="${CLAUDE_TOOL_NAME:-unknown}"
SESSION="${CLAUDE_SESSION_ID:-unknown}"
AGENT="${CLAUDE_AGENT_NAME:-unknown}"
USER="${USER:-unknown}"
EXIT_CODE="${CLAUDE_TOOL_EXIT_CODE:-0}"
INPUT_HASH=$(printf '%s' "${CLAUDE_TOOL_INPUT:-}" | shasum -a 256 | awk '{print $1}')

CEF="CEF:0|Wire|SecOps-Agents|1.0|toolcall|Claude Code tool call|3|src=$HOSTNAME suser=$USER cs1Label=Tool cs1=$TOOL cs2Label=Agent cs2=$AGENT cs3Label=Session cs3=$SESSION cs4Label=InputHash cs4=$INPUT_HASH cn1Label=ExitCode cn1=$EXIT_CODE"

# Envia via nc UDP — fail-soft (não bloqueia operação)
if command -v nc > /dev/null 2>&1; then
  echo "$CEF" | nc -u -w 1 "$WAZUH_HOST" "$WAZUH_PORT" 2>/dev/null || true
fi

# Também persiste localmente como fallback (best-effort)
LOG_DIR="${WIRE_LOG_DIR:-$HOME/.wire/log}"
if mkdir -p "$LOG_DIR" 2>/dev/null; then
  echo "$(date -u +%FT%TZ) $CEF" >> "$LOG_DIR/cef.log" 2>/dev/null || true
fi

exit 0

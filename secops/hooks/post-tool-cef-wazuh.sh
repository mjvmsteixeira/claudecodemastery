#!/usr/bin/env bash
# Wiremaze SecOps · post-tool · Envia evento CEF para o Wazuh com a tool call executada.
# Configurável via env: WAZUH_HOST, WAZUH_PORT (default 514/udp).
set -euo pipefail

WAZUH_HOST="${WAZUH_HOST:-wazuh-manager.wiremaze.internal}"
WAZUH_PORT="${WAZUH_PORT:-514}"
TOOL="${CLAUDE_TOOL_NAME:-unknown}"
SESSION="${CLAUDE_SESSION_ID:-unknown}"
AGENT="${CLAUDE_AGENT_NAME:-unknown}"
USER="${USER:-unknown}"
EXIT_CODE="${CLAUDE_TOOL_EXIT_CODE:-0}"
INPUT_HASH=$(echo -n "${CLAUDE_TOOL_INPUT:-}" | sha256sum | awk '{print $1}')

CEF="CEF:0|Wiremaze|SecOps-Agents|1.0|toolcall|Claude Code tool call|3|src=$HOSTNAME suser=$USER cs1Label=Tool cs1=$TOOL cs2Label=Agent cs2=$AGENT cs3Label=Session cs3=$SESSION cs4Label=InputHash cs4=$INPUT_HASH cn1Label=ExitCode cn1=$EXIT_CODE"

# Envia via nc UDP — fail-soft (não bloqueia operação)
if command -v nc > /dev/null 2>&1; then
  echo "$CEF" | nc -u -w 1 "$WAZUH_HOST" "$WAZUH_PORT" 2>/dev/null || true
fi

# Também persiste localmente como fallback
echo "$(date -Iseconds) $CEF" >> /var/log/wiremaze-secops-cef.log 2>/dev/null || true

exit 0

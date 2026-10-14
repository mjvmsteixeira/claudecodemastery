#!/usr/bin/env bash
# prumo · eval · post-tool-cef-wazuh.sh sai cedo quando o prumo-guard já regista esta sessão.
set -uo pipefail
EVAL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$EVAL_DIR/../.." && pwd)"
S="$(mktemp -d "${TMPDIR:-/tmp}/prumo-cef.XXXXXX")"
trap 'rm -r "$S"' EXIT
mkdir -p "$S/.prumo/run" "$S/.prumo/log" "$S/.claude/plugins/cache"
HOOK="$REPO_ROOT/secops/hooks/post-tool-cef-wazuh.sh"
EV='{"session_id":"sess-1","tool_name":"Bash","tool_input":{"command":"ls"}}'
FAILS=0

printf '%s' "$EV" | HOME="$S" PRUMO_LOG_DIR="$S/.prumo/log" bash "$HOOK" >/dev/null 2>&1
[ -s "$S/.prumo/log/cef.log" ] && echo "  ✓ sem marker escreve" || { echo "  ✗ sem marker não escreveu"; FAILS=$((FAILS+1)); }

: > "$S/.prumo/log/cef.log"
touch "$S/.prumo/run/cef-mod.sess-1"
printf '%s' "$EV" | HOME="$S" PRUMO_LOG_DIR="$S/.prumo/log" bash "$HOOK" >/dev/null 2>&1
[ -s "$S/.prumo/log/cef.log" ] && { echo "  ✗ com marker escreveu (duplicado)"; FAILS=$((FAILS+1)); } || echo "  ✓ com marker sai cedo"

[ "$FAILS" -eq 0 ] || exit 1
echo "✓ cef-marker-test passou"

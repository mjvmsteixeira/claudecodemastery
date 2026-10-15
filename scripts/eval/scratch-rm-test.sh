#!/usr/bin/env bash
# prumo · eval · isenção do scratchpad no approval-gate com ficheiros reais:
# symlinks dentro do scratchpad (o rm segue-os nos componentes intermédios e no
# final com barra). O resto dos casos vive no corpus (ap-18…ap-28).
# Hermético: HOME num sandbox; os fixtures ficam em /tmp/claude-<uid>/.
set -uo pipefail
EVAL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$EVAL_DIR/../.." && pwd)"
GATE="$REPO_ROOT/secops/hooks/pre-tool-approval-gate.sh"
SANDBOX="$(mktemp -d "${PRUMO_EVAL_ROOT:-$HOME}/.prumo-scratch-rm.XXXXXX")"
mkdir -p "/tmp/claude-$(id -u)"
FIX="$(mktemp -d "/tmp/claude-$(id -u)/prumo-scratch-rm.XXXXXX")"
trap 'rm -r "$SANDBOX" "$FIX"' EXIT
mkdir -p "$SANDBOX/.claude/plugins/cache" "$FIX/d"
ln -s "$SANDBOX" "$FIX/h"
FAILS=0

expect() { # expect <nome> <código esperado> <comando>
  local name="$1" want="$2" cmd="$3" got
  jq -cn --arg c "$cmd" '{tool_name:"Bash",tool_input:{command:$c}}' \
    | HOME="$SANDBOX" env -u PRUMO_OPERATING_MODE -u PRUMO_APPROVE -u PRUMO_HOME bash "$GATE" >/dev/null 2>&1
  got=$?
  if [ "$got" = "$want" ]; then echo "  ✓ $name"; else echo "  ✗ $name (esperado $want, obtido $got)"; FAILS=$((FAILS+1)); fi
}

echo "approval-gate · scratchpad"
expect "directório real com barra no fim" 0 "rm -rf $FIX/d/"
expect "symlink no fim, sem barra (apaga o link)" 0 "rm -f $FIX/h"
expect "symlink no fim, com barra (apaga o destino)" 2 "rm -rf $FIX/h/"
expect "symlink num componente intermédio" 2 "rm -rf $FIX/h/sub"
expect "glob num componente intermédio" 2 "rm -rf $FIX/*/sub"
expect "atribuição com S=… e \$S" 0 "S=$FIX; rm -rf \$S/d"
expect "atribuição com S=… e \$S a passar por symlink" 2 "S=$FIX; rm -rf \$S/h/x"

[ "$FAILS" -eq 0 ] || { echo "✗ $FAILS falha(s)"; exit 1; }
echo "✓ scratch-rm-test passou"

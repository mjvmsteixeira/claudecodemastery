#!/usr/bin/env bash
# prumo · eval · casos de caminho que o corpus não exprime: symlinks, espaços,
# stdin vazio. Hermético: HOME num sandbox.
set -uo pipefail
EVAL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$EVAL_DIR/../.." && pwd)"
SANDBOX="$(mktemp -d "${TMPDIR:-/tmp}/prumo-paths.XXXXXX")"
trap 'rm -r "$SANDBOX"' EXIT
FAILS=0

expect() { # expect <nome> <código esperado> <hook> <json>
  local name="$1" want="$2" hook="$3" json="$4" got
  printf '%s' "$json" | HOME="$SANDBOX" env -u PRUMO_OPERATING_MODE -u PRUMO_HOME bash "$hook" >/dev/null 2>&1
  got=$?
  if [ "$got" = "$want" ]; then echo "  ✓ $name"; else echo "  ✗ $name (esperado $want, obtido $got)"; FAILS=$((FAILS+1)); fi
}

SG="$REPO_ROOT/base/hooks/pre-tool-self-guard.sh"
mkdir -p "$SANDBOX/.prumo" "$SANDBOX/proj"
ln -s "$SANDBOX/.prumo" "$SANDBOX/link"

echo "self-guard"
expect "Write via symlink para ~/.prumo/mode" 2 "$SG" \
  "{\"tool_name\":\"Write\",\"tool_input\":{\"file_path\":\"$SANDBOX/link/mode\",\"content\":\"lab\"},\"cwd\":\"$SANDBOX/proj\"}"
expect "Write com .. até ~/.prumo/mode" 2 "$SG" \
  "{\"tool_name\":\"Write\",\"tool_input\":{\"file_path\":\"$SANDBOX/proj/../.prumo/mode\",\"content\":\"lab\"},\"cwd\":\"$SANDBOX/proj\"}"
expect "stdin vazio" 0 "$SG" ""
expect "JSON sem tool_input" 0 "$SG" '{"tool_name":"Bash"}'

[ "$FAILS" -eq 0 ] || { echo "✗ $FAILS falha(s)"; exit 1; }
echo "✓ guard-paths-test passou"

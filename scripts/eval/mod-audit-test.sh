#!/usr/bin/env bash
# prumo · eval · mod-audit.sh distingue mods de plugins clássicos e conta gating hooks.
set -uo pipefail
EVAL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$EVAL_DIR/../.." && pwd)"
command -v claude >/dev/null 2>&1 || { echo "CLI claude ausente — saltado"; exit 0; }
S="$(mktemp -d "${TMPDIR:-/tmp}/prumo-modaudit.XXXXXX")"
trap 'rm -r "$S"' EXIT
mkdir -p "$S/mod/.claude-plugin" "$S/mod/hooks" "$S/classic/.claude-plugin" "$S/classic/hooks"
echo '{"name":"m1","version":"0.0.1","description":"x","author":{"name":"t"}}' > "$S/mod/.claude-plugin/plugin.json"
echo '{"modules":["./register.ts"]}' > "$S/mod/hooks/hooks.json"
cat > "$S/mod/hooks/register.ts" <<'EOF'
import type { Register } from 'claude-code'
export const register: Register = on => {
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    await $.process.run(['true'])
    return next(e)
  })
}
EOF
echo '{"name":"c1","version":"0.0.1","description":"x","author":{"name":"t"}}' > "$S/classic/.claude-plugin/plugin.json"
echo '{"hooks":{}}' > "$S/classic/hooks/hooks.json"

OUT=$(bash "$REPO_ROOT/secops/lib/mod-audit.sh" "$S/mod" "$S/classic")
FAILS=0
echo "$OUT" | grep -q $'^m1\t1\t0\t\$\.process\.run' && echo "  ✓ mod com gating sem catch e chamada sensível" || { echo "  ✗ linha do mod: $OUT"; FAILS=$((FAILS+1)); }
echo "$OUT" | grep -q '^c1' && { echo "  ✗ plugin clássico listado"; FAILS=$((FAILS+1)); } || echo "  ✓ plugin clássico fora"
[ "$FAILS" -eq 0 ] || exit 1
echo "✓ mod-audit-test passou"

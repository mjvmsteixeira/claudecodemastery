#!/usr/bin/env bash
# prumo · eval · canal de aprovação por ficheiro do approval-gate.
# Hermético: HOME num sandbox com a lib do prumo-base do repo.
set -uo pipefail
EVAL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$EVAL_DIR/../.." && pwd)"
GATE="$REPO_ROOT/secops/hooks/pre-tool-approval-gate.sh"
SANDBOX="$(mktemp -d "${TMPDIR:-/tmp}/prumo-approval.XXXXXX")"
trap 'rm -r "$SANDBOX"' EXIT
VER="$(jq -r '.version' "$REPO_ROOT/base/.claude-plugin/plugin.json")"
DEST="$SANDBOX/.claude/plugins/cache/prumo/prumo-base/$VER"
mkdir -p "$DEST" "$SANDBOX/.prumo/approvals"
cp -R "$REPO_ROOT/base/lib" "$REPO_ROOT/base/.claude-plugin" "$DEST/"

CMD='git push --force origin feature'
if command -v shasum >/dev/null 2>&1; then ID=$(printf '%s' "$CMD" | shasum -a 256 | awk '{print $1}')
else ID=$(printf '%s' "$CMD" | sha256sum | awk '{print $1}'); fi
AF="$SANDBOX/.prumo/approvals/$ID"
PAYLOAD=$(jq -cn --arg c "$CMD" '{tool_name:"Bash",tool_input:{command:$c}}')
FAILS=0

run_gate() { printf '%s' "$PAYLOAD" | HOME="$SANDBOX" env -u PRUMO_APPROVE -u PRUMO_OPERATING_MODE -u PRUMO_HOME bash "$GATE" 2>"$SANDBOX/err"; }
check() { if [ "$1" = "$2" ]; then echo "  ✓ $3"; else echo "  ✗ $3 (esperado $1, obtido $2)"; FAILS=$((FAILS+1)); fi; }

run_gate; check 2 $? "sem aprovação bloqueia"
grep -q "approval-id: $ID" "$SANDBOX/err"; check 0 $? "mensagem traz o approval-id certo"

printf 'level=N1\nexpires=%s\nscope=once\n' "$(( $(date +%s) + 300 ))" > "$AF"
run_gate; check 0 $? "once: passa"
[ -e "$AF" ]; check 1 $? "once: ficheiro consumido"
run_gate; check 2 $? "once: segunda vez bloqueia"

printf 'level=N1\nexpires=%s\nscope=ttl\n' "$(( $(date +%s) + 300 ))" > "$AF"
run_gate; check 0 $? "ttl: passa"
run_gate; check 0 $? "ttl: passa outra vez"
[ -e "$AF" ]; check 0 $? "ttl: ficheiro mantém-se"

printf 'level=N1\nexpires=%s\nscope=ttl\n' "$(( $(date +%s) - 1 ))" > "$AF"
run_gate; check 2 $? "expirado bloqueia"
[ -e "$AF" ]; check 1 $? "expirado é apagado"

printf 'level=N3\nexpires=%s\nscope=once\n' "$(( $(date +%s) + 300 ))" > "$AF"
run_gate; check 2 $? "nível diferente bloqueia"

# O prumo-guard nunca escreve mais de 10 minutos: um expires além disso é forjado.
printf 'level=N1\nexpires=99999999999\nscope=ttl\n' > "$AF"
run_gate; check 2 $? "expires sem tecto (forjado) bloqueia"
[ -e "$AF" ]; check 1 $? "expires sem tecto é apagado"

printf 'level=N1\nexpires=%s\nscope=ttl\n' "$(( $(date +%s) + 3600 ))" > "$AF"
run_gate; check 2 $? "expires a 1 hora bloqueia"

printf 'level=N1\nexpires=%s\nscope=ttl\n' "$(( $(date +%s) + 600 ))" > "$AF"
run_gate; check 0 $? "expires a 10 minutos (o máximo do prumo-guard) passa"

grep -q 'via=approval-file' "$SANDBOX/.prumo/log/approvals.log" 2>/dev/null; check 0 $? "approvals.log regista via=approval-file"

[ "$FAILS" -eq 0 ] || { echo "✗ $FAILS falha(s)"; exit 1; }
echo "✓ approval-file-test passou"

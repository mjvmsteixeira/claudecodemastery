#!/usr/bin/env bash
# prumo-devkit · audit feedback · aceitar falso-positivo + auto-promover a rules/audit
# Marca o fp como accepted no store (suprime dali em diante) e acrescenta a excepção
# documentada ao rules-file (idempotente por fp).
#
# Uso: audit-accept.sh [--state-dir <dir>] [--rules-file <path>] <fp> "<razão>"
set -euo pipefail

STATE_DIR=".prumo-audit"; RULES_FILE="rules/audit/security.md"
POS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --state-dir)  STATE_DIR="${2:-.prumo-audit}"; shift 2 ;;
    --rules-file) RULES_FILE="${2:-rules/audit/security.md}"; shift 2 ;;
    -*)           echo "arg desconhecido: $1" >&2; exit 1 ;;
    *)            POS+=("$1"); shift ;;
  esac
done
FP="${POS[0]:-}"; REASON="${POS[1]:-aceite como falso-positivo}"
[ -n "$FP" ] || { echo "uso: audit-accept.sh <fp> \"<razão>\"" >&2; exit 1; }
command -v jq >/dev/null 2>&1 || { echo "jq necessário" >&2; exit 1; }

STORE="$STATE_DIR/state.json"
[ -f "$STORE" ] || { echo "store não existe: $STORE" >&2; exit 1; }
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)

entry=$(jq -c --arg fp "$FP" '.findings[$fp] // empty' "$STORE")
[ -n "$entry" ] || { echo "fp desconhecido no store: $FP" >&2; exit 1; }

# marca accepted
tmp=$(mktemp)
jq --arg fp "$FP" --arg r "$REASON" --arg now "$NOW" \
  '.findings[$fp].status="accepted" | .findings[$fp].accepted_reason=$r | .findings[$fp].accepted_at=$now' \
  "$STORE" > "$tmp" && mv "$tmp" "$STORE"

# auto-promove ao rules-file (idempotente por fp)
file=$(printf '%s' "$entry" | jq -r '.file')
rule=$(printf '%s' "$entry" | jq -r '.rule')
LINE="- \`${FP}\` · \`${file}\` · ${rule} — ${REASON} (aceite ${NOW%%T*})"
if [ -f "$RULES_FILE" ] && grep -qF "$FP" "$RULES_FILE"; then
  echo "já promovido (fp $FP em $RULES_FILE) — idempotente." >&2
  exit 0
fi
mkdir -p "$(dirname "$RULES_FILE")" 2>/dev/null || true
RULES_EXISTS=0
[ -f "$RULES_FILE" ] && RULES_EXISTS=1
if [ "$RULES_EXISTS" = 1 ] && grep -qE '^## Excepções autorizadas \(auto\)' "$RULES_FILE"; then
  printf '%s\n' "$LINE" >> "$RULES_FILE"
else
  { [ "$RULES_EXISTS" = 1 ] && printf '\n'
    printf '## Excepções autorizadas (auto)\n\n'
    printf 'Gerado por audit-accept (prumo-devkit) — cada linha é um finding aceite como falso-positivo.\n\n'
    printf '%s\n' "$LINE"
  } >> "$RULES_FILE"
fi
echo "aceite $FP · promovido para $RULES_FILE" >&2

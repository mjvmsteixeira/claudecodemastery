#!/usr/bin/env bash
# prumo-secops · mod-audit — resume o que cada mod (plugin de function hooks)
# pode fazer, a partir do `claude plugin validate --json`: gating hooks com e
# sem .catch (sem .catch, um guard que falha deixa passar), chamadas a $ que
# tocam em ficheiros, processos ou rede, e streams de telemetria.
set -uo pipefail
command -v claude >/dev/null 2>&1 || { echo "mod-audit: CLI claude ausente" >&2; exit 1; }
command -v jq >/dev/null 2>&1 || { echo "mod-audit: jq ausente" >&2; exit 1; }

if [ "$#" -gt 0 ]; then
  DIRS=("$@")
else
  DIRS=()
  for d in "$HOME"/.claude/plugins/cache/*/*/*/ "$HOME"/.claude/dev-mods/*/*/; do
    [ -d "$d" ] && DIRS+=("${d%/}")
  done
fi

printf 'plugin\tgating_sem_catch\tgating_com_catch\tchamadas_sensiveis\ttelemetria\n'
for d in "${DIRS[@]}"; do
  hj="$d/hooks/hooks.json"
  [ -r "$hj" ] || continue
  jq -e '.modules | length > 0' "$hj" >/dev/null 2>&1 || continue
  name=$(jq -r '.name // empty' "$d/.claude-plugin/plugin.json" 2>/dev/null)
  [ -n "$name" ] || name=$(basename "$d")
  rep=$(claude plugin validate --json "$d" 2>/dev/null) || true
  [ -n "$rep" ] || { printf '%s\t?\t?\tvalidate falhou\t?\n' "$name"; continue; }
  printf '%s' "$rep" | jq -r --arg n "$name" '
    [.contents[]? | select(.type == "hooks")] as $h
    | ($h | map(.gatingHooks[]?) ) as $g
    | ($h | map(.notes[]?) ) as $notes
    | ($notes | map(select(test(" calls: ")) | sub("^.* calls: "; "") | split(", ")[]) | unique
       | map(select(test("^\\$\\.(fs|process|http|network|mcp|env|settings|config)\\."))) | join(",")) as $calls
    | ($notes | map(select(test("telemetry|stands on"))) | join("; ")) as $tel
    | [$n, ($g | map(select(.hasCatch | not)) | length), ($g | map(select(.hasCatch)) | length),
       (if $calls == "" then "-" else $calls end), (if $tel == "" then "-" else $tel end)] | @tsv'
done

#!/usr/bin/env bash
# prumo-base · PreToolUse · workspace
#
# Write/Edit/MultiEdit/NotebookEdit só dentro das raízes de trabalho: o cwd da
# sessão e a sua raiz git, os temporários, a memória, os planos e os dev-mods
# do Claude Code, a configuração do Claude Code (settings, CLAUDE.md, rules,
# skills, agents, commands) e as raízes extra de ~/.prumo/guard.json →
# workspace.extraRoots. Caminhos resolvidos (symlinks e ..) antes de comparar.
# Respeita o modo: prod bloqueia, dev avisa, lab passa.
set -uo pipefail

HELPER="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}/lib/prumo-common.sh"
if [ -r "$HELPER" ]; then
  # shellcheck disable=SC1090
  source "$HELPER"
  prumo_telemetry_init "prumo-base" "workspace"
else
  prumo_is_dev() { [ "${PRUMO_OPERATING_MODE:-prod}" = "dev" ]; }
  prumo_fail_or_warn() {
    if prumo_is_dev; then echo "[$1/$2] (dev mode) $3" >&2; else echo "[$1/$2] $3" >&2; exit 2; fi
  }
  prumo_real_path() { printf '%s' "$1"; }
fi

INPUT=$(cat)
[ -n "$INPUT" ] || exit 0
command -v jq >/dev/null 2>&1 || exit 0

FP=$(jq -r '.tool_input.file_path // .tool_input.notebook_path // empty' <<<"$INPUT" 2>/dev/null)
[ -n "$FP" ] || exit 0
CWD=$(jq -r '.cwd // empty' <<<"$INPUT" 2>/dev/null)
[ -n "$CWD" ] || CWD="$PWD"

TARGET=$(prumo_real_path "$FP" "$CWD")

ROOTS=("$CWD")
GIT_TOP=$(git -C "$CWD" rev-parse --show-toplevel 2>/dev/null) && ROOTS+=("$GIT_TOP")
ROOTS+=("${TMPDIR:-/tmp}" "/tmp" "/private/tmp"
        "$HOME/.claude/dev-mods" "$HOME/.claude/plans" "$HOME/.claude/rules"
        "$HOME/.claude/skills" "$HOME/.claude/agents" "$HOME/.claude/commands")
GUARD_JSON="${PRUMO_HOME:-$HOME/.prumo}/guard.json"
if [ -r "$GUARD_JSON" ]; then
  while IFS= read -r r; do
    [ -n "$r" ] && ROOTS+=("${r/#\~/$HOME}")
  done < <(jq -r '.workspace.extraRoots[]? // empty' "$GUARD_JSON" 2>/dev/null)
fi

for r in "${ROOTS[@]}"; do
  rr=$(prumo_real_path "$r")
  [ -n "$rr" ] || continue
  case "$TARGET" in "$rr"|"$rr"/*) exit 0 ;; esac
done

CLAUDE_DIR=$(prumo_real_path "$HOME/.claude")
case "$TARGET" in
  "$CLAUDE_DIR"/projects/*/memory/*) exit 0 ;;
  "$CLAUDE_DIR"/settings.json|"$CLAUDE_DIR"/settings.local.json|"$CLAUDE_DIR"/CLAUDE.md|"$CLAUDE_DIR"/keybindings.json) exit 0 ;;
esac

prumo_fail_or_warn "prumo-base" "workspace" \
"Escrita fora das raízes de trabalho: $TARGET
Raízes: o projeto ($CWD), temporários e a configuração do Claude Code.
Para acrescentar uma raiz (ação humana): ~/.prumo/guard.json → workspace.extraRoots."
exit 0

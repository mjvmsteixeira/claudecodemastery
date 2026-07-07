#!/usr/bin/env bash
# prumo-craft · smoke.sh — sanity check read-only do plugin.
# Sai 0 se OK · 1 se críticas · 2 se warns (degradação aceitável).
set -u

PASSED=0
FAILED=0
WARNED=0

ok()   { echo "  ✓ $*"; PASSED=$((PASSED+1)); }
fail() { echo "  ✗ $*"; FAILED=$((FAILED+1)); }

echo "── prumo-craft smoke ──"

# 1. plugin.json válido — cache (post-install) com fallback source tree (dev/CI)
manifest=$(find ~/.claude/plugins/cache -path "*/prumo-craft/*/.claude-plugin/plugin.json" -print -quit 2>/dev/null)
if [ -z "$manifest" ]; then
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
  [ -f "$script_dir/.claude-plugin/plugin.json" ] && manifest="$script_dir/.claude-plugin/plugin.json"
fi
if [ -n "$manifest" ] && jq empty "$manifest" 2>/dev/null; then
  ok "plugin.json válido em $(dirname "$(dirname "$manifest")")"
else
  fail "plugin.json não encontrado / inválido"
  echo "  passed=$PASSED  failed=$FAILED  warned=$WARNED"; exit 1
fi
plugin_root="$(dirname "$(dirname "$manifest")")"

# 2. skill html-plan presente com frontmatter válido
skill_md="$plugin_root/skills/html-plan/SKILL.md"
if [ -f "$skill_md" ]; then
  if head -n 5 "$skill_md" | grep -qE '^name: html-plan'; then
    ok "skills/html-plan/SKILL.md presente com name: html-plan"
  else
    fail "SKILL.md sem 'name: html-plan' no frontmatter"
  fi
else
  fail "skills/html-plan/SKILL.md ausente"
fi

# 3. references presentes
for ref in principles.md surfaces.md; do
  rf="$plugin_root/skills/html-plan/references/$ref"
  if [ -f "$rf" ] && [ -s "$rf" ]; then
    ok "references/$ref presente e não-vazio"
  else
    fail "references/$ref ausente ou vazio"
  fi
done

# 4. command /html-plan presente com frontmatter
cmd_md="$plugin_root/commands/html-plan.md"
if [ -f "$cmd_md" ]; then
  if head -n 10 "$cmd_md" | grep -qE '^allowed-tools:'; then
    ok "commands/html-plan.md presente com allowed-tools"
  else
    fail "commands/html-plan.md sem 'allowed-tools' no frontmatter"
  fi
else
  fail "commands/html-plan.md ausente"
fi

# Resumo
echo
echo "  passed=$PASSED  failed=$FAILED  warned=$WARNED"

[ $FAILED -gt 0 ] && exit 1
[ $WARNED -gt 0 ] && exit 2
exit 0

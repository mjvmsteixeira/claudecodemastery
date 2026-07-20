#!/usr/bin/env bash
# prumo-design · smoke.sh — sanity check read-only do plugin.
# Sai 0 se OK · 1 se críticas · 2 se warns (degradação aceitável).
set -u

PASSED=0
FAILED=0
WARNED=0

ok()   { echo "  ✓ $*"; PASSED=$((PASSED+1)); }
fail() { echo "  ✗ $*"; FAILED=$((FAILED+1)); }

echo "── prumo-design smoke ──"

# 1. plugin.json válido — cache (post-install) com fallback source tree (dev/CI)
# sort -V | tail -1, nunca -print -quit: o cache guarda TODAS as versões instaladas
# e o -quit devolve a primeira que a travessia encontrar, não a mais recente.
# Com 5 versões em cache, o smoke chegou a validar a 0.5.2 com a 0.6.4 instalada.
manifest=$(find ~/.claude/plugins/cache -path "*/prumo-design/*/.claude-plugin/plugin.json" 2>/dev/null | sort -V | tail -1)
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

# 1b. name é prumo-design
if jq -e -r '.name' "$manifest" 2>/dev/null | grep -qx 'prumo-design'; then
  ok "plugin.json name: prumo-design"
else
  fail "plugin.json name != prumo-design"
fi

# 2. skill product-design presente com frontmatter válido
skill_md="$plugin_root/skills/product-design/SKILL.md"
if [ -f "$skill_md" ]; then
  if head -n 5 "$skill_md" | grep -qE '^name: product-design'; then
    ok "skills/product-design/SKILL.md presente com name: product-design"
  else
    fail "SKILL.md sem 'name: product-design' no frontmatter"
  fi
else
  fail "skills/product-design/SKILL.md ausente"
fi

# 3. references presentes e não-vazios
for ref in routing.md native-handoffs.md quality-floor.md; do
  rf="$plugin_root/skills/product-design/references/$ref"
  if [ -f "$rf" ] && [ -s "$rf" ]; then
    ok "references/$ref presente e não-vazio"
  else
    fail "references/$ref ausente ou vazio"
  fi
done

# 4. command /product-design presente com frontmatter
cmd_md="$plugin_root/commands/product-design.md"
if [ -f "$cmd_md" ]; then
  if head -n 10 "$cmd_md" | grep -qE '^allowed-tools:'; then
    ok "commands/product-design.md presente com allowed-tools"
  else
    fail "commands/product-design.md sem 'allowed-tools' no frontmatter"
  fi
else
  fail "commands/product-design.md ausente"
fi

# Resumo
echo
echo "  passed=$PASSED  failed=$FAILED  warned=$WARNED"

[ $FAILED -gt 0 ] && exit 1
[ $WARNED -gt 0 ] && exit 2
exit 0

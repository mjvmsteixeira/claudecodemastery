#!/usr/bin/env bash
# wire-devkit · smoke.sh — sanity check read-only do plugin.
# Sai 0 se OK · 1 se críticas · 2 se warns (degradação aceitável).
set -u

PASSED=0
FAILED=0
WARNED=0

ok()   { echo "  ✓ $*"; PASSED=$((PASSED+1)); }
fail() { echo "  ✗ $*"; FAILED=$((FAILED+1)); }
warn() { echo "  ! $*"; WARNED=$((WARNED+1)); }

echo "── wire-devkit smoke ──"

# 1. plugin.json válido — cache (post-install) com fallback source tree (dev/CI)
manifest=$(find ~/.claude/plugins/cache -path "*/wire-devkit/*/.claude-plugin/plugin.json" -print -quit 2>/dev/null)
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

# 2. shared/ presente (scoring, ci-mode, report-format) — referenciado por todas as skills
for f in scoring.md ci-mode.md report-format.md; do
  if [ -f "$plugin_root/shared/$f" ]; then
    ok "shared/$f"
  else
    fail "shared/$f ausente"
  fi
done

# 3. Skills esperadas presentes
for s in full-audit security-scan infra-audit ux-audit code-quality performance-audit local-reviewer ngrok-expose; do
  if [ -f "$plugin_root/skills/$s/SKILL.md" ]; then
    ok "skill $s"
  else
    fail "skill $s ausente"
  fi
done

# 4. Commands esperados presentes
for c in full-audit security-scan infra-audit ux-audit code-quality performance-audit ngrok-expose; do
  if [ -f "$plugin_root/commands/$c.md" ]; then
    ok "command /$c"
  else
    fail "command /$c ausente"
  fi
done

# 5. Agent local-reviewer
if [ -f "$plugin_root/agents/local-reviewer.md" ]; then
  ok "agent local-reviewer"
else
  fail "agent local-reviewer ausente"
fi

# 6. wire-base detectado (recommend para /ngrok-expose)?
if find ~/.claude/plugins/cache -path "*/wire-base/*/.claude-plugin/plugin.json" -print -quit 2>/dev/null | grep -q .; then
  ok "wire-base detectado (/ngrok-expose funcional)"
else
  warn "wire-base ausente — /ngrok-expose não vai conseguir ler Vault"
fi

# 7. Ollama (opcional · local-reviewer degrada se ausente)
if command -v ollama >/dev/null 2>&1; then
  if ollama list 2>/dev/null | grep -q qwen3-coder; then
    ok "ollama + qwen3-coder disponíveis (local-reviewer operacional)"
  else
    warn "ollama presente mas sem qwen3-coder — local-reviewer degrada para análise própria"
  fi
else
  warn "ollama não instalado — local-reviewer degrada para análise própria"
fi

# 8. ngrok (opcional · /ngrok-expose)
if command -v ngrok >/dev/null 2>&1; then
  ok "ngrok CLI instalado"
else
  warn "ngrok CLI ausente — /ngrok-expose não funcional"
fi

echo
echo "  passed=$PASSED  failed=$FAILED  warned=$WARNED"

[ $FAILED -gt 0 ] && exit 1
[ $WARNED -gt 0 ] && exit 2
exit 0

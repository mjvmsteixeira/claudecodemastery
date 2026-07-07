#!/usr/bin/env bash
# prumo-base · smoke.sh — sanity check read-only do plugin.
# Sai 0 se OK · 1 se críticas · 2 se warns (degradação aceitável).
set -u

PASSED=0
FAILED=0
WARNED=0

ok()   { echo "  ✓ $*"; PASSED=$((PASSED+1)); }
fail() { echo "  ✗ $*"; FAILED=$((FAILED+1)); }
warn() { echo "  ! $*"; WARNED=$((WARNED+1)); }

echo "── prumo-base smoke ──"

# 1. plugin.json válido — primeiro tenta cache (post-install), depois fallback à source tree (dev)
manifest=$(find ~/.claude/plugins/cache -path "*/prumo-base/*/.claude-plugin/plugin.json" -print -quit 2>/dev/null)
if [ -z "$manifest" ]; then
  # Fallback: smoke.sh corrido a partir da source tree (e.g. dev local, CI)
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
  [ -f "$script_dir/.claude-plugin/plugin.json" ] && manifest="$script_dir/.claude-plugin/plugin.json"
fi
if [ -n "$manifest" ] && jq empty "$manifest" 2>/dev/null; then
  ok "plugin.json válido em $(dirname "$(dirname "$manifest")")"
else
  fail "plugin.json não encontrado / inválido"
fi

# 2. lib/prumo-common.sh source sem erros e expõe prumo_mode
if [ -n "$manifest" ]; then
  plugin_root="$(dirname "$(dirname "$manifest")")"
  if [ -f "$plugin_root/lib/prumo-common.sh" ]; then
    if (set +u; source "$plugin_root/lib/prumo-common.sh" 2>/dev/null && declare -F prumo_mode >/dev/null); then
      mode=$(set +u; source "$plugin_root/lib/prumo-common.sh" 2>/dev/null && prumo_mode)
      ok "prumo-common.sh expõe prumo_mode (modo actual: $mode)"
    else
      fail "prumo-common.sh não expõe prumo_mode após source"
    fi
  else
    fail "lib/prumo-common.sh ausente"
  fi

  # 3. lib/vault-env.sh source sem erros e expõe V()
  if [ -f "$plugin_root/lib/vault-env.sh" ]; then
    if (set +u; source "$plugin_root/lib/vault-env.sh" 2>/dev/null && declare -F V >/dev/null); then
      ok "vault-env.sh expõe V()"
    else
      fail "vault-env.sh não expõe V() após source"
    fi
  else
    fail "lib/vault-env.sh ausente"
  fi
fi

# 4. ~/.prumo/mode existe? (opcional — só warn se ausente)
if [ -f ~/.prumo/mode ]; then
  ok "~/.prumo/mode existe (modo persistente configurado)"
else
  warn "~/.prumo/mode ausente — modo default 'prod' (corre /prumo-mode para configurar)"
fi

# 5. ~/vault/ existe? (opcional — só warn)
if [ -d ~/vault ]; then
  ok "~/vault/ existe (instalação Vault detectada)"
  if [ -f ~/vault/vault-init.json ]; then
    ok "vault-init.json presente"
  else
    warn "~/vault/vault-init.json ausente — auto-unseal não vai conseguir"
  fi
else
  warn "~/vault/ ausente — vault-toolkit em modo degradado"
fi

# 6. Comandos novos do plano 2026-05-19 (bootstrap + kv-migrate)
if [ -n "$manifest" ]; then
  for cmd in prumo-vault-bootstrap prumo-vault-kv-migrate prumo-style; do
    cmd_file="$plugin_root/commands/${cmd}.md"
    if [ -f "$cmd_file" ]; then
      # frontmatter parseia e tem allowed-tools: Bash
      if head -n 10 "$cmd_file" | grep -qE '^allowed-tools:.*Bash'; then
        ok "commands/${cmd}.md presente com allowed-tools: Bash"
      else
        fail "commands/${cmd}.md sem 'allowed-tools: Bash' no frontmatter"
      fi
    else
      fail "commands/${cmd}.md ausente"
    fi
  done
fi

# 7. Cobertura: TODOS os commands presentes por nome (apanha rename/remoção)
if [ -n "$manifest" ]; then
  for cmd in prumo-context-pack prumo-doctor prumo-mode prumo-onboard prumo-smoke \
             prumo-style prumo-telemetry prumo-upgrade prumo-vault-bootstrap \
             prumo-vault-kv-migrate prumo-vault-policy vault-audit vault-backup \
             vault-integrate vault-list vault-set; do
    if [ -f "$plugin_root/commands/${cmd}.md" ]; then
      ok "command /${cmd}"
    else
      fail "command /${cmd} ausente"
    fi
  done

  # 8. Cobertura: TODAS as skills presentes por nome
  for skill in claude-deep-audit mempalace-doctor prumo-context-pack prumo-doctor \
               prumo-mode prumo-onboard prumo-smoke prumo-style prumo-upgrade \
               prumo-vault-policy vault-toolkit; do
    if [ -f "$plugin_root/skills/${skill}/SKILL.md" ]; then
      ok "skill ${skill}"
    else
      fail "skill ${skill} ausente"
    fi
  done
fi

# Resumo
echo
echo "  passed=$PASSED  failed=$FAILED  warned=$WARNED"

[ $FAILED -gt 0 ] && exit 1
[ $WARNED -gt 0 ] && exit 2
exit 0

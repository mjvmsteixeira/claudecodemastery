#!/usr/bin/env bash
# wire-base · smoke.sh — sanity check read-only do plugin.
# Sai 0 se OK · 1 se críticas · 2 se warns (degradação aceitável).
set -u

PASSED=0
FAILED=0
WARNED=0

ok()   { echo "  ✓ $*"; PASSED=$((PASSED+1)); }
fail() { echo "  ✗ $*"; FAILED=$((FAILED+1)); }
warn() { echo "  ! $*"; WARNED=$((WARNED+1)); }

echo "── wire-base smoke ──"

# 1. plugin.json válido — primeiro tenta cache (post-install), depois fallback à source tree (dev)
manifest=$(find ~/.claude/plugins/cache -path "*/wire-base/*/.claude-plugin/plugin.json" -print -quit 2>/dev/null)
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

# 2. lib/wire-common.sh source sem erros e expõe wire_mode
if [ -n "$manifest" ]; then
  plugin_root="$(dirname "$(dirname "$manifest")")"
  if [ -f "$plugin_root/lib/wire-common.sh" ]; then
    if (set +u; source "$plugin_root/lib/wire-common.sh" 2>/dev/null && declare -F wire_mode >/dev/null); then
      mode=$(set +u; source "$plugin_root/lib/wire-common.sh" 2>/dev/null && wire_mode)
      ok "wire-common.sh expõe wire_mode (modo actual: $mode)"
    else
      fail "wire-common.sh não expõe wire_mode após source"
    fi
  else
    fail "lib/wire-common.sh ausente"
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

# 4. ~/.wire/mode existe? (opcional — só warn se ausente)
if [ -f ~/.wire/mode ]; then
  ok "~/.wire/mode existe (modo persistente configurado)"
else
  warn "~/.wire/mode ausente — modo default 'prod' (corre /wire-mode para configurar)"
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

# Resumo
echo
echo "  passed=$PASSED  failed=$FAILED  warned=$WARNED"

[ $FAILED -gt 0 ] && exit 1
[ $WARNED -gt 0 ] && exit 2
exit 0

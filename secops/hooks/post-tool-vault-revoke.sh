#!/usr/bin/env bash
# Wire SecOps · stop · Revoga explicitamente o token Vault no fim da sessão.
set -euo pipefail
# shellcheck source=_lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

if [ -n "${VAULT_TOKEN:-}" ]; then
  # Source VAULT_* env vars — find versão mais recente (sort -V) para evitar
  # glob lexicográfico que pega v0.10 antes de v0.2.
  VAULT_ENV=$(find "${HOME}/.claude/plugins/cache" \
    -path "*/wire-base/*/lib/vault-env.sh" -type f 2>/dev/null \
    | sort -V | tail -1)
  if [ -n "$VAULT_ENV" ]; then
    # shellcheck disable=SC1090
    source "$VAULT_ENV"
    V token revoke -self 2>/dev/null || true
  else
    command -v vault >/dev/null 2>&1 && vault token revoke -self 2>/dev/null || true
  fi

  # Linux-only shred de /dev/shm/k (macOS sem /dev/shm — silently skip)
  if [ -d /dev/shm ] && [ -f /dev/shm/k ]; then
    shred -u /dev/shm/k 2>/dev/null || rm -f /dev/shm/k 2>/dev/null || true
  fi
  echo "[hook] Token Vault revogado."
fi

exit 0

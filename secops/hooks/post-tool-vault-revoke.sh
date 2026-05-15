#!/usr/bin/env bash
# Wire SecOps · stop · Revoga explicitamente o token Vault no fim da sessão.
set -euo pipefail

if [ -n "${VAULT_TOKEN:-}" ]; then
  vault token revoke -self 2>/dev/null || true
  echo "[hook] Token Vault revogado."
fi

# Limpa quaisquer keys efémeras em tmpfs
shred -u /dev/shm/k /dev/shm/k-cert.pub 2>/dev/null || true

exit 0

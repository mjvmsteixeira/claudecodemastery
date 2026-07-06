#!/usr/bin/env bash
# Wire SecOps · stop · Revoga explicitamente o token Vault no fim da sessão.
set -euo pipefail
# shellcheck source=_lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

if [ -n "${VAULT_TOKEN:-}" ]; then
  # Source VAULT_* env vars — find versão mais recente (sort -V) para evitar
  # glob lexicográfico que pega v0.10 antes de v0.2.
  VAULT_ENV=$(find "${HOME}/.claude/plugins/cache" \
    -path "*/prumo-base/*/lib/vault-env.sh" -type f 2>/dev/null \
    | sort -V | tail -1)

  REVOKE_OK=0
  if [ -n "$VAULT_ENV" ]; then
    # Integridade: um ficheiro plantado em qualquer path que bata o padrão
    # find|source acima receberia o VAULT_TOKEN vivo sem verificação nenhuma.
    # Antes de o fazer source, confirma que é mesmo o prumo-base — plugin
    # root é dois níveis acima de lib/vault-env.sh — via .claude-plugin/plugin.json.
    VAULT_ENV_PLUGIN_ROOT=$(dirname "$(dirname "$VAULT_ENV")")
    VAULT_ENV_PLUGIN_JSON="$VAULT_ENV_PLUGIN_ROOT/.claude-plugin/plugin.json"
    VAULT_ENV_PLUGIN_NAME=""
    if [ -r "$VAULT_ENV_PLUGIN_JSON" ] && command -v jq >/dev/null 2>&1; then
      VAULT_ENV_PLUGIN_NAME=$(jq -r '.name // empty' "$VAULT_ENV_PLUGIN_JSON" 2>/dev/null)
    fi

    if [ "$VAULT_ENV_PLUGIN_NAME" = "prumo-base" ]; then
      # shellcheck disable=SC1090
      source "$VAULT_ENV"
      if V token revoke -self 2>/dev/null; then
        REVOKE_OK=1
      fi
    else
      echo "[hook] vault-revoke · vault-env.sh candidato falhou verificação de integridade (plugin.json name='${VAULT_ENV_PLUGIN_NAME:-<ausente>}', esperado 'prumo-base') — a ignorar, fallback para 'vault' CLI" >&2
      if command -v vault >/dev/null 2>&1 && vault token revoke -self 2>/dev/null; then
        REVOKE_OK=1
      fi
    fi
  else
    if command -v vault >/dev/null 2>&1 && vault token revoke -self 2>/dev/null; then
      REVOKE_OK=1
    fi
  fi

  # Linux-only shred de /dev/shm/k (macOS sem /dev/shm — silently skip)
  if [ -d /dev/shm ] && [ -f /dev/shm/k ]; then
    shred -u /dev/shm/k 2>/dev/null || rm -f /dev/shm/k 2>/dev/null || true
  fi

  if [ "$REVOKE_OK" -eq 1 ]; then
    echo "[hook] Token Vault revogado."
  else
    echo "[hook] vault-revoke · AVISO: revogação do token Vault falhou ou não pôde ser confirmada — o token pode continuar válido até expirar por TTL natural." >&2
  fi
fi

exit 0

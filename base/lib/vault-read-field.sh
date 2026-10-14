#!/usr/bin/env bash
# vault-read-field.sh — imprime um campo de um segredo KV e mais nada.
#
# Uso:  vault-read-field.sh <caminho-kv> <campo>
# Para o prumo-guard (run_with_secret): o valor vai para o ambiente do processo
# filho e nunca para o contexto do modelo. Prefere o token AppRole em cache
# (~/.prumo/token-cache, < 3000 s); sem ele, segue o vault-env.sh.
# Erros genéricos: nunca ecoa tokens nem valores parciais.
set -uo pipefail
P="${1:-}"; F="${2:-}"
[ -n "$P" ] && [ -n "$F" ] || { echo "uso: vault-read-field.sh <caminho-kv> <campo>" >&2; exit 1; }

CACHE="${PRUMO_HOME:-$HOME/.prumo}/token-cache"
if [ -z "${VAULT_TOKEN:-}" ] && [ -r "$CACHE" ]; then
  MTIME=$(stat -f%m "$CACHE" 2>/dev/null || stat -c%Y "$CACHE" 2>/dev/null || echo 0)
  if [ $(( $(date +%s) - MTIME )) -lt 3000 ]; then
    VAULT_TOKEN=$(cat "$CACHE"); export VAULT_TOKEN
  fi
fi

# shellcheck source=vault-env.sh
source "$(dirname "${BASH_SOURCE[0]}")/vault-env.sh" >/dev/null 2>&1

OUT=$(V kv get -field="$F" "$P" 2>/dev/null) || { echo "vault-read-field: leitura falhou ($P#$F)" >&2; exit 1; }
printf '%s' "$OUT"

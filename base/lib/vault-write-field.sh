#!/usr/bin/env bash
# vault-write-field.sh — grava um campo num segredo KV; o valor vem do stdin.
#
# Uso:  printf '%s' "$valor" | vault-write-field.sh <caminho-kv> <campo>
# Só serve a captura do prumo-guard: caminhos dentro de secret/inbox/.
# O valor nunca vai em argv; sem saída em sucesso; erros genéricos.
set -uo pipefail
P="${1:-}"; F="${2:-}"
[ -n "$P" ] && [ -n "$F" ] || { echo "uso: vault-write-field.sh <caminho-kv> <campo>" >&2; exit 1; }
[[ "$F" =~ ^[A-Za-z0-9_][A-Za-z0-9_.-]*$ ]] || { echo "vault-write-field: campo inválido" >&2; exit 1; }
[[ "$P" =~ ^secret/inbox/[A-Za-z0-9._/-]+$ ]] || { echo "vault-write-field: caminho fora de secret/inbox/ ou inválido" >&2; exit 1; }
case "/$P/" in */../*|*/./*|*//*) echo "vault-write-field: caminho inválido" >&2; exit 1 ;; esac

CACHE="${PRUMO_HOME:-$HOME/.prumo}/token-cache"
if [ -z "${VAULT_TOKEN:-}" ] && [ -r "$CACHE" ]; then
  MTIME=$(stat -f%m "$CACHE" 2>/dev/null || stat -c%Y "$CACHE" 2>/dev/null || echo 0)
  if [ $(( $(date +%s) - MTIME )) -lt 3000 ]; then
    VAULT_TOKEN=$(cat "$CACHE"); export VAULT_TOKEN
  fi
fi

# shellcheck source=vault-env.sh
source "$(dirname "${BASH_SOURCE[0]}")/vault-env.sh" >/dev/null 2>&1

if [ "${VAULT_MODE:-}" = "native" ]; then
  vault kv put -cas=0 "$P" "$F=-" >/dev/null 2>&1
else
  # A função V ocupa o stdin com o token; aqui token e valor seguem juntos.
  { printf '%s\n' "${VAULT_TOKEN:-}"; cat; } | docker exec -i \
    -e VAULT_ADDR="$VAULT_ADDR" \
    -e VAULT_CACERT="$VAULT_CACERT_IN_CONTAINER" \
    "$VAULT_CONTAINER" sh -c 'IFS= read -r t; VAULT_TOKEN="$t" exec vault kv put -cas=0 "$1" "$2=-"' sh "$P" "$F" >/dev/null 2>&1
fi || { echo "vault-write-field: gravação falhou ($P#$F)" >&2; exit 1; }

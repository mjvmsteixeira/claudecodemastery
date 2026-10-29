#!/usr/bin/env bash
# vault-write-field.sh — grava um campo num segredo KV; o valor vem do stdin.
#
# Uso:  printf '%s' "$valor" | vault-write-field.sh <caminho-kv> <campo>
# Só serve a captura do prumo-guard: caminhos dentro de secret/inbox/.
# O valor nunca vai em argv; sem saída em sucesso; erros genéricos.
#
# Identidade: login AppRole próprio como `agent-claude` (policy prumo-inbox: só
# `create` em secret/data/inbox/*), com as credenciais de
# ${PRUMO_VAULT_CREDS:-$HOME/vault/approle-credentials.json}. Nunca usa o token
# raiz do vault-init.json nem um VAULT_TOKEN herdado. Sem credenciais ou com o
# login a falhar -> exit 1. Token em cache em $PRUMO_HOME/inbox-token-cache
# (0600, TTL 600 s), separado do token-cache dos outros hooks.
set -uo pipefail
P="${1:-}"; F="${2:-}"
[ -n "$P" ] && [ -n "$F" ] || { echo "uso: vault-write-field.sh <caminho-kv> <campo>" >&2; exit 1; }
[[ "$F" =~ ^[A-Za-z0-9_][A-Za-z0-9_.-]*$ ]] || { echo "vault-write-field: campo inválido" >&2; exit 1; }
[[ "$P" =~ ^secret/inbox/[A-Za-z0-9._/-]+$ ]] || { echo "vault-write-field: caminho fora de secret/inbox/ ou inválido" >&2; exit 1; }
case "/$P/" in */../*|*/./*|*//*) echo "vault-write-field: caminho inválido" >&2; exit 1 ;; esac

PRUMO_DIR="${PRUMO_HOME:-$HOME/.prumo}"
CACHE="$PRUMO_DIR/inbox-token-cache"
CREDS="${PRUMO_VAULT_CREDS:-$HOME/vault/approle-credentials.json}"
TTL=600
fail() { echo "vault-write-field: $1" >&2; exit 1; }

# Nunca o token raiz nem um token herdado: o vault-env.sh só lê o vault-init.json se este for um ficheiro.
unset VAULT_TOKEN
export VAULT_INIT=/dev/null
# shellcheck source=vault-env.sh
source "$(dirname "${BASH_SOURCE[0]}")/vault-env.sh" >/dev/null 2>&1
unset VAULT_TOKEN
command -v jq >/dev/null 2>&1 || fail "jq em falta"

TOK=""
if [ -r "$CACHE" ]; then
  MTIME=$(stat -f%m "$CACHE" 2>/dev/null || stat -c%Y "$CACHE" 2>/dev/null || echo 0)
  [ $(( $(date +%s) - MTIME )) -lt "$TTL" ] && TOK=$(cat "$CACHE" 2>/dev/null)
fi

if [ -z "$TOK" ]; then
  [ -r "$CREDS" ] || fail "sem credenciais agent-claude"
  # role_id e secret_id seguem por stdin (JSON), nunca em argv.
  BODY=$(jq -c '.["agent-claude"] | select(.role_id and .secret_id) | {role_id, secret_id}' "$CREDS" 2>/dev/null)
  [ -n "$BODY" ] || fail "sem credenciais agent-claude"
  if [ "$VAULT_MODE" = "native" ]; then
    RESP=$(printf '%s' "$BODY" | VAULT_TOKEN="" vault write -format=json auth/approle/login - 2>/dev/null)
  else
    RESP=$(printf '%s' "$BODY" | docker exec -i \
      -e VAULT_ADDR="$VAULT_ADDR" \
      -e VAULT_CACERT="$VAULT_CACERT_IN_CONTAINER" \
      "$VAULT_CONTAINER" vault write -format=json auth/approle/login - 2>/dev/null)
  fi
  BODY=""
  TOK=$(printf '%s' "$RESP" | jq -r '.auth.client_token // empty' 2>/dev/null)
  RESP=""
  [ -n "$TOK" ] || fail "login AppRole falhou"
  mkdir -p "$PRUMO_DIR" 2>/dev/null
  ( umask 077; printf '%s' "$TOK" > "$CACHE.$$" && mv -f "$CACHE.$$" "$CACHE" ) 2>/dev/null || rm -f "$CACHE.$$" 2>/dev/null
fi

if [ "$VAULT_MODE" = "native" ]; then
  VAULT_TOKEN="$TOK" vault kv put -cas=0 "$P" "$F=-" >/dev/null 2>&1
else
  # O stdin leva o token e o valor, nunca argv.
  { printf '%s\n' "$TOK"; cat; } | docker exec -i \
    -e VAULT_ADDR="$VAULT_ADDR" \
    -e VAULT_CACERT="$VAULT_CACERT_IN_CONTAINER" \
    "$VAULT_CONTAINER" sh -c 'IFS= read -r t; VAULT_TOKEN="$t" exec vault kv put -cas=0 "$1" "$2=-"' sh "$P" "$F" >/dev/null 2>&1
fi || { echo "vault-write-field: gravação falhou ($P#$F)" >&2; exit 1; }

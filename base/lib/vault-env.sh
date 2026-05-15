#!/usr/bin/env bash
# vault-env.sh — shared connection helper for the vault-toolkit plugin.
#
# Source this file, then use the `V` function to run any `vault` subcommand.
# Works both with a native `vault` CLI and with a Dockerised Vault — no code
# in the commands needs to know which.
#
# Configuration — all optional; env vars override the defaults:
#
#   VAULT_HOME       Dir holding vault-init.json, policies/, backups/, tls/.
#                    Default: first of ~/vault, ~/.vault that exists (else ~/vault)
#   VAULT_ADDR       Vault API address.            Default: https://127.0.0.1:8200
#   VAULT_TOKEN      Auth token. If unset, read .root_token from $VAULT_INIT
#   VAULT_INIT       Path to the init JSON.        Default: $VAULT_HOME/vault-init.json
#   VAULT_CACERT     CA cert path (native mode).   Default: $VAULT_HOME/tls/ca.pem
#   VAULT_CONTAINER  Docker container name.        Default: vault
#   VAULT_CACERT_IN_CONTAINER  CA path inside container. Default: /vault/tls/ca.pem
#   VAULT_FORCE_DOCKER=1       Force docker mode even with a native CLI present.
#
# After sourcing, these are available:
#   V <args...>     run a vault subcommand
#   VAULT_MODE      "native" or "docker"
#   VAULT_HOME      resolved
#   vault_unseal    attempt auto-unseal from $VAULT_INIT (first 3 keys)
#   vault_ready     return 0 if Vault is reachable and unsealed
#   file_mtime <f>  epoch mtime of a file (cross-platform: macOS + Linux)

# Additive PATH for common toolchains (harmless where the dirs don't exist).
case ":$PATH:" in
  *:/opt/homebrew/bin:*) ;;
  *) PATH="/opt/homebrew/bin:/usr/local/bin:$PATH" ;;
esac
export PATH

# Resolve VAULT_HOME.
if [ -z "${VAULT_HOME:-}" ]; then
  if   [ -d "$HOME/vault" ];  then VAULT_HOME="$HOME/vault"
  elif [ -d "$HOME/.vault" ]; then VAULT_HOME="$HOME/.vault"
  else VAULT_HOME="$HOME/vault"
  fi
fi
VAULT_ADDR="${VAULT_ADDR:-https://127.0.0.1:8200}"
VAULT_INIT="${VAULT_INIT:-$VAULT_HOME/vault-init.json}"

# Resolve token: explicit env wins, else .root_token from the init file.
if [ -z "${VAULT_TOKEN:-}" ] && [ -f "$VAULT_INIT" ]; then
  VAULT_TOKEN="$(jq -r '.root_token // empty' "$VAULT_INIT" 2>/dev/null || true)"
fi

# Pick mode: native CLI preferred unless forced to docker.
if [ "${VAULT_FORCE_DOCKER:-}" != "1" ] && command -v vault >/dev/null 2>&1; then
  VAULT_MODE="native"
else
  VAULT_MODE="docker"
fi

if [ "$VAULT_MODE" = "native" ]; then
  VAULT_CACERT="${VAULT_CACERT:-$VAULT_HOME/tls/ca.pem}"
  export VAULT_ADDR VAULT_CACERT VAULT_TOKEN
  V() { vault "$@"; }
else
  VAULT_CONTAINER="${VAULT_CONTAINER:-vault}"
  VAULT_CACERT_IN_CONTAINER="${VAULT_CACERT_IN_CONTAINER:-/vault/tls/ca.pem}"
  V() {
    docker exec \
      -e VAULT_ADDR="$VAULT_ADDR" \
      -e VAULT_CACERT="$VAULT_CACERT_IN_CONTAINER" \
      -e VAULT_TOKEN="${VAULT_TOKEN:-}" \
      "$VAULT_CONTAINER" vault "$@"
  }
fi

export VAULT_HOME VAULT_INIT VAULT_ADDR VAULT_MODE

vault_unseal() {
  [ -f "$VAULT_INIT" ] || return 1
  local i key
  for i in 0 1 2; do
    key="$(jq -r ".unseal_keys_b64[$i] // empty" "$VAULT_INIT" 2>/dev/null)"
    [ -n "$key" ] || continue
    V operator unseal "$key" >/dev/null 2>&1 || true
  done
}

vault_ready() {
  local sealed
  sealed="$(V status -format=json 2>/dev/null | jq -r '.sealed // "true"' 2>/dev/null || echo true)"
  [ "$sealed" = "false" ]
}

file_mtime() {
  stat -f %m "$1" 2>/dev/null || stat -c %Y "$1" 2>/dev/null
}

# ────────────────────────────────────────────────────────────────────────────
# Optional integration with wiremaze-base · lib/wmz-common.sh
# Defensive: silently skip if not present, so the toolkit works standalone.
# Adds: wmz_log → estruturado, wmz_mode → respeitar prod/dev/lab
# ────────────────────────────────────────────────────────────────────────────
_VAULT_ENV_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "${_VAULT_ENV_DIR}/wmz-common.sh" ]; then
  # shellcheck disable=SC1091
  source "${_VAULT_ENV_DIR}/wmz-common.sh"
fi

_vlog() {
  # Wrapper · usa wmz_log se disponível, senão silencioso para não poluir stdout
  if command -v wmz_log >/dev/null 2>&1; then
    wmz_log "vault-toolkit" "$1" "$2"
  fi
}

# ────────────────────────────────────────────────────────────────────────────
# vault_container_running · só faz sentido em modo docker
# Devolve 0 se container running, 1 caso contrário (ou em modo native)
# ────────────────────────────────────────────────────────────────────────────
vault_container_running() {
  [ "$VAULT_MODE" = "docker" ] || return 1
  command -v docker >/dev/null 2>&1 || return 1
  docker info >/dev/null 2>&1 || return 1
  local status
  status="$(docker inspect "$VAULT_CONTAINER" --format='{{.State.Status}}' 2>/dev/null || echo missing)"
  [ "$status" = "running" ]
}

# ────────────────────────────────────────────────────────────────────────────
# vault_container_up · arranca o container se não estiver a correr
#
# Espera encontrar docker-compose.yml em $VAULT_HOME (convenção do utilizador).
# Sai com 0 se o container já estava up OU foi arrancado com sucesso.
# Sai com 1 se não houver docker compose.yml ou o comando falhou.
#
# IMPORTANTE: Esta função PODE ter efeitos secundários (arrancar container).
# Controlada por WMZ_VAULT_AUTO_UP — não é chamada implicitamente em prod.
# ────────────────────────────────────────────────────────────────────────────
vault_container_up() {
  [ "$VAULT_MODE" = "docker" ] || return 0   # native mode = nothing to start

  if vault_container_running; then
    _vlog "info" "container already running"
    return 0
  fi

  if [ ! -f "$VAULT_HOME/docker-compose.yml" ] && [ ! -f "$VAULT_HOME/docker-compose.yaml" ]; then
    _vlog "warn" "no docker-compose.yml in $VAULT_HOME — cannot bring up automatically"
    return 1
  fi

  _vlog "action" "docker compose up -d in $VAULT_HOME"
  ( cd "$VAULT_HOME" && docker compose up -d ) >/dev/null 2>&1 || {
    _vlog "error" "docker compose up failed"
    return 1
  }
  sleep 5
  vault_container_running
}

# ────────────────────────────────────────────────────────────────────────────
# vault_arrange_up · flow completo replicando o que o user fazia à mão:
#   1) container up (docker compose up -d)
#   2) unseal (3 primeiras keys de vault-init.json)
#   3) verify ready
#
# Controlado por WMZ_VAULT_AUTO_UP (default: 0 em prod, 1 em dev/lab se wmz_mode disponível).
# Em prod sem auto-up explícito: assume operador humano arranca containers.
# ────────────────────────────────────────────────────────────────────────────
vault_arrange_up() {
  local auto_up="${WMZ_VAULT_AUTO_UP:-}"

  # Sem override explícito e em prod → não toca em nada
  if [ -z "$auto_up" ] && command -v wmz_is_prod >/dev/null 2>&1 && wmz_is_prod; then
    _vlog "skip" "vault_arrange_up skipped in prod (set WMZ_VAULT_AUTO_UP=1 to override)"
    return 1
  fi

  vault_container_up || true
  vault_ready || vault_unseal
  vault_ready
}

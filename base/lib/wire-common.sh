#!/usr/bin/env bash
# wire-base · lib/wire-common.sh
#
# Helpers partilhados para hooks e scripts dos plugins Wire.
# Plugins downstream fazem:  source "${CLAUDE_PLUGIN_ROOT}/../wire-base/lib/wire-common.sh"
#
# Não tem efeitos colaterais ao ser sourced. Só define funções e constantes.

# ────────────────────────────────────────────────────────────────────────────
# Constantes · paths canónicos
# ────────────────────────────────────────────────────────────────────────────
WIRE_HOME="${HOME}/.wire"
WIRE_BACKUPS_DIR="${WIRE_HOME}/backups"
WIRE_LOG_DIR="${WIRE_HOME}/log"
WIRE_SCOPE_FILE="${WIRE_HOME}/scope"
WIRE_MODE_FILE="${WIRE_HOME}/mode"
WIRE_LAB_MARKER="${WIRE_HOME}/lab-mode"

CLAUDE_GLOBAL_DIR="${HOME}/.claude"
# Constantes da API da lib — consumidas por scripts downstream, não dentro desta lib.
# shellcheck disable=SC2034
CLAUDE_GLOBAL_MEMORY="${CLAUDE_GLOBAL_DIR}/CLAUDE.md"
# shellcheck disable=SC2034
CLAUDE_GLOBAL_SETTINGS="${CLAUDE_GLOBAL_DIR}/settings.json"

# ────────────────────────────────────────────────────────────────────────────
# wire_mode · devolve o operating mode actual
#
# Ordem de precedência:
#   1) WIRE_OPERATING_MODE (env var, override por sessão)
#   2) ~/.wire/mode (ficheiro, persistente)
#   3) "prod" (default seguro)
#
# Modos válidos:
#   prod  → fail-closed total. Vault obrigatório.
#   dev   → warn-only. Hooks logam mas não bloqueiam.
#   lab   → bypass total. Exige marker ~/.wire/lab-mode.
# ────────────────────────────────────────────────────────────────────────────
wire_mode() {
  local mode

  if [ -n "${WIRE_OPERATING_MODE:-}" ]; then
    mode="$WIRE_OPERATING_MODE"
  elif [ -f "$WIRE_MODE_FILE" ]; then
    mode=$(cat "$WIRE_MODE_FILE" 2>/dev/null | tr -d '[:space:]')
  else
    mode="prod"
  fi

  # Validação · lab exige marker
  if [ "$mode" = "lab" ] && [ ! -f "$WIRE_LAB_MARKER" ]; then
    echo "prod"
    return
  fi

  case "$mode" in
    prod|dev|lab) echo "$mode" ;;
    *) echo "prod" ;;  # fail-safe default
  esac
}

# ────────────────────────────────────────────────────────────────────────────
# wire_scope · devolve o scope preferido do utilizador
#
# Lê ~/.wire/scope (definido pelo mempalace-doctor).
# Valores: global | project | hybrid (default: hybrid)
# ────────────────────────────────────────────────────────────────────────────
wire_scope() {
  if [ -f "$WIRE_SCOPE_FILE" ]; then
    cat "$WIRE_SCOPE_FILE" 2>/dev/null | tr -d '[:space:]'
  else
    echo "hybrid"
  fi
}

# ────────────────────────────────────────────────────────────────────────────
# wire_is_prod · helper booleano · "estamos em prod?"
# ────────────────────────────────────────────────────────────────────────────
wire_is_prod() {
  [ "$(wire_mode)" = "prod" ]
}

wire_is_dev() {
  [ "$(wire_mode)" = "dev" ]
}

wire_is_lab() {
  [ "$(wire_mode)" = "lab" ]
}

# ────────────────────────────────────────────────────────────────────────────
# wire_log · escreve linha em log estruturado
#
# Uso:  wire_log <plugin> <event> <message>
# Output:  YYYY-MM-DDTHH:MM:SSZ  <plugin>  <event>  <message>
# ────────────────────────────────────────────────────────────────────────────
wire_log() {
  local plugin="${1:-unknown}"
  local event="${2:-info}"
  local message="${3:-}"
  local log_file="${WIRE_LOG_DIR}/${plugin}.log"

  mkdir -p "$WIRE_LOG_DIR" 2>/dev/null || true
  printf '%s\t%s\t%s\t%s\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    "$plugin" \
    "$event" \
    "$message" \
    >> "$log_file" 2>/dev/null || true
}

# ────────────────────────────────────────────────────────────────────────────
# wire_backup · cria backup tarball com timestamp
#
# Uso:  wire_backup <label> <path1> [path2] [path3] ...
# Devolve path do tarball.
# ────────────────────────────────────────────────────────────────────────────
wire_backup() {
  local label="${1:-untagged}"
  shift
  local ts
  ts=$(date -u +%Y%m%d-%H%M%S)
  local out="${WIRE_BACKUPS_DIR}/${label}-${ts}.tgz"

  mkdir -p "$WIRE_BACKUPS_DIR" 2>/dev/null || true
  tar czf "$out" "$@" 2>/dev/null && echo "$out"
}

# ────────────────────────────────────────────────────────────────────────────
# wire_fail_or_warn · escolhe entre exit 2 e log baseado em mode
#
# Uso:  wire_fail_or_warn <plugin> <hook> <message>
# Em prod: log + exit 2
# Em dev:  log + return 0
# Em lab:  return 0 (silent)
# ────────────────────────────────────────────────────────────────────────────
wire_fail_or_warn() {
  local plugin="$1"
  local hook="$2"
  local message="$3"
  local mode
  mode=$(wire_mode)

  case "$mode" in
    prod)
      wire_log "$plugin" "block" "$hook: $message"
      echo "[$plugin/$hook] $message" >&2
      exit 2
      ;;
    dev)
      wire_log "$plugin" "warn" "$hook: $message"
      echo "[$plugin/$hook] (dev mode) $message" >&2
      ;;
    lab)
      # silencioso, mas loga
      wire_log "$plugin" "bypass" "$hook: $message"
      ;;
  esac
}

# ────────────────────────────────────────────────────────────────────────────
# wire_require · valida pré-condições, falha em prod, warn em dev
#
# Uso:  wire_require <plugin> <hook> <test-cmd> <error-message>
#
# Exemplo:
#   wire_require my-plugin vault-ttl \
#     '[ -n "${VAULT_TOKEN:-}" ]' \
#     "VAULT_TOKEN ausente"
# ────────────────────────────────────────────────────────────────────────────
wire_require() {
  local plugin="$1"
  local hook="$2"
  local test_cmd="$3"
  local error="$4"

  if ! eval "$test_cmd" >/dev/null 2>&1; then
    wire_fail_or_warn "$plugin" "$hook" "$error"
  fi
}

# ────────────────────────────────────────────────────────────────────────────
# wire_init_dirs · cria a estrutura ~/.wire/ se ausente
# Chamado pelo mempalace-doctor no passo 6.
# ────────────────────────────────────────────────────────────────────────────
wire_init_dirs() {
  mkdir -p "$WIRE_HOME" "$WIRE_BACKUPS_DIR" "$WIRE_LOG_DIR" 2>/dev/null || true
}

# ────────────────────────────────────────────────────────────────────────────
# wire_version · versão deste lib
# ────────────────────────────────────────────────────────────────────────────
WIRE_COMMON_VERSION="0.1.0"
wire_version() { echo "$WIRE_COMMON_VERSION"; }

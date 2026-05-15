#!/usr/bin/env bash
# wiremaze-base · lib/wmz-common.sh
#
# Helpers partilhados para hooks e scripts dos plugins Wiremaze.
# Plugins downstream fazem:  source "${CLAUDE_PLUGIN_ROOT}/../wiremaze-base/lib/wmz-common.sh"
#
# Não tem efeitos colaterais ao ser sourced. Só define funções e constantes.

# ────────────────────────────────────────────────────────────────────────────
# Constantes · paths canónicos
# ────────────────────────────────────────────────────────────────────────────
WMZ_HOME="${HOME}/.wmz"
WMZ_BACKUPS_DIR="${WMZ_HOME}/backups"
WMZ_LOG_DIR="${WMZ_HOME}/log"
WMZ_SCOPE_FILE="${WMZ_HOME}/scope"
WMZ_MODE_FILE="${WMZ_HOME}/mode"
WMZ_LAB_MARKER="${WMZ_HOME}/lab-mode"

CLAUDE_GLOBAL_DIR="${HOME}/.claude"
CLAUDE_GLOBAL_MEMORY="${CLAUDE_GLOBAL_DIR}/CLAUDE.md"
CLAUDE_GLOBAL_SETTINGS="${CLAUDE_GLOBAL_DIR}/settings.json"

# ────────────────────────────────────────────────────────────────────────────
# wmz_mode · devolve o operating mode actual
#
# Ordem de precedência:
#   1) WMZ_OPERATING_MODE (env var, override por sessão)
#   2) ~/.wmz/mode (ficheiro, persistente)
#   3) "prod" (default seguro)
#
# Modos válidos:
#   prod  → fail-closed total. Vault obrigatório.
#   dev   → warn-only. Hooks logam mas não bloqueiam.
#   lab   → bypass total. Exige marker ~/.wmz/lab-mode.
# ────────────────────────────────────────────────────────────────────────────
wmz_mode() {
  local mode

  if [ -n "${WMZ_OPERATING_MODE:-}" ]; then
    mode="$WMZ_OPERATING_MODE"
  elif [ -f "$WMZ_MODE_FILE" ]; then
    mode=$(cat "$WMZ_MODE_FILE" 2>/dev/null | tr -d '[:space:]')
  else
    mode="prod"
  fi

  # Validação · lab exige marker
  if [ "$mode" = "lab" ] && [ ! -f "$WMZ_LAB_MARKER" ]; then
    echo "prod"
    return
  fi

  case "$mode" in
    prod|dev|lab) echo "$mode" ;;
    *) echo "prod" ;;  # fail-safe default
  esac
}

# ────────────────────────────────────────────────────────────────────────────
# wmz_scope · devolve o scope preferido do utilizador
#
# Lê ~/.wmz/scope (definido pelo mempalace-doctor).
# Valores: global | project | hybrid (default: hybrid)
# ────────────────────────────────────────────────────────────────────────────
wmz_scope() {
  if [ -f "$WMZ_SCOPE_FILE" ]; then
    cat "$WMZ_SCOPE_FILE" 2>/dev/null | tr -d '[:space:]'
  else
    echo "hybrid"
  fi
}

# ────────────────────────────────────────────────────────────────────────────
# wmz_is_prod · helper booleano · "estamos em prod?"
# ────────────────────────────────────────────────────────────────────────────
wmz_is_prod() {
  [ "$(wmz_mode)" = "prod" ]
}

wmz_is_dev() {
  [ "$(wmz_mode)" = "dev" ]
}

wmz_is_lab() {
  [ "$(wmz_mode)" = "lab" ]
}

# ────────────────────────────────────────────────────────────────────────────
# wmz_log · escreve linha em log estruturado
#
# Uso:  wmz_log <plugin> <event> <message>
# Output:  YYYY-MM-DDTHH:MM:SSZ  <plugin>  <event>  <message>
# ────────────────────────────────────────────────────────────────────────────
wmz_log() {
  local plugin="${1:-unknown}"
  local event="${2:-info}"
  local message="${3:-}"
  local log_file="${WMZ_LOG_DIR}/${plugin}.log"

  mkdir -p "$WMZ_LOG_DIR" 2>/dev/null || true
  printf '%s\t%s\t%s\t%s\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    "$plugin" \
    "$event" \
    "$message" \
    >> "$log_file" 2>/dev/null || true
}

# ────────────────────────────────────────────────────────────────────────────
# wmz_backup · cria backup tarball com timestamp
#
# Uso:  wmz_backup <label> <path1> [path2] [path3] ...
# Devolve path do tarball.
# ────────────────────────────────────────────────────────────────────────────
wmz_backup() {
  local label="${1:-untagged}"
  shift
  local ts
  ts=$(date -u +%Y%m%d-%H%M%S)
  local out="${WMZ_BACKUPS_DIR}/${label}-${ts}.tgz"

  mkdir -p "$WMZ_BACKUPS_DIR" 2>/dev/null || true
  tar czf "$out" "$@" 2>/dev/null && echo "$out"
}

# ────────────────────────────────────────────────────────────────────────────
# wmz_fail_or_warn · escolhe entre exit 2 e log baseado em mode
#
# Uso:  wmz_fail_or_warn <plugin> <hook> <message>
# Em prod: log + exit 2
# Em dev:  log + return 0
# Em lab:  return 0 (silent)
# ────────────────────────────────────────────────────────────────────────────
wmz_fail_or_warn() {
  local plugin="$1"
  local hook="$2"
  local message="$3"
  local mode
  mode=$(wmz_mode)

  case "$mode" in
    prod)
      wmz_log "$plugin" "block" "$hook: $message"
      echo "[$plugin/$hook] $message" >&2
      exit 2
      ;;
    dev)
      wmz_log "$plugin" "warn" "$hook: $message"
      echo "[$plugin/$hook] (dev mode) $message" >&2
      ;;
    lab)
      # silencioso, mas loga
      wmz_log "$plugin" "bypass" "$hook: $message"
      ;;
  esac
}

# ────────────────────────────────────────────────────────────────────────────
# wmz_require · valida pré-condições, falha em prod, warn em dev
#
# Uso:  wmz_require <plugin> <hook> <test-cmd> <error-message>
#
# Exemplo:
#   wmz_require my-plugin vault-ttl \
#     '[ -n "${VAULT_TOKEN:-}" ]' \
#     "VAULT_TOKEN ausente"
# ────────────────────────────────────────────────────────────────────────────
wmz_require() {
  local plugin="$1"
  local hook="$2"
  local test_cmd="$3"
  local error="$4"

  if ! eval "$test_cmd" >/dev/null 2>&1; then
    wmz_fail_or_warn "$plugin" "$hook" "$error"
  fi
}

# ────────────────────────────────────────────────────────────────────────────
# wmz_init_dirs · cria a estrutura ~/.wmz/ se ausente
# Chamado pelo mempalace-doctor no passo 6.
# ────────────────────────────────────────────────────────────────────────────
wmz_init_dirs() {
  mkdir -p "$WMZ_HOME" "$WMZ_BACKUPS_DIR" "$WMZ_LOG_DIR" 2>/dev/null || true
}

# ────────────────────────────────────────────────────────────────────────────
# wmz_version · versão deste lib
# ────────────────────────────────────────────────────────────────────────────
WMZ_COMMON_VERSION="0.1.0"
wmz_version() { echo "$WMZ_COMMON_VERSION"; }

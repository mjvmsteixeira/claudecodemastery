#!/usr/bin/env bash
# prumo-base · lib/prumo-common.sh
#
# Helpers partilhados para hooks e scripts dos plugins prumo.
# Plugins downstream fazem:  source "${CLAUDE_PLUGIN_ROOT}/../prumo-base/lib/prumo-common.sh"
#
# Não tem efeitos colaterais ao ser sourced, além da migração one-shot
# ~/.wire → ~/.prumo abaixo (idempotente, guardada por existência de ficheiro).

# ────────────────────────────────────────────────────────────────────────────
# Constantes · paths canónicos
# ────────────────────────────────────────────────────────────────────────────
PRUMO_HOME="${HOME}/.prumo"
PRUMO_BACKUPS_DIR="${PRUMO_HOME}/backups"
PRUMO_LOG_DIR="${PRUMO_HOME}/log"
PRUMO_SCOPE_FILE="${PRUMO_HOME}/scope"
PRUMO_MODE_FILE="${PRUMO_HOME}/mode"
PRUMO_LAB_MARKER="${PRUMO_HOME}/lab-mode"

# --- migração one-shot do estado wire → prumo (rebrand 2026-07) ---
if [ ! -e "$PRUMO_MODE_FILE" ] && [ -f "${HOME}/.wire/mode" ]; then
  mkdir -p "$PRUMO_HOME" || true
  cp "${HOME}/.wire/mode" "$PRUMO_MODE_FILE" || true
  [ -f "${HOME}/.wire/lab-mode" ] && { cp "${HOME}/.wire/lab-mode" "$PRUMO_LAB_MARKER" || true; }
  [ -f "${HOME}/.wire/scope" ] && { cp "${HOME}/.wire/scope" "$PRUMO_SCOPE_FILE" || true; }
  echo "[prumo] estado migrado de ~/.wire para ~/.prumo (o antigo não foi apagado)" >&2
fi

CLAUDE_GLOBAL_DIR="${HOME}/.claude"
# Constantes da API da lib — consumidas por scripts downstream, não dentro desta lib.
# shellcheck disable=SC2034
CLAUDE_GLOBAL_MEMORY="${CLAUDE_GLOBAL_DIR}/CLAUDE.md"
# shellcheck disable=SC2034
CLAUDE_GLOBAL_SETTINGS="${CLAUDE_GLOBAL_DIR}/settings.json"

# ────────────────────────────────────────────────────────────────────────────
# prumo_mode · devolve o operating mode actual
#
# Ordem de precedência:
#   1) PRUMO_OPERATING_MODE (env var, override por sessão)
#   2) ~/.prumo/mode (ficheiro, persistente)
#   3) "prod" (default seguro)
#
# Modos válidos:
#   prod  → fail-closed total. Vault obrigatório.
#   dev   → warn-only. Hooks logam mas não bloqueiam.
#   lab   → bypass total. Exige marker ~/.prumo/lab-mode.
# ────────────────────────────────────────────────────────────────────────────
prumo_mode() {
  local mode

  if [ -n "${PRUMO_OPERATING_MODE:-}" ]; then
    mode="$PRUMO_OPERATING_MODE"
  elif [ -f "$PRUMO_MODE_FILE" ]; then
    mode=$(cat "$PRUMO_MODE_FILE" 2>/dev/null | tr -d '[:space:]')
  else
    mode="prod"
  fi

  # Validação · lab exige marker
  if [ "$mode" = "lab" ] && [ ! -f "$PRUMO_LAB_MARKER" ]; then
    echo "prod"
    return
  fi

  case "$mode" in
    prod|dev|lab) echo "$mode" ;;
    *) echo "prod" ;;  # fail-safe default
  esac
}

# ────────────────────────────────────────────────────────────────────────────
# prumo_scope · devolve o scope preferido do utilizador
#
# Lê ~/.prumo/scope (definido pelo memory-doctor).
# Valores: global | project | hybrid (default: hybrid)
# ────────────────────────────────────────────────────────────────────────────
prumo_scope() {
  if [ -f "$PRUMO_SCOPE_FILE" ]; then
    cat "$PRUMO_SCOPE_FILE" 2>/dev/null | tr -d '[:space:]'
  else
    echo "hybrid"
  fi
}

# ────────────────────────────────────────────────────────────────────────────
# prumo_is_prod · helper booleano · "estamos em prod?"
# ────────────────────────────────────────────────────────────────────────────
prumo_is_prod() {
  [ "$(prumo_mode)" = "prod" ]
}

prumo_is_dev() {
  [ "$(prumo_mode)" = "dev" ]
}

prumo_is_lab() {
  [ "$(prumo_mode)" = "lab" ]
}

# ────────────────────────────────────────────────────────────────────────────
# prumo_log · escreve linha em log estruturado
#
# Uso:  prumo_log <plugin> <event> <message>
# Output:  YYYY-MM-DDTHH:MM:SSZ  <plugin>  <event>  <message>
# ────────────────────────────────────────────────────────────────────────────
prumo_log() {
  local plugin="${1:-unknown}"
  local event="${2:-info}"
  local message="${3:-}"
  local log_file="${PRUMO_LOG_DIR}/${plugin}.log"

  mkdir -p "$PRUMO_LOG_DIR" 2>/dev/null || true
  printf '%s\t%s\t%s\t%s\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    "$plugin" \
    "$event" \
    "$message" \
    >> "$log_file" 2>/dev/null || true
}

# ────────────────────────────────────────────────────────────────────────────
# Telemetria de guardrails · contagem por hook, SEM conteúdo de comando.
#
#   prumo_telemetry_record <plugin> <hook> <decision>   decision: block|warn|bypass|allow
#   prumo_telemetry_init   <plugin> <hook>              instala trap EXIT p/ o allow
#   prumo_telemetry_summary [--since all|Nd|Nh]         agrega telemetry.tsv por hook
#
# Best-effort: qualquer falha é engolida; nunca altera decisão nem exit code.
# ────────────────────────────────────────────────────────────────────────────
prumo_telemetry_record() {
  local plugin="${1:-unknown}" hook="${2:-unknown}" decision="${3:-unknown}"
  mkdir -p "$PRUMO_LOG_DIR" 2>/dev/null || true
  printf '%s\t%s\t%s\t%s\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$plugin" "$hook" "$decision" \
    >> "${PRUMO_LOG_DIR}/telemetry.tsv" 2>/dev/null || true
}

# shellcheck disable=SC2329  # invocado pelo trap EXIT
_prumo_tm_on_exit() {
  local code=$?
  [ "${BASH_SUBSHELL:-0}" -eq 0 ] || return   # só regista no shell de topo, nunca em subshells
  [ "${PRUMO_TM_RECORDED:-0}" = "1" ] && return
  case "$code" in
    0) prumo_telemetry_record "${PRUMO_TM_PLUGIN:-unknown}" "${PRUMO_TM_HOOK:-unknown}" allow ;;
    2) prumo_telemetry_record "${PRUMO_TM_PLUGIN:-unknown}" "${PRUMO_TM_HOOK:-unknown}" block ;;
  esac
}

prumo_telemetry_init() {
  PRUMO_TM_PLUGIN="${1:-unknown}"
  PRUMO_TM_HOOK="${2:-unknown}"
  PRUMO_TM_RECORDED=0
  trap _prumo_tm_on_exit EXIT
}

prumo_telemetry_summary() {
  local since="all" tsv="${PRUMO_LOG_DIR}/telemetry.tsv"
  while [ $# -gt 0 ]; do
    case "$1" in
      --since) since="${2:-all}"; if [ $# -ge 2 ]; then shift 2; else shift; fi ;;
      *) shift ;;
    esac
  done
  [ -f "$tsv" ] || { echo "(sem telemetria ainda — ${tsv} não existe)"; return 0; }
  local cutoff=""
  case "$since" in
    all) cutoff="" ;;
    *d)  cutoff=$(date -u -v-"${since%d}"d +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || echo "") ;;
    *h)  cutoff=$(date -u -v-"${since%h}"H +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || echo "") ;;
    *)   cutoff="" ;;
  esac
  awk -F'\t' -v cutoff="$cutoff" '
    cutoff != "" && $1 < cutoff { next }
    { c[$3 SUBSEP $4]++; hooks[$3]=1; tot[$3]++ }
    END {
      for (h in hooks) {
        b=c[h SUBSEP "block"]+0; w=c[h SUBSEP "warn"]+0
        y=c[h SUBSEP "bypass"]+0; a=c[h SUBSEP "allow"]+0
        printf "%-16s block=%d warn=%d bypass=%d allow=%d  fire=%d/%d\n", h, b, w, y, a, b+w+y, tot[h]
      }
    }' "$tsv" | sort
}

# ────────────────────────────────────────────────────────────────────────────
# prumo_backup · cria backup tarball com timestamp
#
# Uso:  prumo_backup <label> <path1> [path2] [path3] ...
# Devolve path do tarball.
# ────────────────────────────────────────────────────────────────────────────
prumo_backup() {
  local label="${1:-untagged}"
  shift
  local ts
  ts=$(date -u +%Y%m%d-%H%M%S)
  local out="${PRUMO_BACKUPS_DIR}/${label}-${ts}.tgz"

  mkdir -p "$PRUMO_BACKUPS_DIR" 2>/dev/null || true
  tar czf "$out" "$@" 2>/dev/null && echo "$out"
}

# ────────────────────────────────────────────────────────────────────────────
# prumo_fail_or_warn · escolhe entre exit 2 e log baseado em mode
#
# Uso:  prumo_fail_or_warn <plugin> <hook> <message>
# Em prod: log + exit 2
# Em dev:  log + return 0
# Em lab:  return 0 (silent)
# ────────────────────────────────────────────────────────────────────────────
prumo_fail_or_warn() {
  local plugin="$1"
  local hook="$2"
  local message="$3"
  local mode
  mode=$(prumo_mode)

  case "$mode" in
    prod)
      prumo_log "$plugin" "block" "$hook: $message"
      prumo_telemetry_record "$plugin" "$hook" "block"; PRUMO_TM_RECORDED=1
      echo "[$plugin/$hook] $message" >&2
      exit 2
      ;;
    dev)
      prumo_log "$plugin" "warn" "$hook: $message"
      prumo_telemetry_record "$plugin" "$hook" "warn"; PRUMO_TM_RECORDED=1
      echo "[$plugin/$hook] (dev mode) $message" >&2
      ;;
    lab)
      # silencioso, mas loga
      prumo_log "$plugin" "bypass" "$hook: $message"
      prumo_telemetry_record "$plugin" "$hook" "bypass"; PRUMO_TM_RECORDED=1
      ;;
  esac
}

# ────────────────────────────────────────────────────────────────────────────
# prumo_require · valida pré-condições, falha em prod, warn em dev
#
# Uso:  prumo_require <plugin> <hook> <test-cmd> <error-message>
#
# Exemplo:
#   prumo_require my-plugin vault-ttl \
#     '[ -n "${VAULT_TOKEN:-}" ]' \
#     "VAULT_TOKEN ausente"
# ────────────────────────────────────────────────────────────────────────────
prumo_require() {
  local plugin="$1"
  local hook="$2"
  local test_cmd="$3"
  local error="$4"

  # ATENÇÃO: eval — só invocar test_cmd com strings literais escritas por quem
  # desenvolve o plugin. Nunca passar aqui dados vindos de tool-input, stdin,
  # ou qualquer fonte controlada pelo utilizador/modelo (command injection via eval).
  if ! eval "$test_cmd" >/dev/null 2>&1; then
    prumo_fail_or_warn "$plugin" "$hook" "$error"
  fi
}

# ────────────────────────────────────────────────────────────────────────────
# prumo_init_dirs · cria a estrutura ~/.prumo/ se ausente
# Chamado pelo memory-doctor no passo 6.
# ────────────────────────────────────────────────────────────────────────────
prumo_init_dirs() {
  mkdir -p "$PRUMO_HOME" "$PRUMO_BACKUPS_DIR" "$PRUMO_LOG_DIR" 2>/dev/null || true
}

# ────────────────────────────────────────────────────────────────────────────
# prumo_version · versão deste lib
# ────────────────────────────────────────────────────────────────────────────
PRUMO_COMMON_VERSION="0.1.0"
prumo_version() { echo "$PRUMO_COMMON_VERSION"; }

# ────────────────────────────────────────────────────────────────────────────
# hook_tool_payload — extrai o "comando/texto" relevante do input de um hook.
#
# Fonte única partilhada por todos os hooks (base e secops). O secops/hooks/_lib.sh
# reexporta-a com um fallback fail-closed próprio para o caso de o prumo-base não
# estar instalado.
#
# O Claude Code entrega aos hooks de tipo `command` um JSON via STDIN, ex:
#   {"hook_event_name":"PreToolUse","tool_name":"Bash",
#    "tool_input":{"command":"vault read secret/foo"}}
# Para Write/Edit, tool_input tem file_path/content/old_string/new_string.
#
# Aceita 3 formas de input (por ordem de precedência):
#   1. argumento $1 (testes/CLI directo)
#   2. JSON do Claude Code via stdin → extrai tool_input
#   3. texto cru via stdin (compat legacy)
hook_tool_payload() {
  if [ -n "${1:-}" ]; then
    printf '%s' "$1"
    return
  fi
  local raw
  raw=$(cat)
  if command -v jq >/dev/null 2>&1 && printf '%s' "$raw" | jq -e '.tool_input' >/dev/null 2>&1; then
    local extracted
    extracted=$(printf '%s' "$raw" | jq -r '
      .tool_input.command //
      ([.tool_input.file_path, .tool_input.content, .tool_input.old_string, .tool_input.new_string]
        | map(select(. != null and . != "")) | join("\n")) //
      empty')
    if [ -n "$extracted" ]; then
      printf '%s' "$extracted"
      return
    fi
  fi
  printf '%s' "$raw"
}

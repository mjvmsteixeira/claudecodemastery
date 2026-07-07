#!/usr/bin/env bash
# secops/hooks/_lib.sh
#
# Carrega `prumo-common.sh` do plugin `prumo-base` se este estiver instalado,
# ou fornece stubs de fallback em modo prod-fail-closed.
#
# Source-able. Importado no topo de cada hook do secops via:
#   source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
#
# API exposta a quem importa este ficheiro (idêntica seja real ou fallback):
#   prumo_log <plugin> <event> <message>          — log estruturado (TSV)
#   prumo_mode                                    — devolve prod|dev|lab
#   prumo_is_prod / prumo_is_dev / prumo_is_lab     — predicados
#   prumo_fail_or_warn <plugin> <hook> <message>  — prod=exit 2, dev=warn, lab=silent
#   prumo_telemetry_init <plugin> <hook>          — instala trap de telemetria (no-op no fallback)
#   prumo_telemetry_record <plugin> <hook> <decision> — regista decisão (no-op no fallback)
#
# Por defeito o fallback assume prod (sem distinguir modos) — comportamento
# seguro para um plugin SecOps quando o base está em falta.

# Se a lib já foi carregada noutro hook desta sessão, não duplicar.
if ! declare -F prumo_fail_or_warn >/dev/null 2>&1; then
  PRUMO_BASE_LIB=$(find ~/.claude/plugins/cache -path "*/prumo-base/*/lib/prumo-common.sh" -type f 2>/dev/null \
                  | sort -V | tail -1)
  if [ -n "${PRUMO_BASE_LIB:-}" ] && [ -r "$PRUMO_BASE_LIB" ]; then
    # Integridade: mesma preocupação que post-tool-vault-revoke.sh — um
    # ficheiro plantado em qualquer path que bata o padrão find acima seria
    # sourced (e passaria a definir prumo_fail_or_warn, prumo_mode, etc. —
    # controlos de segurança) sem verificação nenhuma. Confirma que o plugin
    # root (dois níveis acima de lib/prumo-common.sh) é mesmo o prumo-base
    # via .claude-plugin/plugin.json antes de o fazer source.
    PRUMO_BASE_PLUGIN_ROOT=$(dirname "$(dirname "$PRUMO_BASE_LIB")")
    PRUMO_BASE_PLUGIN_JSON="$PRUMO_BASE_PLUGIN_ROOT/.claude-plugin/plugin.json"
    PRUMO_BASE_PLUGIN_NAME=""
    if [ -r "$PRUMO_BASE_PLUGIN_JSON" ] && command -v jq >/dev/null 2>&1; then
      PRUMO_BASE_PLUGIN_NAME=$(jq -r '.name // empty' "$PRUMO_BASE_PLUGIN_JSON" 2>/dev/null)
    fi
    if [ "$PRUMO_BASE_PLUGIN_NAME" = "prumo-base" ]; then
      # shellcheck disable=SC1090
      source "$PRUMO_BASE_LIB"
    else
      echo "[prumo-secops/_lib] prumo-common.sh candidato falhou verificação de integridade (plugin.json name='${PRUMO_BASE_PLUGIN_NAME:-<ausente>}', esperado 'prumo-base') — a ignorar, usar stubs fail-closed" >&2
    fi
  fi
fi

# Stubs de fallback — só são definidos se a lib real não tiver sido carregada.
if ! declare -F prumo_fail_or_warn >/dev/null 2>&1; then
  prumo_log()       { :; }                       # noop sem o base
  prumo_telemetry_init()   { :; }               # noop sem o base
  prumo_telemetry_record() { :; }               # noop sem o base
  prumo_mode()      { echo prod; }
  prumo_is_prod()   { return 0; }
  prumo_is_dev()    { return 1; }
  prumo_is_lab()    { return 1; }
  prumo_fail_or_warn() {
    local plugin="$1" hook="$2" message="$3"
    echo "[$plugin/$hook] $message" >&2
    exit 2
  }
fi

# Fonte única do default de PRUMO_LOG_DIR para os hooks do secops. A lib real já
# o define (prumo-common.sh: ${PRUMO_HOME}/log); com os stubs de fallback activos
# ficaria por definir. Este `:=` respeita um valor já exportado e só preenche o
# default quando ausente — evita o fallback hardcoded repetido em cada hook.
: "${PRUMO_LOG_DIR:=$HOME/.prumo/log}"

# ─────────────────────────────────────────────────────────────────────────────
# hook_tool_payload — extrai o "comando/texto" relevante do input do hook.
#
# O Claude Code entrega aos hooks de tipo `command` um JSON via STDIN, ex:
#   {"hook_event_name":"PreToolUse","tool_name":"Bash",
#    "tool_input":{"command":"vault read secret/foo"}}
#
# Para Write/Edit, tool_input tem file_path/content/old_string/new_string.
#
# Esta função aceita 3 formas de input (por ordem de precedência):
#   1. argumento $1 (testes/CLI directo)
#   2. JSON do Claude Code via stdin → extrai tool_input
#   3. texto cru via stdin (compat legacy)
#
# Devolve a string sobre a qual os patterns dos hooks devem correr.
#
# Fonte canónica em base/lib/prumo-common.sh — esta é só o fallback fail-closed
# para quando o prumo-base não está instalado (stubs activos). Só se define se a
# lib real não a trouxe já.
if ! declare -F hook_tool_payload >/dev/null 2>&1; then
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
fi

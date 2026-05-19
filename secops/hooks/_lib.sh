#!/usr/bin/env bash
# secops/hooks/_lib.sh
#
# Carrega `wire-common.sh` do plugin `wire-base` se este estiver instalado,
# ou fornece stubs de fallback em modo prod-fail-closed.
#
# Source-able. Importado no topo de cada hook do secops via:
#   source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
#
# API exposta a quem importa este ficheiro (idêntica seja real ou fallback):
#   wire_log <plugin> <event> <message>          — log estruturado (TSV)
#   wire_mode                                    — devolve prod|dev|lab
#   wire_is_prod / wire_is_dev / wire_is_lab     — predicados
#   wire_fail_or_warn <plugin> <hook> <message>  — prod=exit 2, dev=warn, lab=silent
#
# Por defeito o fallback assume prod (sem distinguir modos) — comportamento
# seguro para um plugin SecOps quando o base está em falta.

# Se a lib já foi carregada noutro hook desta sessão, não duplicar.
if ! declare -F wire_fail_or_warn >/dev/null 2>&1; then
  WIRE_BASE_LIB=$(find ~/.claude/plugins/cache -path "*/wire-base/*/lib/wire-common.sh" 2>/dev/null \
                  | sort -V | tail -1)
  if [ -n "${WIRE_BASE_LIB:-}" ] && [ -r "$WIRE_BASE_LIB" ]; then
    # shellcheck disable=SC1090
    source "$WIRE_BASE_LIB"
  fi
fi

# Stubs de fallback — só são definidos se a lib real não tiver sido carregada.
if ! declare -F wire_fail_or_warn >/dev/null 2>&1; then
  wire_log()       { :; }                       # noop sem o base
  wire_mode()      { echo prod; }
  wire_is_prod()   { return 0; }
  wire_is_dev()    { return 1; }
  wire_is_lab()    { return 1; }
  wire_fail_or_warn() {
    local plugin="$1" hook="$2" message="$3"
    echo "[$plugin/$hook] $message" >&2
    exit 2
  }
fi

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

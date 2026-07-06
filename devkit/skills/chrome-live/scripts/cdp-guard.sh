#!/usr/bin/env bash
# prumo-devkit · chrome-live · cdp-guard.sh
#
# Gateway de modo/segurança sobre o cdp.mjs (chrome-cdp-skill, MIT © pasky).
# Toda a invocação de browser ao vivo DEVE passar por aqui — nunca chamar
# `node cdp.mjs` directamente — para herdar o gating do ecossistema prumo.
#
# Classificação de verbos:
#   read-only  (list shot snap html net)        → passam sempre (após preflight)
#   active     (eval evalraw click clickxy type
#               nav open loadall)                → executam JS / mudam o estado de uma
#                                                   página AUTENTICADA. Gateados por:
#                                                     - PRUMO_OPERATING_MODE (prod fail-closed)
#                                                     - contexto de audit (~/.prumo/audit-active)
#   control    (stop)                            → benigno (pára daemon)
#
# Consentimentos (audit-tracked em ~/.prumo/log/prumo-devkit.log):
#   PRUMO_CHROME_LIVE_ACTIVE=1  → autoriza verbos activos em modo prod
#   PRUMO_AUDIT_APPLY=1         → autoriza verbos activos durante contexto de audit
#
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
CDP="${HERE}/cdp.mjs"
PLUGIN="prumo-devkit"
HOOK="chrome-live"

# ── helpers da prumo-base (modo/log); fallback fail-closed se o base não estiver instalado ──
LIB="$(find "${HOME}/.claude/plugins/cache" -path "*/prumo-base/*/lib/prumo-common.sh" -print -quit 2>/dev/null || true)"
if [ -n "$LIB" ] && [ -r "$LIB" ]; then
  # shellcheck disable=SC1090
  . "$LIB"
fi
if ! declare -F prumo_mode >/dev/null 2>&1; then
  prumo_mode() {
    local m="${PRUMO_OPERATING_MODE:-}"
    [ -z "$m" ] && [ -r "${HOME}/.prumo/mode" ] && m="$(tr -d '[:space:]' < "${HOME}/.prumo/mode")"
    echo "${m:-prod}"
  }
fi
declare -F prumo_log >/dev/null 2>&1 || prumo_log() { :; }

VERB="${1:-}"
if [ -z "$VERB" ]; then
  echo "uso: cdp-guard.sh <verbo> [args...]   (verbos: list shot snap html net | eval evalraw click clickxy type nav open loadall | stop)" >&2
  exit 64
fi

# ── classificação ──
case "$VERB" in
  list|shot|snap|html|net)                          CLASS="readonly" ;;
  eval|evalraw|click|clickxy|type|nav|open|loadall) CLASS="active" ;;
  stop)                                             CLASS="control" ;;
  *) echo "[chrome-live] verbo desconhecido: '$VERB'" >&2; exit 64 ;;
esac

# ── preflight: Node 22+ (WebSocket built-in) ──
if ! command -v node >/dev/null 2>&1; then
  echo "[chrome-live] Node não encontrado no PATH — requer Node 22+." >&2
  exit 69
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
if [ "${NODE_MAJOR:-0}" -lt 22 ]; then
  echo "[chrome-live] Node ${NODE_MAJOR}.x < 22 — WebSocket built-in indisponível. Actualiza o Node." >&2
  exit 69
fi

# ── gate de verbos activos ──
if [ "$CLASS" = "active" ]; then
  MODE="$(prumo_mode)"

  # Contexto de audit: read-only é a regra; verbos activos exigem apply explícito
  # (paridade com prumo-base/pre-tool-audit-guard.sh, que não cobre `node cdp.mjs`).
  if { [ -f "${HOME}/.prumo/audit-active" ] || [ "${PRUMO_AUDIT_ACTIVE:-}" = "1" ]; } \
     && [ "${PRUMO_AUDIT_APPLY:-}" != "1" ]; then
    prumo_log "$PLUGIN" "$HOOK" "block active '$VERB' · audit context sem PRUMO_AUDIT_APPLY"
    {
      echo "[chrome-live] '$VERB' executa JS/muda estado de uma página autenticada — bloqueado em contexto de audit."
      echo "Audits são read-only. Para autorizar (após confirmação humana): export PRUMO_AUDIT_APPLY=1"
    } >&2
    exit 2
  fi

  # Gate de modo
  case "$MODE" in
    prod)
      if [ "${PRUMO_CHROME_LIVE_ACTIVE:-}" != "1" ]; then
        prumo_log "$PLUGIN" "$HOOK" "block active '$VERB' · prod sem PRUMO_CHROME_LIVE_ACTIVE"
        {
          echo "[chrome-live] modo prod: verbos activos ('$VERB') executam JS/cliques/escrita na tua sessão Chrome real."
          echo "Para autorizar nesta sessão: export PRUMO_CHROME_LIVE_ACTIVE=1   (ou passa a dev: /prumo-mode dev)"
        } >&2
        exit 2
      fi
      ;;
    dev)
      echo "[chrome-live] (dev) verbo activo '$VERB' permitido — audit-tracked." >&2
      ;;
    lab)
      : # bypass total
      ;;
  esac
fi

prumo_log "$PLUGIN" "$HOOK" "exec ${CLASS} '$VERB'"
exec node "$CDP" "$@"

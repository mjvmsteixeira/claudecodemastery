#!/usr/bin/env bash
# SessionStart hook (wire-base · vault-toolkit)
#
# Tenta deixar o Vault local operacional no arranque da sessão e injecta uma
# nota de contexto sobre onde vivem os segredos. Fica em silêncio se o Vault
# não está configurado nesta máquina — não polui o contexto.
#
# Variáveis que controlam comportamento (opcionais):
#   WIRE_VAULT_AUTO_UP=1     Em modo docker, arranca container se estiver down
#                           (default em dev/lab; off em prod a menos que set)
#   WIRE_OPERATING_MODE      prod | dev | lab — lido por wire-common.sh
#
# Integração com wire-secops · lifecycle complementar:
#   SessionStart (este hook)   → unseal + context note
#   PreToolUse (secops hook)   → valida TTL antes de operação privilegiada
set -euo pipefail

# Aponta para a lib unificada (era scripts/ no toolkit standalone; agora lib/ na base)
HELPER="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}/lib/vault-env.sh"
# shellcheck disable=SC1090
source "$HELPER"

emit() {
  printf '{"hookSpecificOutput": {"hookEventName": "SessionStart", "additionalContext": %s}}' \
    "$(printf '%s' "$1" | jq -Rs .)"
}

# ─────────────────────────────────────────────────────────────────────────────
# Modo docker: se daemon ou container ausentes, decide baseado em modo.
# ─────────────────────────────────────────────────────────────────────────────
if [ "$VAULT_MODE" = "docker" ]; then
  if ! docker info >/dev/null 2>&1; then
    _vlog "skip" "docker daemon down — silencioso"
    exit 0
  fi

  STATUS=$(docker inspect "$VAULT_CONTAINER" --format='{{.State.Status}}' 2>/dev/null || echo missing)

  if [ "$STATUS" != "running" ]; then
    # Container ausente ou parado. Em dev/lab (ou com WIRE_VAULT_AUTO_UP=1)
    # tenta arrancar via docker compose up -d no $VAULT_HOME. Em prod fica
    # silencioso — operador humano arranca via ./ops-vault.sh.
    if vault_arrange_up; then
      _vlog "action" "container brought up at session start"
    else
      _vlog "skip" "container not running and auto-up not allowed/possible"
      exit 0
    fi
  fi
fi

# ─────────────────────────────────────────────────────────────────────────────
# Container OK (ou modo native) → tentar unseal idempotente
# ─────────────────────────────────────────────────────────────────────────────
vault_ready || vault_unseal

if vault_ready; then
  _vlog "ok" "vault operational at session start (mode=$VAULT_MODE)"
  emit "Vault operational ($VAULT_ADDR, mode=$VAULT_MODE). Project secrets live under secret/projects/<name>/; shared secrets under secret/ai/, secret/tokens/, secret/credentials/, secret/infrastructure/. Use /vault-list, /vault-set, /vault-audit, /vault-backup during the session. For server health (HA, seal, audit device, AppRoles), use /wire-vault-doctor if wire-secops is installed."
elif [ -f "$VAULT_INIT" ]; then
  # Vault configurado nesta máquina mas auto-unseal falhou — vale a pena flag.
  _vlog "warn" "vault sealed and auto-unseal failed"
  emit "Vault is sealed and auto-unseal failed. Run: cd \$VAULT_HOME && ./ops-vault.sh unseal — or run /wire-vault-doctor for full diagnosis (if wire-secops is installed)."
fi

# Sem init file e not ready → Vault não configurado nesta máquina. Silencioso.
exit 0

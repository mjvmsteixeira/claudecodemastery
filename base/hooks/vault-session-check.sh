#!/usr/bin/env bash
# SessionStart hook (prumo-base · vault-toolkit)
#
# Tenta deixar o Vault local operacional no arranque da sessão e injecta uma
# nota de contexto sobre onde vivem os segredos. Fica em silêncio se o Vault
# não está configurado nesta máquina — não polui o contexto.
#
# Variáveis que controlam comportamento (opcionais):
#   PRUMO_VAULT_AUTO_UP=1     Em modo docker, arranca container se estiver down
#                           (default em dev/lab; off em prod a menos que set)
#   PRUMO_OPERATING_MODE      prod | dev | lab — lido por prumo-common.sh
#
# Integração com prumo-secops · lifecycle complementar:
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
# Rotação dos logs do prumo · uma verificação por sessão, não por escrita.
#
# `prumo_log` e `prumo_telemetry_record` fazem `>>` incondicional — nada rodava.
# Medido a 2026-08-04: cef.log 28 MB/84 973 linhas, telemetry.tsv 18 MB/373 691.
# Pôr o teste de tamanho dentro do writer custaria um `stat` por escrita, dezenas
# de milhares de vezes por dia; aqui custa um por sessão.
#
# Corre ANTES do bloco docker de propósito: esse ramo tem `exit 0` a meio e a
# rotação não pode depender do estado do Vault.
#
# Um só nível de histórico (.1). Quem quiser retenção a sério monta newsyslog —
# o objectivo aqui é ter tecto, não arquivo.
# ─────────────────────────────────────────────────────────────────────────────
_prumo_rotate_logs() {
  local dir="${PRUMO_LOG_DIR:-$HOME/.prumo/log}" max=$((10 * 1024 * 1024)) f sz
  [ -d "$dir" ] || return 0
  for f in "$dir"/*.log "$dir"/*.tsv; do
    [ -f "$f" ] || continue
    sz=$(stat -f%z "$f" 2>/dev/null || stat -c%s "$f" 2>/dev/null || echo 0)
    [ "$sz" -gt "$max" ] 2>/dev/null || continue
    mv -f "$f" "$f.1" 2>/dev/null || true
    _vlog "rotate" "$(basename "$f") rodado a ${sz} bytes"
  done
}
_prumo_rotate_logs

# Este hook é idempotente: correr de novo à mão dessela com as chaves de
# $VAULT_INIT, sem pedir nada. É o que as notas abaixo mandam fazer.
SELF="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"
RERUN="bash '$SELF'"

# ─────────────────────────────────────────────────────────────────────────────
# Servidor em Docker: se daemon ou container ausentes, decide baseado em modo.
# Vale também em modo native com o servidor num container (vault_server_in_docker):
# antes, com o Docker parado, o hook dizia "auto-unseal failed" e mandava para o
# `ops-vault.sh unseal`, que pede as chaves à mão.
# ─────────────────────────────────────────────────────────────────────────────
if vault_server_in_docker; then
  if ! docker info >/dev/null 2>&1; then
    _vlog "skip" "docker daemon down"
    [ -f "$VAULT_INIT" ] && emit "Vault unavailable: the Docker daemon is not running. After starting Docker the Vault comes up sealed; unseal it without typing keys by running: $RERUN"
    exit 0
  fi

  STATUS=$(docker inspect "$VAULT_CONTAINER" --format='{{.State.Status}}' 2>/dev/null || echo missing)

  if [ "$STATUS" != "running" ]; then
    # Container ausente ou parado. Em dev/lab (ou com PRUMO_VAULT_AUTO_UP=1)
    # tenta arrancar via docker compose up -d no $VAULT_HOME. Em prod não
    # arranca — operador humano arranca via ./ops-vault.sh.
    if vault_arrange_up; then
      _vlog "action" "container brought up at session start"
    else
      _vlog "skip" "container not running and auto-up not allowed/possible"
      [ -f "$VAULT_INIT" ] && emit "Vault unavailable: container '$VAULT_CONTAINER' is $STATUS. Start it (cd \$VAULT_HOME && docker compose up -d), then unseal without typing keys: $RERUN"
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
  emit "Vault operational ($VAULT_ADDR, mode=$VAULT_MODE). Project secrets live under secret/projects/<name>/; shared secrets under secret/ai/, secret/tokens/, secret/credentials/, secret/infrastructure/. Use /vault-list, /vault-set, /vault-audit, /vault-backup during the session. For server health (HA, seal, audit device, AppRoles), use /prumo-vault-doctor if prumo-secops is installed."
elif [ -f "$VAULT_INIT" ]; then
  # Vault configurado nesta máquina mas não ficou operacional. Distinguir
  # "não responde" (re-correr o hook resolve) de "selado apesar das chaves"
  # (aí sim, chaves à mão).
  sealed="$(V status -format=json 2>/dev/null | jq -r '.sealed | tostring' 2>/dev/null || true)"
  if [ "$sealed" = "true" ]; then
    _vlog "warn" "vault still sealed after unseal with $VAULT_INIT"
    emit "Vault is still sealed: the unseal keys in $VAULT_INIT did not unseal it. Unseal by hand (prompts for keys): cd \$VAULT_HOME && ./ops-vault.sh unseal — or run /prumo-vault-doctor for full diagnosis (if prumo-secops is installed)."
  else
    _vlog "warn" "vault not reachable at $VAULT_ADDR"
    emit "Vault not reachable at $VAULT_ADDR (mode=$VAULT_MODE). Start the server, then unseal without typing keys: $RERUN — or run /prumo-vault-doctor for full diagnosis (if prumo-secops is installed)."
  fi
fi

# Sem init file e not ready → Vault não configurado nesta máquina. Silencioso.
exit 0

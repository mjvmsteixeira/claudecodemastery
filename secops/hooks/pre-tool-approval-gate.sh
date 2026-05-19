#!/usr/bin/env bash
# Wire SecOps · pre-tool · Approval gate (N1/N2/N3)
#
# Env-var-based — NÃO interactivo. Pattern: WIRE_APPROVE=Nx <comando>
#
# Robustez (v0.4.0):
#   - $CMD é normalizado: newlines→espaços, tabs→espaços. Defesa contra payloads
#     multi-line tipo "DROP\nTABLE foo" que escapariam regex line-oriented grep.
#   - flag-matchers em rm/git aceitam combinações (-rf, -fr, -rfv, --force-with-lease).
#   - DROP TABLE aceita SQL comments inline (DROP/**/TABLE).
#   - cap production deploy não é anchored ao fim de linha (aceita --branch X etc).

set -euo pipefail
# shellcheck source=_lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

# Normaliza whitespace: newlines+tabs viram espaços simples para que grep line-
# oriented veja o comando como uma única linha. Idempotente em comandos curtos.
RAW_CMD=$(hook_tool_payload "${1:-}")
CMD=$(printf '%s' "$RAW_CMD" | tr '\n\t' '  ')

LEVEL=""

match() {
  # match <pattern> — true se $CMD bate o pattern extendido case-insensitive
  echo "$CMD" | grep -qiE "$1"
}

# ────────────────────────────────────────────────────────────────────────────
# N3 — catastrophic (parar no primeiro match)
# ────────────────────────────────────────────────────────────────────────────

# rm com flags variáveis (-rf, -fr, -rfv, --no-preserve-root etc) contra
# /forensics. Aceita zero ou mais grupos de flags antes do target.
if [ -z "$LEVEL" ] && match 'rm[[:space:]]+([-][^/[:space:]]+[[:space:]]+)*/forensics(/|[[:space:]]|$)'; then
  LEVEL="N3"
fi
if [ -z "$LEVEL" ] && match 'systemctl[[:space:]]+(stop|disable)\b'; then
  LEVEL="N3"
fi
if [ -z "$LEVEL" ] && match 'vault[[:space:]]+secrets[[:space:]]+disable\b'; then
  LEVEL="N3"
fi
# cap production deploy SEM :rollback (esse cai em N2). Non-anchored — aceita
# args trailing como --branch main, --dry-run, etc. Negative-lookahead em ERE
# é simulado: matchar 'deploy' seguido de espaço/EOL e NÃO ':rollback' adjacente.
if [ -z "$LEVEL" ] && match 'cap[[:space:]]+production[[:space:]]+deploy([[:space:]]|$)' \
   && ! match 'cap[[:space:]]+production[[:space:]]+deploy:rollback\b'; then
  LEVEL="N3"
fi

# ────────────────────────────────────────────────────────────────────────────
# N2 — cross-tenant ou prod data
# ────────────────────────────────────────────────────────────────────────────

# DROP TABLE/DATABASE/SCHEMA aceita comments inline tipo DROP/**/TABLE.
# `.{0,40}` cobre comments curtos sem perder especificidade.
if [ -z "$LEVEL" ] && match 'DROP.{0,40}(TABLE|DATABASE|SCHEMA)\b'; then
  LEVEL="N2"
fi
if [ -z "$LEVEL" ] && match 'cap[[:space:]]+production[[:space:]]+deploy:rollback\b'; then
  LEVEL="N2"
fi
if [ -z "$LEVEL" ] && match 'vault[[:space:]]+token[[:space:]]+revoke[[:space:]]+-accessor\b'; then
  LEVEL="N2"
fi

# ────────────────────────────────────────────────────────────────────────────
# N1 — destrutivo local
# ────────────────────────────────────────────────────────────────────────────

if [ -z "$LEVEL" ] && match 'truncate[[:space:]]+TABLE\b'; then
  LEVEL="N1"
fi
# git push aceita -f, --force, --force-with-lease (com ou sem =branch)
if [ -z "$LEVEL" ] && match 'git[[:space:]]+push[[:space:]]+([^[:space:]]+[[:space:]]+)*(-f\b|--force\b|--force-with-lease\b)'; then
  LEVEL="N1"
fi
# rm de $HOME ou /tmp com flags variáveis
if [ -z "$LEVEL" ] && match 'rm[[:space:]]+([-][^/[:space:]]+[[:space:]]+)*\$HOME(/|[[:space:]]|$)'; then
  LEVEL="N1"
fi
if [ -z "$LEVEL" ] && match 'rm[[:space:]]+([-][^/[:space:]]+[[:space:]]+)*/tmp(/|[[:space:]]|$)'; then
  LEVEL="N1"
fi

# Não-destrutivo → passa
[ -z "$LEVEL" ] && exit 0

# ────────────────────────────────────────────────────────────────────────────
# Gate
# ────────────────────────────────────────────────────────────────────────────

if [ "${WIRE_APPROVE:-}" != "$LEVEL" ]; then
  CMD_PREVIEW=$(printf '%s' "$CMD" | head -c 100)
  cat >&2 <<EOF
[hook] approval-gate · Operação ${LEVEL} detectada:
  ${CMD_PREVIEW}

Para autorizar, re-executa com:
  WIRE_APPROVE=${LEVEL} <comando>

Níveis (Wire SecOps):
  N1 = destrutivo local
  N2 = cross-tenant ou prod data
  N3 = catastrophic

Audit log: ${WIRE_LOG_DIR:-\$HOME/.wire/log}/approvals.log
EOF
  exit 2
fi

# ────────────────────────────────────────────────────────────────────────────
# Autorizado — log (best-effort; falha de I/O não bloqueia decisão)
# ────────────────────────────────────────────────────────────────────────────

LOG_DIR="${WIRE_LOG_DIR:-$HOME/.wire/log}"
if mkdir -p "$LOG_DIR" 2>/dev/null; then
  CMD_LOG=$(printf '%s' "$CMD" | head -c 200)
  echo "$(date -u +%FT%TZ) | level=$LEVEL | user=${USER:-unknown} | cmd=${CMD_LOG}" \
    >> "$LOG_DIR/approvals.log" 2>/dev/null || true
fi
echo "[hook] approval-gate · ${LEVEL} authorised by WIRE_APPROVE env var · logged." >&2

exit 0

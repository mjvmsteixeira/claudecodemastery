#!/usr/bin/env bash
# Wire SecOps · pre-tool · PII fail-closed gate

set -euo pipefail
# shellcheck source=_lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

INPUT=$(hook_tool_payload "${1:-}")

if [ "${PRUMO_PII_DISABLE:-}" = "1" ]; then
  echo "[hook] pii-redact · PRUMO_PII_DISABLE=1 — bypass (NÃO recomendado em prod)" >&2
  exit 0
fi

# Skip binary content (portable — BSD grep não tem -P; usa tr-delete + wc)
if [ "$(printf '%s' "$INPUT" | LC_ALL=C tr -d '\t\n\r\040-\176' | wc -c | tr -d ' ')" != "0" ]; then
  exit 0
fi

VIOLATIONS=()

# NIF (9 digits, first 1-9)
if echo "$INPUT" | grep -qE '\b[1-9][0-9]{2}[[:space:]]?[0-9]{3}[[:space:]]?[0-9]{3}\b'; then
  VIOLATIONS+=("NIF")
fi

# IBAN PT
if echo "$INPUT" | grep -qE '\bPT[0-9]{2}[[:space:]]?[0-9]{4}[[:space:]]?[0-9]{4}[[:space:]]?[0-9]{4}[[:space:]]?[0-9]{4}[[:space:]]?[0-9]{3}[[:space:]]?[0-9]{2}\b'; then
  VIOLATIONS+=("IBAN-PT")
fi

# CC PT
if echo "$INPUT" | grep -qE '\b[0-9]{8}[[:space:]][0-9][[:space:]][A-Z]{2}[0-9]\b'; then
  VIOLATIONS+=("CC-PT")
fi

# Email
if echo "$INPUT" | grep -qE '\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b'; then
  VIOLATIONS+=("email")
fi

# Telefone PT — 9 dígitos começando em 2/3/9, opcionalmente +351
if echo "$INPUT" | grep -qE '(\+351[[:space:]]?)?[239][0-9]{2}[[:space:]]?[0-9]{3}[[:space:]]?[0-9]{3}\b'; then
  VIOLATIONS+=("telefone-PT")
fi

if [ "${#VIOLATIONS[@]}" -eq 0 ]; then
  exit 0
fi

LOG_DIR="${PRUMO_LOG_DIR:-$HOME/.prumo/log}"
mkdir -p "$LOG_DIR" 2>/dev/null || LOG_DIR=$(mktemp -d)
HASH=$(printf '%s' "$INPUT" | shasum -a 256 | awk '{print $1}')
TYPES=$(IFS=,; echo "${VIOLATIONS[*]}")
echo "$(date -u +%FT%TZ) | input_hash=${HASH} | types=${TYPES} | user=${USER:-unknown}" \
  >> "$LOG_DIR/pii-blocks.log" 2>/dev/null || true

cat >&2 <<EOF
[hook] pii-redact · PII detectado no input: ${TYPES}

Redact antes de re-enviar. Substitui com placeholder ([NIF], [IBAN], [EMAIL])
ou usa Vault para fetch dinâmico em vez de embedar.

Audit log: ${LOG_DIR}/pii-blocks.log

Em dev podes desactivar temporariamente:
  PRUMO_PII_DISABLE=1 <comando>
EOF

exit 2

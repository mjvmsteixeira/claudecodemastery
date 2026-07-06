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

# Skip binário real (portável — BSD grep não tem -P). O heurístico antigo
# fazia tr-delete de \t\n\r + ASCII imprimível (\040-\176) e assumia binário
# se sobrasse QUALQUER byte — mas isso inclui os bytes >=0x80 de qualquer
# acento UTF-8 (ã, ç, é...), o que desligava o gate de PII em texto normal em
# português. Fix: também descartar a gama de bytes altos (\200-\377, cobre
# lead/continuation bytes UTF-8) antes de decidir — só resta algo se houver
# bytes de controlo C0 verdadeiros (excepto tab/lf/cr), que são o sinal real
# de conteúdo binário.
if [ "$(printf '%s' "$INPUT" | LC_ALL=C tr -d '\t\n\r\040-\176\200-\377' | wc -c | tr -d ' ')" != "0" ]; then
  exit 0
fi

VIOLATIONS=()

# NIF (9 dígitos, primeiro 1-9). Separador opcional entre grupos — espaço ou
# traço (ou nenhum, ex: "NIF 123456789" contíguo). SEM ponto: um NIF PT é 9
# dígitos contíguos opcionalmente agrupados por espaço, nunca por ponto — o
# separador "." fazia esta regex false-match em números decimais/agrupados
# como "1.234.567.890".
if echo "$INPUT" | grep -qiE '\b[1-9][0-9]{2}[[:space:]-]?[0-9]{3}[[:space:]-]?[0-9]{3}\b'; then
  VIOLATIONS+=("NIF")
fi

# IBAN PT — -i para apanhar prefixo "pt" em minúsculas
if echo "$INPUT" | grep -qiE '\bPT[0-9]{2}[[:space:]]?[0-9]{4}[[:space:]]?[0-9]{4}[[:space:]]?[0-9]{4}[[:space:]]?[0-9]{4}[[:space:]]?[0-9]{3}[[:space:]]?[0-9]{2}\b'; then
  VIOLATIONS+=("IBAN-PT")
fi

# CC PT — espaço entre grupos agora opcional (nº CC surge frequentemente sem
# separador, ex: "12345678 9ZZ4" vs "123456789ZZ4")
if echo "$INPUT" | grep -qiE '\b[0-9]{8}[[:space:]]?[0-9][[:space:]]?[A-Z]{2}[0-9]\b'; then
  VIOLATIONS+=("CC-PT")
fi

# Email
if echo "$INPUT" | grep -qiE '\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b'; then
  VIOLATIONS+=("email")
fi

# Telefone PT — 9 dígitos começando em 2/3/9, opcionalmente +351
if echo "$INPUT" | grep -qiE '(\+351[[:space:]]?)?[239][0-9]{2}[[:space:]]?[0-9]{3}[[:space:]]?[0-9]{3}\b'; then
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

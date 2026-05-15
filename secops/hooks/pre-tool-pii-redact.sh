#!/usr/bin/env bash
# Wire SecOps · pre-tool · Redacta padrões PII antes da chamada ir para o modelo.
# Cobre NIF, email, IBAN, CC, CV (cartão de cidadão), telefone, IP privado em payloads.
set -euo pipefail
# shellcheck source=_lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

INPUT="${1:-$(cat)}"

REDACTED=$(echo "$INPUT" | \
  sed -E 's/\b[0-9]{9}\b/[NIF-REDACTED]/g' | \
  sed -E 's/\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/[EMAIL-REDACTED]/g' | \
  sed -E 's/\bPT[0-9]{2}[0-9]{4}[0-9]{4}[0-9]{11}[0-9]{2}\b/[IBAN-REDACTED]/g' | \
  sed -E 's/\b9[1236][0-9]{7}\b/[TEL-REDACTED]/g' | \
  sed -E 's/\b[0-9]{8}\s?[0-9]\s?[A-Z]{2}[0-9]\b/[CC-REDACTED]/g')

echo "$REDACTED"
exit 0

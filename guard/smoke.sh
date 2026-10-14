#!/usr/bin/env bash
# prumo-guard · smoke — valida o manifesto e o módulo, e corre os testes do mod.
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
command -v claude >/dev/null 2>&1 || { echo "prumo-guard smoke: CLI claude ausente — saltado"; exit 0; }
claude plugin validate "$DIR" || exit 1
claude plugin test "$DIR" || exit 1
echo "✓ prumo-guard smoke"

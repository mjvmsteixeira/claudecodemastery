#!/usr/bin/env bash
# prumo · eval-harness · self-test (teste de mutação)
#
# Prova que o harness DETECTA regressões: parte um hook de propósito e confirma
# que run.sh passa a vermelho (exit != 0). Se o harness continuasse verde com um
# hook partido, estaria a testar nada. Restaura o hook no fim (sempre).
set -uo pipefail

EVAL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$EVAL_DIR/../.." && pwd)"
TARGET="$REPO_ROOT/secops/hooks/pre-tool-vault-ttl.sh"
BACKUP="$(mktemp "${TMPDIR:-/tmp}/prumo-selftest.XXXXXX")"

restore() { cp "$BACKUP" "$TARGET"; rm -f "$BACKUP"; }
trap restore EXIT

cp "$TARGET" "$BACKUP"

echo "1. baseline verde?"
if ! "$EVAL_DIR/run.sh" --hook vault-ttl --quiet >/dev/null 2>&1; then
  echo "   ✗ o corpus já está vermelho ANTES da mutação — corrige isso primeiro." >&2
  exit 1
fi
echo "   ✓ baseline verde"

echo "2. mutação: injectar 'exit 0' no topo do vault-ttl (allow-tudo)…"
# insere um exit 0 logo após a linha do set, neutralizando o gate
awk 'NR==1{print; next} /^set / && !done {print; print "exit 0  # MUTACAO-SELFTEST"; done=1; next} {print}' \
  "$BACKUP" > "$TARGET"

echo "3. o harness deve agora ficar VERMELHO…"
if "$EVAL_DIR/run.sh" --hook vault-ttl --quiet >/dev/null 2>&1; then
  echo "   ✗ FALHA: harness continua verde com o hook partido — está cego!" >&2
  exit 1
fi
echo "   ✓ harness detectou a regressão (ficou vermelho)"

echo
echo "✓ self-test passou: o harness deteta regressões reais."

#!/usr/bin/env bash
# prumo · eval · security-scan-test.sh
# Corre os scanners determinísticos (semgrep/gitleaks) contra as fixtures e compara
# com expected.jsonl. Soft-deps: sem scanner → SKIP reportado (exit 0), nunca falso-verde.
# Exit 0 verde/skip · 1 mismatch.
set -uo pipefail

EVAL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FIX="$EVAL_DIR/security-scan-fixtures"
EXPECTED="$FIX/expected.jsonl"
PASS=0; FAIL=0; SKIP=0

command -v jq >/dev/null 2>&1 || { echo "jq necessário" >&2; exit 2; }
[ -f "$EXPECTED" ] || { echo "expected.jsonl ausente" >&2; exit 2; }

ok()   { echo "  ✓ $*"; PASS=$((PASS+1)); }
bad()  { echo "  ✗ $*"; FAIL=$((FAIL+1)); }
skip() { echo "  ~ SKIP $*"; SKIP=$((SKIP+1)); }

have_semgrep=0; command -v semgrep >/dev/null 2>&1 && have_semgrep=1
have_gitleaks=0; command -v gitleaks >/dev/null 2>&1 && have_gitleaks=1

# ── camada semgrep ────────────────────────────────────────────────────────────
if [ "$have_semgrep" = 1 ]; then
  sarif="$(mktemp)"
  semgrep --config p/owasp-top-ten --sarif --quiet "$FIX/vuln-python" > "$sarif" 2>/dev/null || true
  n_hits=$(jq '[.runs[].results[]] | length' "$sarif" 2>/dev/null || echo 0)
  if [ "${n_hits:-0}" -ge 1 ]; then
    ok "semgrep disparou em vuln-python ($n_hits findings)"
  else
    bad "semgrep NÃO disparou em vuln-python (esperado ≥1)"
  fi
  # controlo negativo
  semgrep --config p/owasp-top-ten --sarif --quiet "$FIX/clean-sample" > "$sarif" 2>/dev/null || true
  n_clean=$(jq '[.runs[].results[]] | length' "$sarif" 2>/dev/null || echo 0)
  if [ "${n_clean:-0}" -eq 0 ]; then
    ok "semgrep limpo em clean-sample (0 findings)"
  else
    bad "semgrep disparou em clean-sample ($n_clean — falso-positivo)"
  fi
  rm -f "$sarif"
else
  skip "semgrep ausente — camada de código não exercida"
fi

# ── camada gitleaks ───────────────────────────────────────────────────────────
if [ "$have_gitleaks" = 1 ]; then
  rep="$(mktemp)"
  gitleaks detect --no-banner --no-git --source "$FIX/secrets-sample" \
    --report-format json --report-path "$rep" >/dev/null 2>&1 || true
  n_sec=$(jq 'length' "$rep" 2>/dev/null || echo 0)
  if [ "${n_sec:-0}" -ge 2 ]; then
    ok "gitleaks disparou nos secrets fake ($n_sec)"
  else
    bad "gitleaks NÃO disparou nos secrets fake (esperado ≥2, obteve ${n_sec:-0})"
  fi
  rm -f "$rep"
else
  skip "gitleaks ausente — camada de secrets não exercida"
fi

echo
echo "  passed=$PASS  failed=$FAIL  skipped=$SKIP"
[ "$FAIL" -gt 0 ] && exit 1
exit 0

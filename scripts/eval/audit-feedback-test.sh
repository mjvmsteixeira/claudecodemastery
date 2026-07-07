#!/usr/bin/env bash
# prumo · eval-harness · testes do loop de feedback dos audits (Fase 04)
# Camada 1 (Task 1): reconciliador — fingerprint estável + ciclo new/recurring/fixed +
#   supressão de aceites (store pré-semeado) + métricas. Camada 2 (Task 2): accept.
set -uo pipefail
EVAL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$EVAL_DIR/../.." && pwd)"
RECON="$REPO_ROOT/devkit/lib/audit-reconcile.sh"
FAILS=0
ok()  { printf '  ✓ %s\n' "$1"; }
bad() { printf '  ✗ %s\n' "$1"; FAILS=$((FAILS+1)); }

SANDBOX="$(mktemp -d "${TMPDIR:-/tmp}/prumo-af.XXXXXX")"
cleanup() { rm -rf "$SANDBOX"; }
trap cleanup EXIT

# helper: escreve um ficheiro de findings JSONL
mkfind() { printf '%s\n' "$@" > "$SANDBOX/f.jsonl"; echo "$SANDBOX/f.jsonl"; }
STORE="$SANDBOX/state/state.json"
runrec() { bash "$RECON" --audit security-scan --findings "$1" --state-dir "$SANDBOX/state"; }
fps() { jq -r '.findings | keys[]' "$STORE" 2>/dev/null | sort; }
status_of() { jq -r --arg fp "$1" '.findings[$fp].status' "$STORE"; }

# ── fingerprint estável: mesmo file/rule/symbol, título diferente → mesmo fp ───
rm -rf "$SANDBOX/state"
A='{"file":"src/a.py","rule":"A01-access","symbol":"admin_del","severity":"high","title":"endpoint sem auth linha 10"}'
runrec "$(mkfind "$A")" >/dev/null 2>&1
FP1=$(jq -r '.findings|keys[0]' "$STORE")
rm -rf "$SANDBOX/state"
B='{"file":"src/a.py","rule":"A01-access","symbol":"admin_del","severity":"high","title":"OUTRO texto linha 999"}'
runrec "$(mkfind "$B")" >/dev/null 2>&1
FP2=$(jq -r '.findings|keys[0]' "$STORE")
[ "$FP1" = "$FP2" ] && ok "fp estável: símbolo manda, título/linha ignorados" || bad "fp mudou com título ($FP1 != $FP2)"

# símbolo diferente → fp diferente
rm -rf "$SANDBOX/state"
C='{"file":"src/a.py","rule":"A01-access","symbol":"OUTRO_sym","severity":"high","title":"x"}'
runrec "$(mkfind "$C")" >/dev/null 2>&1
FP3=$(jq -r '.findings|keys[0]' "$STORE")
[ "$FP3" != "$FP1" ] && ok "fp sensível a mudança de símbolo" || bad "fp não mudou com símbolo"

# sem símbolo: título normalizado (dígitos/caixa ignorados) → mesmo fp
rm -rf "$SANDBOX/state"
D1='{"file":"src/b.py","rule":"A03-injection","severity":"high","title":"SQL Injection 5"}'
runrec "$(mkfind "$D1")" >/dev/null 2>&1; FPD1=$(jq -r '.findings|keys[0]' "$STORE")
rm -rf "$SANDBOX/state"
D2='{"file":"src/b.py","rule":"A03-injection","severity":"high","title":"sql   injection 9"}'
runrec "$(mkfind "$D2")" >/dev/null 2>&1; FPD2=$(jq -r '.findings|keys[0]' "$STORE")
[ "$FPD1" = "$FPD2" ] && ok "fp: título normalizado (sem símbolo)" || bad "fp: normalização de título falhou"

# ── ciclo de vida: new → recurring → fixed ────────────────────────────────────
rm -rf "$SANDBOX/state"
F_A='{"file":"src/x.py","rule":"A01-access","symbol":"fa","severity":"high","title":"A"}'
F_B='{"file":"src/y.py","rule":"A02-crypto","symbol":"fb","severity":"medium","title":"B"}'
F_C='{"file":"src/z.py","rule":"A03-injection","symbol":"fc","severity":"critical","title":"C"}'
OUT1=$(runrec "$(mkfind "$F_A" "$F_B" "$F_C")" 2>&1)
[ "$(jq '.findings|length' "$STORE")" = "3" ] && ok "corrida1: 3 findings no store" || bad "corrida1: store != 3"
printf '%s' "$OUT1" | grep -q "novos: 3" && ok "corrida1: métricas novos=3" || bad "corrida1: métricas erradas"
FA=$(jq -r '.findings|to_entries[]|select(.value.title=="A")|.key' "$STORE")
FC=$(jq -r '.findings|to_entries[]|select(.value.title=="C")|.key' "$STORE")

# corrida2: A e B presentes, C desaparece → C fixed, A/B recorrentes
OUT2=$(runrec "$(mkfind "$F_A" "$F_B")" 2>&1)
[ "$(status_of "$FC")" = "fixed" ] && ok "corrida2: C marcado fixed (desapareceu)" || bad "corrida2: C não ficou fixed"
[ "$(status_of "$FA")" = "open" ] && ok "corrida2: A continua open (recorrente)" || bad "corrida2: A mudou de estado"
printf '%s' "$OUT2" | grep -q "recorrentes: 2" && ok "corrida2: métricas recorrentes=2" || bad "corrida2: recorrentes != 2"
printf '%s' "$OUT2" | grep -q "corrigidos: 1" && ok "corrida2: métricas corrigidos=1" || bad "corrida2: corrigidos != 1"

# corrida3: C reaparece → reabre para open
OUT3=$(runrec "$(mkfind "$F_A" "$F_B" "$F_C")" 2>&1)
[ "$(status_of "$FC")" = "open" ] && ok "corrida3: C reaberto (reapareceu)" || bad "corrida3: C não reabriu"

# ── supressão de aceites: store pré-semeado com A accepted ────────────────────
tmp=$(mktemp); jq --arg fp "$FA" '.findings[$fp].status="accepted"' "$STORE" > "$tmp" && mv "$tmp" "$STORE"
OUT4=$(runrec "$(mkfind "$F_A" "$F_B" "$F_C")" 2>&1)
[ "$(status_of "$FA")" = "accepted" ] && ok "aceite: A mantém-se accepted" || bad "aceite: A perdeu accepted"
printf '%s' "$OUT4" | grep -q "aceites(suprimidos): 1" && ok "aceite: contado como suprimido" || bad "aceite: não suprimido"
printf '%s' "$OUT4" | grep -vqE "^  \[high\] $FA " && ok "aceite: A não listado nos novos/recorrentes" || bad "aceite: A ainda listado"

echo
if [ "$FAILS" -eq 0 ]; then echo "✓ audit-feedback-test (reconciliador) passou."; else echo "✗ $FAILS falha(s)."; exit 1; fi

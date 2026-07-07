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
if [ "$FP1" = "$FP2" ]; then ok "fp estável: símbolo manda, título/linha ignorados"; else bad "fp mudou com título ($FP1 != $FP2)"; fi

# símbolo diferente → fp diferente
rm -rf "$SANDBOX/state"
C='{"file":"src/a.py","rule":"A01-access","symbol":"OUTRO_sym","severity":"high","title":"x"}'
runrec "$(mkfind "$C")" >/dev/null 2>&1
FP3=$(jq -r '.findings|keys[0]' "$STORE")
if [ "$FP3" != "$FP1" ]; then ok "fp sensível a mudança de símbolo"; else bad "fp não mudou com símbolo"; fi

# sem símbolo: título normalizado (dígitos/caixa ignorados) → mesmo fp
rm -rf "$SANDBOX/state"
D1='{"file":"src/b.py","rule":"A03-injection","severity":"high","title":"SQL Injection 5"}'
runrec "$(mkfind "$D1")" >/dev/null 2>&1; FPD1=$(jq -r '.findings|keys[0]' "$STORE")
rm -rf "$SANDBOX/state"
D2='{"file":"src/b.py","rule":"A03-injection","severity":"high","title":"sql   injection 9"}'
runrec "$(mkfind "$D2")" >/dev/null 2>&1; FPD2=$(jq -r '.findings|keys[0]' "$STORE")
if [ "$FPD1" = "$FPD2" ]; then ok "fp: título normalizado (sem símbolo)"; else bad "fp: normalização de título falhou"; fi

# ── ciclo de vida: new → recurring → fixed ────────────────────────────────────
rm -rf "$SANDBOX/state"
F_A='{"file":"src/x.py","rule":"A01-access","symbol":"fa","severity":"high","title":"A"}'
F_B='{"file":"src/y.py","rule":"A02-crypto","symbol":"fb","severity":"medium","title":"B"}'
F_C='{"file":"src/z.py","rule":"A03-injection","symbol":"fc","severity":"critical","title":"C"}'
OUT1=$(runrec "$(mkfind "$F_A" "$F_B" "$F_C")" 2>&1)
if [ "$(jq '.findings|length' "$STORE")" = "3" ]; then ok "corrida1: 3 findings no store"; else bad "corrida1: store != 3"; fi
if printf '%s' "$OUT1" | grep -q "novos: 3"; then ok "corrida1: métricas novos=3"; else bad "corrida1: métricas erradas"; fi
FA=$(jq -r '.findings|to_entries[]|select(.value.title=="A")|.key' "$STORE")
FC=$(jq -r '.findings|to_entries[]|select(.value.title=="C")|.key' "$STORE")

# corrida2: A e B presentes, C desaparece → C fixed, A/B recorrentes
OUT2=$(runrec "$(mkfind "$F_A" "$F_B")" 2>&1)
if [ "$(status_of "$FC")" = "fixed" ]; then ok "corrida2: C marcado fixed (desapareceu)"; else bad "corrida2: C não ficou fixed"; fi
if [ "$(status_of "$FA")" = "open" ]; then ok "corrida2: A continua open (recorrente)"; else bad "corrida2: A mudou de estado"; fi
if printf '%s' "$OUT2" | grep -q "recorrentes: 2"; then ok "corrida2: métricas recorrentes=2"; else bad "corrida2: recorrentes != 2"; fi
if printf '%s' "$OUT2" | grep -q "corrigidos: 1"; then ok "corrida2: métricas corrigidos=1"; else bad "corrida2: corrigidos != 1"; fi

# corrida3: C reaparece → reabre para open
runrec "$(mkfind "$F_A" "$F_B" "$F_C")" >/dev/null 2>&1
if [ "$(status_of "$FC")" = "open" ]; then ok "corrida3: C reaberto (reapareceu)"; else bad "corrida3: C não reabriu"; fi

# ── supressão de aceites: store pré-semeado com A accepted ────────────────────
tmp=$(mktemp); jq --arg fp "$FA" '.findings[$fp].status="accepted"' "$STORE" > "$tmp" && mv "$tmp" "$STORE"
OUT4=$(runrec "$(mkfind "$F_A" "$F_B" "$F_C")" 2>&1)
if [ "$(status_of "$FA")" = "accepted" ]; then ok "aceite: A mantém-se accepted"; else bad "aceite: A perdeu accepted"; fi
if printf '%s' "$OUT4" | grep -q "aceites(suprimidos): 1"; then ok "aceite: contado como suprimido"; else bad "aceite: não suprimido"; fi
if printf '%s' "$OUT4" | grep -vqE "^  \[high\] $FA "; then ok "aceite: A não listado nos novos/recorrentes"; else bad "aceite: A ainda listado"; fi


# ── camada 2: accept + auto-promoção ──────────────────────────────────────────
ACCEPT="$REPO_ROOT/devkit/lib/audit-accept.sh"
# estado limpo com um finding conhecido
rm -rf "$SANDBOX/state"; RULES="$SANDBOX/rules/audit/security.md"; rm -f "$RULES"
G='{"file":"src/g.py","rule":"A05-misconfig","symbol":"gg","severity":"medium","title":"CORS aberto"}'
runrec "$(mkfind "$G")" >/dev/null 2>&1
FG=$(jq -r '.findings|keys[0]' "$STORE")

bash "$ACCEPT" --state-dir "$SANDBOX/state" --rules-file "$RULES" "$FG" "interno, sem exposição" >/dev/null 2>&1
if [ "$(status_of "$FG")" = "accepted" ]; then ok "accept: status=accepted no store"; else bad "accept: status não mudou"; fi
if [ "$(jq -r --arg fp "$FG" '.findings[$fp].accepted_reason' "$STORE")" = "interno, sem exposição" ]; then ok "accept: razão gravada"; else bad "accept: razão não gravada"; fi
if [ -f "$RULES" ] && grep -qF "$FG" "$RULES"; then ok "accept: auto-promovido ao rules-file"; else bad "accept: rules-file sem o fp"; fi
if grep -qE '^## Excepções autorizadas \(auto\)' "$RULES"; then ok "accept: secção criada no rules-file"; else bad "accept: secção ausente"; fi

# idempotente: aceitar de novo não duplica
bash "$ACCEPT" --state-dir "$SANDBOX/state" --rules-file "$RULES" "$FG" "outra vez" >/dev/null 2>&1
if [ "$(grep -cF "$FG" "$RULES")" = "1" ]; then ok "accept: idempotente (1 linha)"; else bad "accept: duplicou no rules-file"; fi

# aceite é suprimido na corrida seguinte
OUT5=$(runrec "$(mkfind "$G")" 2>&1)
if printf '%s' "$OUT5" | grep -q "aceites(suprimidos): 1"; then ok "accept: suprimido na corrida seguinte"; else bad "accept: não suprimido pós-accept"; fi

# fp inexistente → erro
if bash "$ACCEPT" --state-dir "$SANDBOX/state" --rules-file "$RULES" "deadbeef0000" "x" >/dev/null 2>&1; then bad "accept: fp inexistente devia falhar"; else ok "accept: fp inexistente rejeitado"; fi

echo
if [ "$FAILS" -eq 0 ]; then echo "✓ audit-feedback-test (reconciliador) passou."; else echo "✗ $FAILS falha(s)."; exit 1; fi

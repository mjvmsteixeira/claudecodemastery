#!/usr/bin/env bash
# prumo · eval-harness · runner
#
# Corre cada caso do corpus contra o hook real e verifica se bloqueou/passou
# conforme o esperado. Exit 0 se tudo bate certo; exit 1 se houver mismatch
# (serve de gate de CI). Hermético: corre com HOME sandbox, não toca em ~/.prumo.
#
# Uso:
#   scripts/eval/run.sh                 # corre tudo
#   scripts/eval/run.sh --hook vault-ttl
#   scripts/eval/run.sh --json          # saída machine-readable
#   scripts/eval/run.sh --corpus <path>
#   scripts/eval/run.sh --list          # só lista os casos
set -uo pipefail

# ── localização ──────────────────────────────────────────────────────────────
EVAL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$EVAL_DIR/../.." && pwd)"
CORPUS="$EVAL_DIR/corpus.jsonl"
FILTER_HOOK=""
OUT_JSON=0
LIST_ONLY=0
QUIET=0

while [ $# -gt 0 ]; do
  case "$1" in
    --hook) FILTER_HOOK="$2"; shift 2 ;;
    --corpus) CORPUS="$2"; shift 2 ;;
    --json) OUT_JSON=1; shift ;;
    --list) LIST_ONLY=1; shift ;;
    --quiet) QUIET=1; shift ;;
    -h|--help) sed -n '2,14p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "arg desconhecido: $1" >&2; exit 2 ;;
  esac
done

command -v jq >/dev/null 2>&1 || { echo "jq necessário" >&2; exit 2; }
[ -f "$CORPUS" ] || { echo "corpus não encontrado: $CORPUS" >&2; exit 2; }

# ── mapa hook → caminho do script ────────────────────────────────────────────
hook_path() {
  case "$1" in
    audit-guard)   echo "$REPO_ROOT/base/hooks/pre-tool-audit-guard.sh" ;;
    vault-ttl)     echo "$REPO_ROOT/secops/hooks/pre-tool-vault-ttl.sh" ;;
    pii-redact)    echo "$REPO_ROOT/secops/hooks/pre-tool-pii-redact.sh" ;;
    approval-gate) echo "$REPO_ROOT/secops/hooks/pre-tool-approval-gate.sh" ;;
    second-opinion) echo "$REPO_ROOT/secops/hooks/pre-tool-second-opinion.sh" ;;
    *) echo "" ;;
  esac
}

# ── cores (só em TTY) ────────────────────────────────────────────────────────
if [ -t 1 ] && [ "$OUT_JSON" = 0 ]; then
  C_G=$'\033[32m'; C_R=$'\033[31m'; C_Y=$'\033[33m'; C_DIM=$'\033[2m'; C_B=$'\033[1m'; C_0=$'\033[0m'
else
  C_G=""; C_R=""; C_Y=""; C_DIM=""; C_B=""; C_0=""
fi

# ── sandbox HOME (hermético) ─────────────────────────────────────────────────
SANDBOX="$(mktemp -d "${TMPDIR:-/tmp}/prumo-eval.XXXXXX")"
# cache vazio para o `find` dos hooks secops não falhar sob set -e (→ fallback stubs)
mkdir -p "$SANDBOX/.claude/plugins/cache"
# shellcheck disable=SC2329  # invocado indirectamente pelo trap abaixo
cleanup() { rm -rf "$SANDBOX"; }
trap cleanup EXIT

# variáveis sensíveis desligadas por defeito (o caso pode religá-las)
DEFAULT_UNSET=(VAULT_TOKEN PRUMO_APPROVE PRUMO_AUDIT_APPLY PRUMO_PII_DISABLE PRUMO_SECOND_OPINION_BYPASS PRUMO_AUDIT_ACTIVE PRUMO_OPERATING_MODE)

# ── corre um caso, devolve "block"|"allow"|"error:<code>" ────────────────────
run_case() {
  local cmd="$1" hook="$2" env_json="$3"
  local hp; hp="$(hook_path "$hook")"
  [ -n "$hp" ] && [ -f "$hp" ] || { echo "error:no-hook"; return; }

  # isolamento por-caso: repõe o sandbox HOME a limpo antes de cada hook, para
  # que um caso que (hipoteticamente) escreva um marker ~/.prumo/* não contamine
  # o caso seguinte. Os classificadores actuais não escrevem, mas isto torna a
  # garantia hermética real e à prova de casos futuros.
  rm -rf "$SANDBOX/.prumo" "$SANDBOX/.claude"
  mkdir -p "$SANDBOX/.claude/plugins/cache"

  # env: as opções -u TÊM de vir antes de qualquer KEY=val (exigência do env(1)).
  # Ordem: env  <-u flags...>  HOME=...  <assigns do caso...>  bash hook
  local k uflags assigns
  uflags=()
  assigns=("HOME=$SANDBOX")
  local set_keys; set_keys="$(printf '%s' "$env_json" | jq -r 'keys[]' 2>/dev/null)"
  for k in "${DEFAULT_UNSET[@]}"; do
    grep -qx "$k" <<<"$set_keys" || uflags+=("-u" "$k")
  done
  while IFS=$'\t' read -r ek ev; do
    [ -n "$ek" ] && assigns+=("$ek=$ev")
  done < <(printf '%s' "$env_json" | jq -r 'to_entries[] | [.key, (.value|tostring)] | @tsv')
  local envargs
  envargs=(env ${uflags[@]+"${uflags[@]}"} "${assigns[@]}")

  # stdin: JSON de tool call
  local stdin_json
  stdin_json="$(jq -cn --arg c "$cmd" '{tool_name:"Bash",tool_input:{command:$c}}')"

  local code
  printf '%s' "$stdin_json" | "${envargs[@]}" bash "$hp" >/dev/null 2>&1
  code=$?
  case "$code" in
    2) echo "block" ;;
    0) echo "allow" ;;
    *) echo "error:$code" ;;
  esac
}

# ── loop principal ───────────────────────────────────────────────────────────
TP=0; FP=0; TN=0; FN=0; ERR=0; TOTAL=0
MISMATCHES=()
RESULTS_JSON="[]"

while IFS= read -r line; do
  [ -z "$line" ] && continue
  id="$(jq -r '.id' <<<"$line")"
  cmd="$(jq -r '.command' <<<"$line")"
  hook="$(jq -r '.hook' <<<"$line")"
  envj="$(jq -c '.env // {}' <<<"$line")"
  cat="$(jq -r '.category' <<<"$line")"
  sev="$(jq -r '.severity // ""' <<<"$line")"
  exp="$(jq -r '.expected' <<<"$line")"
  reason="$(jq -r '.reason // ""' <<<"$line")"

  [ -n "$FILTER_HOOK" ] && [ "$hook" != "$FILTER_HOOK" ] && continue

  if [ "$LIST_ONLY" = 1 ]; then
    printf '%-8s %-14s %-8s %-9s %s\n' "$id" "$hook" "$exp" "$cat" "$cmd"
    continue
  fi

  act="$(run_case "$cmd" "$hook" "$envj")"
  TOTAL=$((TOTAL+1))

  ok=0
  if [ "$act" = "$exp" ]; then ok=1; fi
  # matriz de confusão (positivo = "block" = ameaça detectada)
  if [ "$exp" = "block" ] && [ "$act" = "block" ]; then TP=$((TP+1));
  elif [ "$exp" = "allow" ] && [ "$act" = "allow" ]; then TN=$((TN+1));
  elif [ "$exp" = "block" ] && [ "$act" = "allow" ]; then FN=$((FN+1));
  elif [ "$exp" = "allow" ] && [ "$act" = "block" ]; then FP=$((FP+1));
  else ERR=$((ERR+1)); fi

  if [ "$ok" = 1 ]; then
    [ "$QUIET" = 0 ] && [ "$OUT_JSON" = 0 ] && \
      printf '  %s✓%s %-8s %-14s %sesperado=%s obtido=%s%s  %s%s%s\n' \
        "$C_G" "$C_0" "$id" "$hook" "$C_DIM" "$exp" "$act" "$C_0" "$C_DIM" "$cmd" "$C_0"
  else
    MISMATCHES+=("$id|$hook|$exp|$act|$cmd|$reason")
    [ "$OUT_JSON" = 0 ] && \
      printf '  %s✗%s %-8s %-14s %sesperado=%s obtido=%s%s  %s\n' \
        "$C_R" "$C_0" "$id" "$hook" "$C_B$C_R" "$exp" "$act" "$C_0" "$cmd"
  fi

  RESULTS_JSON="$(jq -c \
    --arg id "$id" --arg hook "$hook" --arg cat "$cat" --arg sev "$sev" \
    --arg exp "$exp" --arg act "$act" --argjson ok "$ok" \
    '. + [{id:$id,hook:$hook,category:$cat,severity:$sev,expected:$exp,actual:$act,pass:($ok==1)}]' \
    <<<"$RESULTS_JSON")"
done < "$CORPUS"

[ "$LIST_ONLY" = 1 ] && exit 0

# gate nunca passa vazio: 0 casos = corpus corrompido/vazio ou filtro sem match.
# Sem isto o "0/0 verde" seria um falso-verde silencioso no CI.
if [ "$TOTAL" -eq 0 ]; then
  echo "${C_R}${C_B}✗ 0 casos corridos — corpus vazio/corrompido ou filtro --hook/--corpus sem match.${C_0}" >&2
  exit 1
fi

PASS=$((TP+TN)); FAIL=$((FP+FN+ERR))

# ── saída JSON ───────────────────────────────────────────────────────────────
if [ "$OUT_JSON" = 1 ]; then
  jq -cn --argjson r "$RESULTS_JSON" \
    --argjson tp "$TP" --argjson fp "$FP" --argjson tn "$TN" --argjson fn "$FN" --argjson err "$ERR" \
    --argjson total "$TOTAL" --argjson pass "$PASS" --argjson fail "$FAIL" \
    '{total:$total,pass:$pass,fail:$fail,confusion:{tp:$tp,fp:$fp,tn:$tn,fn:$fn,error:$err},results:$r}'
  [ "$FAIL" -eq 0 ] && exit 0 || exit 1
fi

# ── relatório humano ─────────────────────────────────────────────────────────
echo
echo "${C_B}Por hook:${C_0}"
for h in audit-guard vault-ttl pii-redact approval-gate second-opinion; do
  t="$(jq --arg h "$h" '[.[]|select(.hook==$h)]|length' <<<"$RESULTS_JSON")"
  [ "$t" -gt 0 ] || continue
  o="$(jq --arg h "$h" '[.[]|select(.hook==$h and .pass)]|length' <<<"$RESULTS_JSON")"
  col="$C_G"; [ "$o" -lt "$t" ] && col="$C_R"
  printf '  %-14s %s%d/%d%s\n' "$h" "$col" "$o" "$t" "$C_0"
done

echo
echo "${C_B}Matriz de confusão${C_0} ${C_DIM}(positivo = bloquear = ameaça)${C_0}"
printf '  %sTP%s ameaça bloqueada : %d\n' "$C_G" "$C_0" "$TP"
printf '  %sTN%s benigno passou    : %d\n' "$C_G" "$C_0" "$TN"
printf '  %sFN%s AMEAÇA PASSOU      : %d %s(perigoso)%s\n' "$C_R" "$C_0" "$FN" "$C_DIM" "$C_0"
printf '  %sFP%s benigno bloqueado  : %d %s(falso alarme)%s\n' "$C_Y" "$C_0" "$FP" "$C_DIM" "$C_0"
[ "$ERR" -gt 0 ] && printf '  %s!!%s erro de execução  : %d\n' "$C_R" "$C_0" "$ERR"

prec="n/a"; rec="n/a"
[ $((TP+FP)) -gt 0 ] && prec="$(awk "BEGIN{printf \"%.2f\", $TP/($TP+$FP)}")"
[ $((TP+FN)) -gt 0 ] && rec="$(awk "BEGIN{printf \"%.2f\", $TP/($TP+$FN)}")"
printf '  precision=%s  recall=%s\n' "$prec" "$rec"

if [ "$FAIL" -gt 0 ]; then
  echo
  echo "${C_B}${C_R}Mismatches:${C_0}"
  for m in "${MISMATCHES[@]}"; do
    IFS='|' read -r id hook exp act cmd reason <<<"$m"
    printf '  %s✗ %s%s (%s) esperado=%s obtido=%s\n     cmd: %s\n     razão: %s\n' \
      "$C_R" "$id" "$C_0" "$hook" "$exp" "$act" "$cmd" "$reason"
  done
fi

echo
if [ "$FAIL" -eq 0 ]; then
  echo "${C_G}${C_B}✓ ${PASS}/${TOTAL} corretos — corpus verde.${C_0}"
  exit 0
else
  echo "${C_R}${C_B}✗ ${FAIL}/${TOTAL} errados (${PASS} certos) — regressão detectada.${C_0}"
  exit 1
fi

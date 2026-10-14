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
    memory-scope)  echo "$REPO_ROOT/base/hooks/pre-tool-memory-scope.sh" ;;
    self-guard)    echo "$REPO_ROOT/base/hooks/pre-tool-self-guard.sh" ;;
    secret-read)   echo "$REPO_ROOT/base/hooks/pre-tool-secret-read.sh" ;;
    workspace)     echo "$REPO_ROOT/base/hooks/pre-tool-workspace.sh" ;;
    agent-readonly) echo "$REPO_ROOT/secops/hooks/pre-tool-agent-readonly.sh" ;;
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
# Fora de /tmp e do TMPDIR: são raízes permitidas pelo hook workspace, e um
# sandbox lá dentro fazia os casos ws-* passar pela raiz dos temporários (no
# Linux o mktemp cria em /tmp; foi assim que o CI apanhou ws-02 e ws-06).
SANDBOX="$(mktemp -d "${PRUMO_EVAL_ROOT:-$HOME}/.prumo-eval.XXXXXX")"
# cache vazio para o `find` dos hooks secops não falhar sob set -e (→ fallback stubs)
mkdir -p "$SANDBOX/.claude/plugins/cache"
# FS sem distinção de maiúsculas? (casos com "requires": "case-insensitive-fs")
CASE_INSENSITIVE_FS=0
: > "$SANDBOX/.case-probe" && [ -e "$SANDBOX/.CASE-PROBE" ] && CASE_INSENSITIVE_FS=1
rm -f "$SANDBOX/.case-probe"
# shellcheck disable=SC2329  # invocado indirectamente pelo trap abaixo
cleanup() { rm -rf "$SANDBOX"; }
trap cleanup EXIT

# variáveis sensíveis desligadas por defeito (o caso pode religá-las)
DEFAULT_UNSET=(VAULT_TOKEN PRUMO_APPROVE PRUMO_AUDIT_APPLY PRUMO_PII_DISABLE PRUMO_SECOND_OPINION_BYPASS PRUMO_AUDIT_ACTIVE PRUMO_OPERATING_MODE)

# ── provisiona o prumo-base DO REPO no sandbox ───────────────────────────────
# Os hooks do secops carregam prumo-common.sh do cache de plugins; sem ele caem
# em stubs fail-closed que assumem prod e ignoram o modo (ver secops/hooks/_lib.sh).
# Isso é o comportamento correcto em produção, mas torna intestável tudo o que
# dependa de PRUMO_OPERATING_MODE. Um caso com "needs_base": true provisiona a lib
# do REPO (nunca a instalada na máquina — o sandbox tem de continuar hermético e a
# testar este working copy).
provision_base() {
  local sandbox="$1"
  local ver; ver="$(jq -r '.version' "$REPO_ROOT/base/.claude-plugin/plugin.json" 2>/dev/null)"
  [ -n "$ver" ] && [ "$ver" != "null" ] || return 1
  local dest="$sandbox/.claude/plugins/cache/prumo/prumo-base/$ver"
  mkdir -p "$dest" || return 1
  cp -R "$REPO_ROOT/base/lib" "$REPO_ROOT/base/.claude-plugin" "$dest/" 2>/dev/null || return 1
}

# ── corre um caso, devolve "block"|"allow"|"error:<code>" ────────────────────
run_case() {
  local cmd="$1" hook="$2" env_json="$3" needs_base="${4:-false}" payload_json="${5:-}" seed_json="${6:-}"
  local hp; hp="$(hook_path "$hook")"
  [ -n "$hp" ] && [ -f "$hp" ] || { echo "error:no-hook"; return; }

  # isolamento por-caso: repõe o sandbox HOME a limpo antes de cada hook, para
  # que um caso que (hipoteticamente) escreva um marker ~/.prumo/* não contamine
  # o caso seguinte. Os classificadores actuais não escrevem, mas isto torna a
  # garantia hermética real e à prova de casos futuros.
  find "$SANDBOX" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
  mkdir -p "$SANDBOX/.claude/plugins/cache"
  if [ "$needs_base" = "true" ]; then
    provision_base "$SANDBOX" || { echo "error:no-base"; return; }
  fi

  # ficheiros semeados no HOME do sandbox (@HOME@ → sandbox). O conteúdo é escrito
  # byte-a-byte pelo jq (-j, sem @tsv nem $(...), que apagaria o \n final);
  # o @HOME@ do conteúdo é trocado pelo próprio jq, dentro da string.
  if [ -n "$seed_json" ] && [ "$seed_json" != "null" ]; then
    local sk sp
    while IFS= read -r sk; do
      sp="${sk//@HOME@/$SANDBOX}"
      if ! mkdir -p "$(dirname "$sp")" \
         || ! printf '%s' "$seed_json" \
              | jq -j --arg k "$sk" --arg h "$SANDBOX" '.[$k] | gsub("@HOME@"; $h)' > "$sp"; then
        echo "error:seed"; return
      fi
    done < <(printf '%s' "$seed_json" | jq -r 'keys[]')
  fi

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
  if [ -n "$payload_json" ] && [ "$payload_json" != "null" ]; then
    stdin_json="${payload_json//@HOME@/$SANDBOX}"
  else
    stdin_json="$(jq -cn --arg c "${cmd//@HOME@/$SANDBOX}" '{tool_name:"Bash",tool_input:{command:$c}}')"
  fi

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
  needs_base="$(jq -r '.needs_base // false' <<<"$line")"
  payload="$(jq -c '.payload // empty' <<<"$line")"
  seed="$(jq -c '.seed // empty' <<<"$line")"
  requires="$(jq -r '.requires // empty' <<<"$line")"

  [ -n "$FILTER_HOOK" ] && [ "$hook" != "$FILTER_HOOK" ] && continue

  # Casos que só fazem sentido num FS que não distingue maiúsculas (APFS por
  # omissão). Num FS sensível a maiúsculas o comportamento esperado é outro, e
  # o caso salta com aviso em vez de falhar ou passar pela razão errada.
  if [ "$requires" = "case-insensitive-fs" ] && [ "$CASE_INSENSITIVE_FS" != 1 ]; then
    [ "$OUT_JSON" = 0 ] && printf '  %s-%s %-8s %-14s %ssaltado: FS distingue maiúsculas%s\n' "$C_Y" "$C_0" "$id" "$hook" "$C_DIM" "$C_0"
    continue
  fi

  if [ "$LIST_ONLY" = 1 ]; then
    printf '%-8s %-14s %-8s %-9s %s\n' "$id" "$hook" "$exp" "$cat" "$cmd"
    continue
  fi

  act="$(run_case "$cmd" "$hook" "$envj" "$needs_base" "$payload" "$seed")"
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
for h in audit-guard vault-ttl pii-redact approval-gate second-opinion memory-scope self-guard secret-read workspace agent-readonly; do
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

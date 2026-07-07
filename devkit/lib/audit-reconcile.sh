#!/usr/bin/env bash
# prumo-devkit · audit feedback · reconciliador determinístico
# Compara os findings de uma corrida (JSONL) com o store persistente e classifica
# cada um: novo / recorrente / aceite(suprimido) / corrigido. Actualiza o store e
# imprime o relatório reconciliado + métricas. Puro (JSONL + store), sem modelo.
#
# Uso: audit-reconcile.sh --audit <nome> --findings <jsonl> [--state-dir <dir>]
#   --state-dir default: .prumo-audit (no cwd)
set -euo pipefail

AUDIT=""; FINDINGS=""; STATE_DIR=".prumo-audit"
while [ $# -gt 0 ]; do
  case "$1" in
    --audit)     AUDIT="${2:-}"; shift 2 ;;
    --findings)  FINDINGS="${2:-}"; shift 2 ;;
    --state-dir) STATE_DIR="${2:-.prumo-audit}"; shift 2 ;;
    *) echo "arg desconhecido: $1" >&2; exit 1 ;;
  esac
done
[ -n "$AUDIT" ] || { echo "--audit obrigatório" >&2; exit 1; }
[ -n "$FINDINGS" ] && [ -f "$FINDINGS" ] || { echo "--findings <jsonl> inexistente" >&2; exit 1; }
command -v jq >/dev/null 2>&1 || { echo "jq necessário" >&2; exit 1; }

STORE="$STATE_DIR/state.json"
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
TODAY=$(date -u +%Y-%m-%d)

_norm() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | tr -d '[:digit:]' | tr -s '[:space:]' ' ' | sed 's/^ //; s/ $//'; }
_fp()   { printf '%s\0%s\0%s\0%s' "$1" "$2" "$3" "$4" | shasum -a 1 | cut -c1-12; }

# 1) augmenta cada finding com fp + audit; valida campos mínimos
CUR="[]"
while IFS= read -r line; do
  [ -n "$line" ] || continue
  printf '%s' "$line" | jq -e 'has("file") and has("rule") and has("title")' >/dev/null 2>&1 \
    || { echo "finding inválido (faltam file/rule/title): $line" >&2; exit 1; }
  file=$(printf '%s' "$line" | jq -r '.file')
  rule=$(printf '%s' "$line" | jq -r '.rule')
  sym=$(printf '%s' "$line" | jq -r '.symbol // ""')
  title=$(printf '%s' "$line" | jq -r '.title')
  key4="$sym"; [ -n "$key4" ] || key4="$(_norm "$title")"
  fp=$(_fp "$AUDIT" "$file" "$rule" "$key4")
  aug=$(printf '%s' "$line" | jq -c --arg fp "$fp" --arg audit "$AUDIT" '. + {fp:$fp, audit:$audit}')
  CUR=$(printf '%s' "$CUR" | jq -c --argjson f "$aug" '. + [$f]')
done < "$FINDINGS"

# 2) carrega/inicia o store
if [ -f "$STORE" ]; then
  OLD=$(cat "$STORE")
  printf '%s' "$OLD" | jq -e . >/dev/null 2>&1 || { echo "store corrompido: $STORE" >&2; exit 1; }
else
  OLD='{"version":1,"findings":{},"history":[]}'
fi

# 3) reconcilia num único programa jq → {store, report}
# shellcheck disable=SC2016  # $store/$cur são variáveis jq
RESULT=$(jq -n --argjson store "$OLD" --argjson cur "$CUR" \
  --arg audit "$AUDIT" --arg today "$TODAY" --arg now "$NOW" '
  ($cur | unique_by(.fp)) as $cur
  | ($store.findings // {}) as $sf
  | ($cur | map({key:.fp, value:.}) | from_entries) as $curmap
  | ($cur | map(select($sf[.fp]|not))) as $new
  | ($cur | map(select(($sf[.fp].status // "") as $s | $s=="open" or $s=="fixed"))) as $recurring
  | ($cur | map(select(($sf[.fp].status // "")=="accepted"))) as $suppressed
  | ([ $sf | to_entries[]
       | select(.value.audit==$audit and .value.status=="open" and ($curmap[.key]|not))
       | .key ]) as $fixedfps
  | ( $sf | to_entries | map(
        .key as $k | .value as $v
        | if ($v.audit==$audit) and ($fixedfps|index($k)) then
            .value = ($v + {status:"fixed", last_seen:$today})
          elif ($curmap[$k]) then
            .value = ($v + {last_seen:$today, runs_seen:(($v.runs_seen//0)+1),
                            status:(if $v.status=="fixed" then "open" else $v.status end)})
          else . end
      ) | from_entries ) as $updated
  | ( $new | map({key:.fp, value:{
        audit:$audit, rule:.rule, file:.file, symbol:(.symbol//null),
        severity:(.severity//"medium"), title:.title, status:"open",
        first_seen:$today, last_seen:$today, runs_seen:1,
        accepted_reason:null, accepted_at:null }}) | from_entries ) as $newmap
  | ($updated + $newmap) as $findings
  | { new:($new|length), recurring:($recurring|length),
      suppressed:($suppressed|length), fixed:($fixedfps|length) } as $m
  | ([ $findings|to_entries[]|select(.value.audit==$audit and .value.status=="open") ]|length) as $openct
  | ([ $findings|to_entries[]|select(.value.audit==$audit and .value.status=="fixed") ]|length) as $fixedct
  | (($store.history // []) | map(select(.audit==$audit)) | last) as $prev
  | { store: ($store + { findings:$findings,
        history: (($store.history // []) + [{run:$now, audit:$audit,
          open:$openct, accepted:$m.suppressed, fixed:$m.fixed, new:$m.new}]) }),
      report: { audit:$audit, m:$m, open:$openct, fixed:$fixedct,
        fix_rate:(if ($fixedct+$openct)>0 then (($fixedct*100)/($fixedct+$openct))|floor else 0 end),
        delta:($openct - ($prev.open // $openct)),
        new_list:($new|map({fp:.fp,severity:(.severity//"medium"),file:.file,title:.title})),
        rec_list:($recurring|map({fp:.fp,severity:(.severity//"medium"),file:.file,title:.title})) } }
')

# 4) escreve o store (best-effort)
mkdir -p "$STATE_DIR" 2>/dev/null || true
_tmp_store=$(mktemp "$STATE_DIR/.state.XXXXXX") || { echo "falha a criar tmp em $STATE_DIR" >&2; exit 1; }
if printf '%s' "$RESULT" | jq '.store' > "$_tmp_store"; then
  mv "$_tmp_store" "$STORE"
else
  rm -f "$_tmp_store"; echo "falha a escrever $STORE" >&2; exit 1
fi

# 5) relatório
printf '%s' "$RESULT" | jq -r '.report as $r
  | "── audit-feedback · \($r.audit) ──",
    "novos: \($r.m.new)  recorrentes: \($r.m.recurring)  corrigidos: \($r.m.fixed)  aceites(suprimidos): \($r.m.suppressed)",
    "open: \($r.open)  fixed(acum): \($r.fixed)  taxa-correção: \($r.fix_rate)%  dívida vs corrida anterior: \(if $r.delta>=0 then "+" else "" end)\($r.delta)",
    (if ($r.new_list|length)>0 then "\nNOVOS:" else empty end),
    ($r.new_list[] | "  [\(.severity)] \(.fp)  \(.file) — \(.title)"),
    (if ($r.rec_list|length)>0 then "\nRECORRENTES:" else empty end),
    ($r.rec_list[] | "  [\(.severity)] \(.fp)  \(.file) — \(.title)"),
    "\nAceitar um falso-positivo: audit-accept.sh <fp> \"<razão>\""'

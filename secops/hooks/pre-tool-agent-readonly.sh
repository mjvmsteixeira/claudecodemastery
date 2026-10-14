#!/usr/bin/env bash
# prumo-secops · PreToolUse · agent-readonly
#
# Os agentes que se declaram read-only não mudam estado: sem Write/Edit e sem
# comandos Bash que escrevam ficheiros, reiniciem serviços, façam commit/push,
# deploy, pedidos HTTP com corpo ou que gravem em ficheiro, SQL de escrita,
# escrita no Vault ou mudanças em containers. Lista em prumo_org
# readonly_agents (default: prumo-monitor-01, prumo-tenant-01, prumo-deploy-01).
# O agent_type pode vir com o prefixo do plugin ("prumo-secops:prumo-monitor-01");
# compara-se sem ele. Respeita o modo (prumo_fail_or_warn).
#
# Best effort, deny-list. Método:
#   1. SQL de escrita: se há cliente de BD no comando inteiro, o SQL_RE corre
#      sobre o comando inteiro (um `;` dentro de -c "..." ou de um heredoc não
#      pode esconder um DROP).
#   2. O comando é desembrulhado (bash -c '...', $(...), crases), partido em
#      segmentos (; | & && || e parênteses, fora de aspas) e cada segmento é
#      avaliado só em POSIÇÃO DE COMANDO (depois de sudo/xargs/time/nohup/exec/
#      env/VAR=valor), para `grep install` ou `ps | grep dd` não serem escrita.
#   3. Redirecções: `> /dev/null`, `2>&1`, `>&2` não são escrita; `>& f`, `&> f`,
#      `>| f` são. O `>` dentro de aspas não conta.
#
# Risco residual (não coberto): python -c, perl -i, awk -i inplace, e
# `docker exec` / `kubectl exec` a correr outro escritor; wrappers com flags que
# levam argumento (sudo -u x rm).
set -uo pipefail
# shellcheck source=_lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
prumo_telemetry_init "prumo-secops" "agent-readonly"

INPUT=$(cat)
[ -n "$INPUT" ] || exit 0
command -v jq >/dev/null 2>&1 || exit 0

AGENT=$(jq -r '.agent_type // empty' <<<"$INPUT" 2>/dev/null)
[ -n "$AGENT" ] || exit 0
AGENT="${AGENT##*:}"

READONLY=$(prumo_org readonly_agents "" 2>/dev/null || true)
[ -n "$READONLY" ] || READONLY=$'prumo-monitor-01\nprumo-tenant-01\nprumo-deploy-01'
grep -qxF "$AGENT" <<<"$READONLY" || exit 0

TOOL=$(jq -r '.tool_name // empty' <<<"$INPUT")
case "$TOOL" in
  Write|Edit|MultiEdit|NotebookEdit)
    prumo_fail_or_warn "prumo-secops" "agent-readonly" "$AGENT é read-only: $TOOL recusado."
    exit 0 ;;
  Bash) ;;
  *) exit 0 ;;
esac

CMD=$(jq -r '.tool_input.command // empty' <<<"$INPUT" | tr '\n\t' '  ')
[ -n "$CMD" ] || exit 0

block() {
  prumo_fail_or_warn "prumo-secops" "agent-readonly" \
"$AGENT é read-only e este comando muda estado: ${1:0:120}
Se a alteração é necessária, pede-a à thread principal, onde o approval-gate decide."
  exit 0
}

# Padrões aplicados em posição de comando (^ = primeira palavra útil do segmento).
PFX='^([^[:space:]]*/)?'
FSW='rm|mv|cp|ln|touch|truncate|chmod|chown|mkdir|rmdir|tee|dd|install|unlink'
FS_RE="${PFX}(${FSW})([[:space:]]|\$)|${PFX}sed[[:space:]]+(-[a-zA-Z]*i|--in-place)|${PFX}find[[:space:]].*([[:space:]]-delete([[:space:]]|\$)|[[:space:]]-exec(dir)?[[:space:]]+(${FSW})([[:space:]]|\$))"
SVC_RE="${PFX}systemctl[[:space:]]+(.*[[:space:]])?(start|stop|restart|reload|enable|disable|kill|mask)([[:space:]]|\$)|${PFX}service[[:space:]]+(.*[[:space:]])?(start|stop|restart|reload)([[:space:]]|\$)|${PFX}(kill|pkill|killall)([[:space:]]|\$)|${PFX}cap[[:space:]]+[^[:space:]]+[[:space:]]+deploy"
GIT_RE="${PFX}git([[:space:]]+-[^[:space:]]+)*[[:space:]]+(commit|push|reset|checkout|switch|merge|rebase|tag|stash|apply|am|cherry-pick|revert|clean|rm|mv)([[:space:]]|\$)|${PFX}git([[:space:]]+-[^[:space:]]+)*[[:space:]]+branch[[:space:]]+-[dDmM]"
VAULT_RE="${PFX}vault[[:space:]]+(write|delete|kv[[:space:]]+(put|patch|delete|destroy|undelete|rollback)|policy[[:space:]]+(write|delete)|secrets[[:space:]]+(enable|disable|move|tune)|auth[[:space:]]+(enable|disable)|token[[:space:]]+revoke|operator)"
CTR_RE="${PFX}docker[[:space:]]+(rm|rmi|stop|kill|restart|run|start|pause|compose[[:space:]]+(up|down|restart|stop|rm|pull))|${PFX}kubectl[[:space:]]+(apply|create|delete|edit|patch|replace|scale|set|label|annotate|drain|cordon|rollout[[:space:]]+(restart|undo))"
NET_DATA_RE="${PFX}(curl|wget|http)[[:space:]]+(.*[[:space:]])?(-d|--data[a-z-]*|-F|--form|-T|--upload-file)([[:space:]=]|\$)"
NET_METHOD_RE="${PFX}(curl|wget|http)[[:space:]].*(-X[[:space:]]*|--request[[:space:]=]+)(POST|PUT|PATCH|DELETE)([[:space:]]|\$)"
CURL_OUT_RE="${PFX}curl[[:space:]]+(.*[[:space:]])?(-[a-zA-Z]*[oO]|--output|--remote-name[a-z-]*)([[:space:]=]|\$)"
WGET_STDOUT_RE='(-[a-zA-Z]*O[[:space:]]*-([[:space:]]|$)|-[a-zA-Z]*O[[:space:]]*/dev/null|--output-document[= ]-([[:space:]]|$)|--spider)'
DBCLI_RE='(^|[^[:alnum:]_-])(psql|mysql|mariadb|sqlite3|sqlcmd|clickhouse-client|rails[[:space:]]+(db|dbconsole|runner)|bin/rails)([^[:alnum:]_]|$)'
SQL_RE='(INSERT[[:space:]]+INTO|UPDATE[[:space:]]+[^[:space:]]+[[:space:]]+SET|DELETE[[:space:]]+FROM|DROP[[:space:]]|ALTER[[:space:]]|CREATE[[:space:]]|TRUNCATE[[:space:]]|GRANT[[:space:]]|REVOKE[[:space:]])'

# 1. SQL de escrita sobre o comando inteiro.
if grep -qE "$DBCLI_RE" <<<"$CMD" && grep -qiE "$SQL_RE" <<<"$CMD"; then
  block "$CMD"
fi

# Segmento em posição de comando: salta wrappers e VAR=valor.
cmd_position() {
  local -a w
  local i=0 x wrap=0
  read -ra w <<<"$1"
  while [ "$i" -lt "${#w[@]}" ]; do
    x="${w[$i]}"
    case "$x" in
      sudo|xargs|time|nohup|exec|env|command|nice) wrap=1 ;;
      -*) [ "$wrap" -eq 1 ] || break ;;
      [A-Za-z_]*=*) ;;
      *) break ;;
    esac
    i=$((i + 1))
  done
  [ "$i" -lt "${#w[@]}" ] || return 0
  printf '%s' "${w[*]:$i}"
}

mutates() {
  local s="$1" nq c n
  # `>` fora de aspas é escrita (o /dev/null e os fd-dups já foram retirados).
  nq=$(printf '%s' "$s" | sed -E "s/\"[^\"]*\"//g; s/'[^']*'//g")
  case "$nq" in *'>'*) return 0 ;; esac
  c=$(cmd_position "$s")
  [ -n "$c" ] || return 1
  grep -qE "$FS_RE|$SVC_RE|$GIT_RE|$VAULT_RE|$CTR_RE" <<<"$c" && return 0
  # curl -o /dev/null (health check) descarta; não é escrita.
  n=$(printf '%s' "$c" | sed -E 's/(-o|--output)[[:space:]=]*\/dev\/null//g')
  grep -qE "$NET_DATA_RE|$CURL_OUT_RE" <<<"$n" && return 0
  grep -qiE "$NET_METHOD_RE" <<<"$n" && return 0
  if grep -qE "${PFX}wget([[:space:]]|\$)" <<<"$n"; then
    grep -qE "$WGET_STDOUT_RE" <<<"$n" || return 0
  fi
  return 1
}

# 2/3. Normaliza redirecções, desembrulha e parte em segmentos.
SEP=$'\001'
SQ="'"
DQ='"'
# shellcheck disable=SC2016  # $( e crases são padrões literais para o sed
NORM=$(printf '%s' "$CMD" | sed -E \
  -e 's/&?[0-9]?>{1,2}&?[[:space:]]*\/dev\/null//g' \
  -e 's/[0-9]?>&[0-9-]//g' \
  -e 's/&>/>/g; s/>&/>/g; s/>\|/>/g' \
  -e "s/(bash|sh|zsh)[[:space:]]+-[a-zA-Z]*c[[:space:]]+\"([^\"]*)\"/${SEP}\\2${SEP}/g" \
  -e "s/(bash|sh|zsh)[[:space:]]+-[a-zA-Z]*c[[:space:]]+'([^']*)'/${SEP}\\2${SEP}/g" \
  -e "s/\\\$\\(([^()]*)\\)/${SEP}\\1${SEP}/g" \
  -e "s/\`([^\`]*)\`/${SEP}\\1${SEP}/g")

while IFS= read -r seg; do
  [ -n "${seg//[[:space:]]/}" ] || continue
  mutates "$seg" && block "$seg"
done < <(printf '%s' "$NORM" | awk -v SEP="$SEP" -v SQ="$SQ" -v DQ="$DQ" '{
  out = ""; q = ""; n = length($0)
  for (i = 1; i <= n; i++) {
    c = substr($0, i, 1)
    if (c == SEP) { out = out "\n"; continue }
    if (q != "") { if (c == q) q = ""; out = out c; continue }
    if (c == DQ || c == SQ) { q = c; out = out c; continue }
    if (c == ";" || c == "|" || c == "&" || c == "(" || c == ")" || c == "`") { out = out "\n"; continue }
    out = out c
  }
  print out
}')

exit 0

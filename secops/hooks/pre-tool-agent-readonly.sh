#!/usr/bin/env bash
# prumo-secops · PreToolUse · agent-readonly
#
# Os agentes que se declaram read-only não mudam estado: sem Write/Edit e sem
# comandos Bash que escrevam ficheiros, reiniciem serviços, façam commit/push,
# deploy, pedidos HTTP com corpo, SQL de escrita, escrita no Vault ou mudanças
# em containers. Lista em prumo_org readonly_agents (default: prumo-monitor-01,
# prumo-tenant-01, prumo-deploy-01). O agent_type pode vir com o prefixo do
# plugin ("prumo-secops:prumo-monitor-01"); compara-se sem ele.
# Respeita o modo (prumo_fail_or_warn). Deny-list por cláusula: best effort.
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

FS_RE='(^|[[:space:]/\\(`])(rm|mv|cp|ln|touch|truncate|chmod|chown|mkdir|rmdir|tee|dd|install|unlink)([[:space:]]|$)|sed[[:space:]]+(-[a-zA-Z]*i|--in-place)'
SVC_RE='systemctl[[:space:]]+(start|stop|restart|reload|enable|disable|kill|mask)|service[[:space:]]+[^[:space:]]+[[:space:]]+(start|stop|restart|reload)|(^|[[:space:]])(kill|pkill|killall)([[:space:]]|$)|cap[[:space:]]+[^[:space:]]+[[:space:]]+deploy'
GIT_RE='git[[:space:]]+(commit|push|reset|checkout|switch|merge|rebase|tag|stash|apply|am|cherry-pick|revert|clean|rm|mv)([[:space:]]|$)|git[[:space:]]+branch[[:space:]]+-[dDmM]'
NET_RE='(curl|wget|http)[[:space:]].*(-X[[:space:]]*(POST|PUT|PATCH|DELETE)|--request[[:space:]]+(POST|PUT|PATCH|DELETE)|[[:space:]](-d|--data[a-z-]*|-F|--form|-T|--upload-file)([[:space:]=]|$))'
DBCLI_RE='(psql|mysql|mariadb|sqlite3|sqlcmd|clickhouse-client|rails[[:space:]]+(db|dbconsole|runner)|bin/rails)'
SQL_RE='(INSERT[[:space:]]+INTO|UPDATE[[:space:]]+[^[:space:]]+[[:space:]]+SET|DELETE[[:space:]]+FROM|DROP[[:space:]]|ALTER[[:space:]]|CREATE[[:space:]]|TRUNCATE[[:space:]]|GRANT[[:space:]]|REVOKE[[:space:]])'
VAULT_RE='vault[[:space:]]+(write|delete|kv[[:space:]]+(put|patch|delete|destroy|undelete|rollback)|policy[[:space:]]+(write|delete)|secrets[[:space:]]+(enable|disable|move|tune)|auth[[:space:]]+(enable|disable)|token[[:space:]]+revoke|operator)'
CTR_RE='docker[[:space:]]+(rm|rmi|stop|kill|restart|run|start|pause|compose[[:space:]]+(up|down|restart|stop|rm|pull))|kubectl[[:space:]]+(apply|create|delete|edit|patch|replace|scale|set|label|annotate|drain|cordon|rollout[[:space:]]+(restart|undo))'

mutates() {
  local c="$1" r
  printf '%s' "$c" | grep -qE "$FS_RE|$SVC_RE|$GIT_RE|$NET_RE|$VAULT_RE|$CTR_RE" && return 0
  if printf '%s' "$c" | grep -qE "$DBCLI_RE"; then
    printf '%s' "$c" | grep -qiE "$SQL_RE" && return 0
  fi
  # Retira o que não é escrita: descartes para /dev/null (>, >>, >&, &>) e
  # duplicação de fd (2>&1, >&2). `>& ficheiro`, `&> ficheiro` e `>| ficheiro`
  # ficam e são apanhados pelo `>` final.
  r=$(printf '%s' "$c" | sed -E 's/&?[0-9]?>{1,2}&?[[:space:]]*\/dev\/null//g; s/[0-9]?>&[0-9-]//g')
  printf '%s' "$r" | grep -qE '>' && return 0
  return 1
}

# Split por ; && || — o pipe fica na cláusula: `curl -d x | jq` continua a ser POST.
while IFS= read -r clause; do
  [ -n "$clause" ] || continue
  if mutates "$clause"; then
    prumo_fail_or_warn "prumo-secops" "agent-readonly" \
"$AGENT é read-only e este comando muda estado: ${clause:0:120}
Se a alteração é necessária, pede-a à thread principal, onde o approval-gate decide."
    exit 0
  fi
done < <(printf '%s' "$CMD" | awk '{ gsub(/&&|\|\||;/, "\n"); print }')

exit 0

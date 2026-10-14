#!/usr/bin/env bash
# prumo-base · PreToolUse · secret-read
#
# Impede que o conteúdo de ficheiros de segredos chegue ao contexto do modelo:
# Read e Grep sobre o ficheiro, e no Bash os verbos que mostram conteúdo
# (cat, head, grep, ...) numa cláusula que nomeia um ficheiro de segredos.
# `source .env` passa (carrega sem mostrar); `cut -d= -f1 .env` passa (nomes).
#
# Bloqueia em prod e dev; em lab passa e fica registado — excepção ao
# prumo_fail_or_warn, como o approval-gate (FAILCLOSED_EXEMPT do validate.sh).
# Risco residual: `grep -r` sobre um diretório que contém um .env; a redação
# do prumo-guard cobre os valores com forma de token.
#
# Caminhos comparados em minúsculas (APFS é case-insensitive); palavras do
# Bash sem aspas e com `//` e `/./` colapsados antes do teste.
set -uo pipefail

HELPER="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}/lib/prumo-common.sh"
if [ -r "$HELPER" ]; then
  # shellcheck disable=SC1090
  source "$HELPER"
  prumo_telemetry_init "prumo-base" "secret-read"
else
  prumo_log() { :; }
  prumo_telemetry_record() { :; }
  prumo_mode() { echo prod; }
fi

PLUGIN="prumo-base"
HOOK="secret-read"

# Todas as regex assumem o caminho já em minúsculas.
SECRET_RE='(^|/)\.env(\.[a-z0-9_-]+)?$|(^|/)(vault-init\.json|approle-credentials\.json|token-cache|\.netrc|\.pgpass|\.npmrc)$|(^|/)\.aws/credentials$|(^|/)\.docker/config\.json$|(^|/)\.ssh/(id_[a-z0-9_]+|[^/]*_key)$|(^|/)[^/]*\.key$|(^|/)[^/]*private[^/]*\.pem$'
SAFE_RE='(^|/)\.env\.(example|sample|template|dist|defaults)$'
CUT_KEYS_RE="-d[[:space:]]*['\"]?=['\"]?[[:space:]]*-f[[:space:]]*1([[:space:]]|$)"

lower() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]'; }

is_secret() {
  local p
  p=$(lower "$1")
  [ -n "$p" ] || return 1
  [[ "$p" =~ $SAFE_RE ]] && return 1
  [[ "$p" =~ $SECRET_RE ]]
}

normalize_word() {
  local w="$1"
  w="${w//\"/}"
  w="${w//\'/}"
  w="${w#<}"
  while [[ "$w" == *//* ]]; do w="${w//\/\//\/}"; done
  while [[ "$w" == */./* ]]; do w="${w//\/.\//\/}"; done
  printf '%s' "$w"
}

deny() {
  if [ "$(prumo_mode 2>/dev/null || echo prod)" = "lab" ]; then
    prumo_log "$PLUGIN" "bypass" "$HOOK: lab — $1"
    prumo_telemetry_record "$PLUGIN" "$HOOK" "bypass"
    # shellcheck disable=SC2034  # lido pelo trap _prumo_tm_on_exit em prumo-common.sh
    PRUMO_TM_RECORDED=1
    echo "[prumo-base/secret-read] modo lab — leitura de $1 permitida e registada" >&2
    exit 0
  fi
  prumo_log "$PLUGIN" "block" "$HOOK: $1"
  prumo_telemetry_record "$PLUGIN" "$HOOK" "block"
  # shellcheck disable=SC2034
  PRUMO_TM_RECORDED=1
  cat >&2 <<EOF
[prumo-base/secret-read] Bloqueado: o conteúdo de $1 entraria no contexto do modelo.

Alternativas:
  · nomes das variáveis, sem valores:  cut -d= -f1 $1
  · guardar o segredo no Vault:        /vault-set
  · correr com o segredo injetado:     tool run_with_secret (prumo-guard)
Em modo lab esta leitura passa e fica registada.
EOF
  exit 2
}

INPUT=$(cat)
[ -n "$INPUT" ] || exit 0
command -v jq >/dev/null 2>&1 || exit 0

TOOL=$(jq -r '.tool_name // empty' <<<"$INPUT" 2>/dev/null)

case "$TOOL" in
  Read)
    FP=$(jq -r '.tool_input.file_path // empty' <<<"$INPUT")
    is_secret "$FP" && deny "$FP"
    exit 0
    ;;
  Grep)
    GP=$(jq -r '.tool_input.path // empty' <<<"$INPUT")
    GG=$(jq -r '.tool_input.glob // empty' <<<"$INPUT")
    is_secret "$GP" && deny "$GP"
    case "$(lower "$GG")" in .env|.env.*|.env\*|*/.env|*/.env.*|*/.env\*) deny "$GG" ;; esac
    exit 0
    ;;
  Bash) ;;
  *) exit 0 ;;
esac

CMD=$(jq -r '.tool_input.command // empty' <<<"$INPUT" | tr '\n\t' '  ')
[ -n "$CMD" ] || exit 0

while IFS= read -r clause; do
  [ -n "$clause" ] || continue
  set -f
  # shellcheck disable=SC2206  # split por palavras intencional
  words=($clause)
  set +f
  first=""
  for w in "${words[@]}"; do
    case "$w" in sudo|command|env|*=*) continue ;; esac
    first="${w##*/}"; break
  done
  case "$first" in
    cat|less|more|head|tail|bat|strings|xxd|hexdump|od|nl|grep|egrep|fgrep|rg|ag|awk|sed|base64|tac|sort|uniq|jq|yq|diff|cmp|vi|vim|nvim|nano|tr|cut|paste|column|python|python3|perl|ruby|node) ;;
    *) continue ;;
  esac
  if [ "$first" = "cut" ] && [[ "$clause" =~ $CUT_KEYS_RE ]]; then continue; fi
  for w in "${words[@]}"; do
    w=$(normalize_word "$w")
    is_secret "$w" && deny "$w"
  done
done < <(printf '%s' "$CMD" | awk '{ gsub(/&&|\|\||;|\|/, "\n"); print }')

exit 0

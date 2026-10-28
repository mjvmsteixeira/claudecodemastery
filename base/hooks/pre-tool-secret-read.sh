#!/usr/bin/env bash
# prumo-base · PreToolUse · secret-read
#
# Impede que o conteúdo de ficheiros de segredos chegue ao contexto do modelo:
# Read e Grep sobre o ficheiro e, no Bash, qualquer palavra do comando que
# nomeie um ficheiro de segredos (varredura do comando inteiro, incluindo
# $(...), subshells, bash -c, ciclos e globs), excepto em cláusulas cujo verbo
# não mostra conteúdo (ls, stat, source, wc, chmod, ...). No ssh/scp/sftp, a
# chave passada por -i ou -o IdentityFile também passa: autentica sem mostrar.
# `source .env` passa (carrega sem mostrar); `cut -d= -f1 .env` passa (nomes).
#
# Bloqueia em prod e dev; em lab passa e fica registado — excepção ao
# prumo_fail_or_warn, como o approval-gate (FAILCLOSED_EXEMPT do validate.sh).
#
# Risco residual: symlinks para ficheiros de segredos não são resolvidos nas
# palavras do Bash; `grep -r` sobre um diretório que contém um .env; nomes
# montados em runtime (`cat $(echo .e)nv`). A redação do prumo-guard cobre os
# valores com forma de token.
#
# Caminhos comparados em minúsculas (APFS é case-insensitive); o comando é
# normalizado (sem aspas, `//` e `/./` colapsados) antes da varredura.
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
SECRET_RE='(^|/)\.env(\.[a-z0-9_-]+)?$|(^|/)\.envrc$|(^|/)(vault-init\.json|approle-credentials\.json|token-cache|\.netrc|\.pgpass|\.npmrc)$|(^|/)\.aws/credentials$|(^|/)\.docker/config\.json$|(^|/)\.ssh/(id_[a-z0-9_]+|[^/]*_key)$|(^|/)[^/]*\.key$|(^|/)[^/]*private[^/]*\.pem$'
SAFE_RE='(^|/)\.env\.(example|sample|template|dist|defaults)$'
CUT_KEYS_RE="-d[[:space:]]*=[[:space:]]*-f[[:space:]]*1([[:space:]]|$)"
SECRET_NAMES=".env .env.local .env.production .env.development .env.test .envrc id_rsa id_ed25519 id_ecdsa vault-init.json approle-credentials.json token-cache .netrc .pgpass .npmrc credentials"

lower() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]'; }

# Palavra com glob cujo basename, como padrão, apanha um nome de segredo.
glob_secret() {
  local base cand g
  base=$(lower "${1##*/}")
  case "$base" in *[\*\?\[]*) ;; *) return 1 ;; esac
  # só metacaracteres (`*`, `?`) não é sinal suficiente
  case "${base//[\*\?\[\]]/}" in "") return 1 ;; esac
  g="$base"
  for cand in $SECRET_NAMES; do
    # shellcheck disable=SC2053  # glob sem aspas de propósito
    [[ "$cand" == $g ]] && return 0
  done
  return 1
}

is_secret() {
  local p
  p=$(lower "$1")
  [ -n "$p" ] || return 1
  [[ "$p" =~ $SAFE_RE ]] && return 1
  [[ "$p" =~ $SECRET_RE ]] && return 0
  glob_secret "$p"
}

normalize_cmd() {
  local w="$1"
  w="${w//\"/}"
  w="${w//\'/}"
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
    is_secret "$GG" && deny "$GG"
    exit 0
    ;;
  Bash) ;;
  *) exit 0 ;;
esac

CMD=$(jq -r '.tool_input.command // empty' <<<"$INPUT" | tr '\n\t' '  ')
[ -n "$CMD" ] || exit 0
CMD=$(normalize_cmd "$CMD")

# Alvos de redireção de saída não são leituras; o resto parte-se em cláusulas
# em ; | & ( ) e crase (cobre também $( ).
while IFS= read -r clause; do
  clause="${clause//</ }"; clause="${clause//>/ }"
  clause="${clause//\{/ }"; clause="${clause//\}/ }"
  set -f
  # shellcheck disable=SC2206  # split por palavras intencional
  words=($clause)
  set +f
  [ "${#words[@]}" -gt 0 ] || continue

  # primeiro verbo, saltando palavras-chave de controlo e prefixos
  first=""; start=0; i=0
  for w in "${words[@]}"; do
    i=$((i+1))
    case "$w" in do|then|else|elif|'!'|sudo|command|env|time|nohup|exec|*=*) continue ;; esac
    first="${w##*/}"; start=$((i-1)); break
  done

  case "$first" in
    source|.|ls|stat|test|'['|'[['|file|du|wc|chmod|chown|rm|touch) continue ;;
    cut) [[ "$clause" =~ $CUT_KEYS_RE ]] && continue ;;
  esac

  skip_pat=0
  case "$first" in grep|egrep|fgrep|rg|ag) skip_pat=1 ;; esac
  # ssh/scp/sftp autenticam com a chave de -i / -o IdentityFile sem a mostrar;
  # só esse argumento passa, o resto da cláusula (comando remoto, origem do
  # scp) continua a ser varrido.
  ident=0; skip_id=0
  case "$first" in ssh|scp|sftp) ident=1 ;; esac
  j=0
  for w in "${words[@]}"; do
    j=$((j+1))
    [ "$j" -gt "$start" ] || continue
    if [ "$ident" = 1 ]; then
      if [ "$skip_id" = 1 ]; then skip_id=0; continue; fi
      lw=$(lower "$w")
      case "$lw" in
        -i|identityfile|-oidentityfile) skip_id=1; continue ;;
        -i?*|identityfile=*|-oidentityfile=*) continue ;;
      esac
    fi
    if [ "$skip_pat" = 1 ] && [ "$j" -gt $((start+1)) ]; then
      case "$w" in
        -e|-f|--regexp|--file) skip_pat=0 ;;
        -*) ;;
        *) skip_pat=0; continue ;;
      esac
    fi
    is_secret "$w" && deny "$w"
  done
done < <(printf '%s' "$CMD" | awk '{
  gsub(/&?[0-9]*>>?[|&]?[ ]*[^ ;|&()<>`]+/, " ")
  gsub(/&&|\|\||[;|&()`]/, "\n")
  print }')

exit 0

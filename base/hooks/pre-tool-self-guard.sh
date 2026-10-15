#!/usr/bin/env bash
# prumo-base · PreToolUse · self-guard
#
# O agente não muda o modo operacional, as aprovações nem a configuração dos
# guards. Protege:
#   ${PRUMO_HOME:-~/.prumo}/{mode,lab-mode,audit-active,org.json,guard.json,
#                            redact.json,secret-exec.json}, approvals/ e rules/
#   em qualquer .claude/settings.json ou settings.local.json: env.PRUMO_*,
#   enabledPlugins prumo-*, permissions.defaultMode e disableAllHooks
#
# Bloqueia em TODOS os modos, lab incluído — excepção ao prumo_fail_or_warn
# registada no FAILCLOSED_EXEMPT do validate.sh. Estes ficheiros definem o modo;
# um guard que dependesse do modo que protege era desligado por ele.
#
# Write/Edit/MultiEdit sobre settings: simula a escrita e compara a projecção
# protegida antes e depois. Uma edição de "N1" para "N3" não menciona PRUMO_,
# e só assim se apanha. No Bash não há simulação (best effort):
#   · verbo de escrita (incluindo curl, wget, scp, rsync) numa cláusula que
#     nomeie um ficheiro protegido ou o próprio ~/.prumo, ou redirecção para lá;
#   · `cd`/`pushd` para ~/.prumo ou approvals/, ou uma variável com esse
#     caminho ou com o de um ficheiro protegido, numa linha que escreva (verbo
#     ou `>`); o mesmo para .claude quando a linha nomeia um settings.json;
#   · `ln` (quaisquer opções) com um argumento que contenha `.prumo`, relativo
#     ou absoluto (`cd ~ && ln -s .prumo y`): o symlink deixava escrever em
#     ~/.prumo por um caminho que não o nomeia.
#
# Riscos residuais (best effort, não se tenta fechar): indirecções que não
# nomeiam o caminho na própria linha — `cd ~ && cd .prumo`, um symlink criado
# por outra via (glob, interpretador com caminho relativo), `for f in
# ~/.prumo/*`, um script que o agente escreveu e depois corre. Contra estas a
# barreira é o prompt de permissão do Bash; com o prumo-guard ativo, um
# approvals/<id> que o diálogo não gravou é apagado e recusado.
set -uo pipefail

HELPER="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}/lib/prumo-common.sh"
if [ -r "$HELPER" ]; then
  # shellcheck disable=SC1090
  source "$HELPER"
  prumo_telemetry_init "prumo-base" "self-guard"
else
  prumo_log() { :; }
  prumo_telemetry_record() { :; }
  prumo_real_path() { printf '%s' "$1"; }
fi

PLUGIN="prumo-base"
HOOK="self-guard"

deny() {
  prumo_log "$PLUGIN" "block" "$HOOK: $1"
  prumo_telemetry_record "$PLUGIN" "$HOOK" "block"
  # shellcheck disable=SC2034  # lido pelo trap _prumo_tm_on_exit em prumo-common.sh
  PRUMO_TM_RECORDED=1
  cat >&2 <<EOF
[prumo-base/self-guard] Bloqueado: $1

O modo, as aprovações e a configuração dos guards só mudam por ação humana:
  · no teu terminal:      echo dev > ~/.prumo/mode
  · com o prumo-guard:    /prumo-guard-mode dev
Este bloqueio vale em todos os modos, lab incluído.
EOF
  exit 2
}

INPUT=$(cat)
[ -n "$INPUT" ] || exit 0

if ! command -v jq >/dev/null 2>&1; then
  # Sem jq não há parsing fiável. Só bloqueia o que nomeia claramente um alvo.
  case "$INPUT" in
    *".prumo/"*|*"settings.json"*|*"settings.local.json"*) deny "jq indisponível e o pedido nomeia um ficheiro protegido" ;;
  esac
  exit 0
fi

TOOL=$(jq -r '.tool_name // empty' <<<"$INPUT" 2>/dev/null)
CWD=$(jq -r '.cwd // empty' <<<"$INPUT" 2>/dev/null)
[ -n "$CWD" ] || CWD="$PWD"

PRUMO_DIR_REAL=$(prumo_real_path "${PRUMO_HOME:-$HOME/.prumo}")
PROTECTED_NAMES="mode lab-mode audit-active org.json guard.json redact.json secret-exec.json"

is_protected_file() {
  # APFS é case-insensitive: ~/.prumo/Mode é o mesmo ficheiro.
  local f d n
  f=$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')
  d=$(printf '%s' "$PRUMO_DIR_REAL" | tr '[:upper:]' '[:lower:]')
  case "$f" in "$d/approvals"|"$d/approvals/"*|"$d/rules"|"$d/rules/"*) return 0 ;; esac
  for n in $PROTECTED_NAMES; do [ "$f" = "$d/$n" ] && return 0; done
  return 1
}

is_settings_file() {
  case "$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')" in */.claude/settings.json|*/.claude/settings.local.json) return 0 ;; esac
  return 1
}

protected_view() {
  jq -S '{
    env: ((.env // {}) | with_entries(select(.key | startswith("PRUMO_")))),
    plugins: ((.enabledPlugins // {}) | with_entries(select(.key | startswith("prumo-")))),
    defaultMode: (.permissions.defaultMode // null),
    disableAllHooks: (.disableAllHooks // null)
  }' 2>/dev/null
}

check_settings_write() {
  local fp="$1" current after before_v after_v
  current="{}"
  [ -r "$fp" ] && current=$(cat "$fp")
  after=$(jq -r --arg cur "$current" '
    .tool_input as $t
    | if .tool_name == "Write" then ($t.content // "")
      elif .tool_name == "Edit" then
        (if ($t.old_string // "") == "" then ($t.new_string // "")
         else ($cur | split($t.old_string) | join($t.new_string // "")) end)
      elif .tool_name == "MultiEdit" then
        reduce (($t.edits // [])[]) as $e ($cur;
          if ($e.old_string // "") == "" then ($e.new_string // "")
          else split($e.old_string) | join($e.new_string // "") end)
      else $cur end' <<<"$INPUT" 2>/dev/null) || after=""
  before_v=$(printf '%s' "$current" | protected_view)
  [ -n "$before_v" ] || before_v=$(printf '{}' | protected_view)
  after_v=$(printf '%s' "$after" | protected_view)
  if [ -z "$after_v" ]; then
    # Resultado não é JSON válido: só bloqueia se o texto novo tocar nas chaves.
    if printf '%s' "$after" | grep -qE 'PRUMO_|defaultMode|disableAllHooks|"prumo-'; then
      deny "escrita em $fp que deixa o JSON inválido e toca em chaves protegidas"
    fi
    return 0
  fi
  [ "$before_v" = "$after_v" ] || deny "alteração a env.PRUMO_*, enabledPlugins prumo-*, defaultMode ou disableAllHooks em $fp"
}

case "$TOOL" in
  Write|Edit|MultiEdit|NotebookEdit)
    FP=$(jq -r '.tool_input.file_path // .tool_input.notebook_path // empty' <<<"$INPUT")
    [ -n "$FP" ] || exit 0
    REAL=$(prumo_real_path "$FP" "$CWD")
    is_protected_file "$REAL" && deny "$TOOL em $REAL"
    if is_settings_file "$REAL"; then
      check_settings_write "$REAL"
    fi
    exit 0
    ;;
  Bash)
    CMD=$(jq -r '.tool_input.command // empty' <<<"$INPUT" | tr '\n\t' '  ')
    [ -n "$CMD" ] || exit 0
    ;;
  *)
    exit 0
    ;;
esac

# Escapa para ERE depois de colapsar '//' (o NORM também as colapsa; um TMPDIR
# com barra final dava HOME=.../T//x que nunca casaria).
re_escape() { printf '%s' "$1" | sed -E 's#/+#/#g' | sed 's/[][().*+?{}|^$\\]/\\&/g'; }

# Cópia normalizada da linha: sem aspas, sem /./ nem // repetidos, com /seg/../
# colapsado e sem redirecções inócuas (>/dev/null, 2>&1, >&2). O original fica
# para as mensagens.
NORM=$(printf '%s' "$CMD" | sed -E \
  -e "s/[\"']//g" \
  -e 's#[0-9]*>>?[[:space:]]*/dev/null##g' \
  -e 's#[0-9]*>&([0-9]+-?|-)([[:space:]]|$)# #g' \
  -e 's#>\|#>#g')
for _ in 1 2 3 4 5 6; do
  NORM=$(printf '%s' "$NORM" | sed -E -e 's#/+#/#g' -e 's#/\./#/#g' -e 's#/[^/ ]+/\.\./#/#')
done

# shellcheck disable=SC2016,SC2088  # regex literal: ~ e $HOME casam-se como texto na linha de comando
DIRS='~/\.prumo|\$HOME/\.prumo|\$\{HOME\}/\.prumo'
DIRS="$DIRS|$(re_escape "$HOME")/\\.prumo"
HOME_REAL=$(cd "$HOME" 2>/dev/null && pwd -P)
[ -n "$HOME_REAL" ] && [ "$HOME_REAL" != "$HOME" ] && DIRS="$DIRS|$(re_escape "$HOME_REAL")/\\.prumo"
[ "$PRUMO_DIR_REAL" != "$HOME/.prumo" ] && DIRS="$DIRS|$(re_escape "$PRUMO_DIR_REAL")"
[ -n "${PRUMO_HOME:-}" ] && DIRS="$DIRS|$(re_escape "$PRUMO_HOME")"
NAMES='(mode|lab-mode|audit-active|org\.json|guard\.json|redact\.json|secret-exec\.json)([^A-Za-z0-9._-]|$)|(approvals|rules)([^A-Za-z0-9._-]|$)'
PROT_RE="(${DIRS})/(${NAMES})"
SETTINGS_RE='\.claude/settings(\.local)?\.json'
REDIR_PROT_RE=">&?[[:space:]]*(${DIRS})/(${NAMES})"
REDIR_SETTINGS_RE=">&?[[:space:]]*[^[:space:]]*${SETTINGS_RE}"
# Os de download contam como escrita: `curl -o`, `wget -O`, `--output-dir` e `-P` gravam o
# ficheiro onde a linha disser.
VERB_RE='(^|[[:space:]/\\(`])(rm|mv|cp|ln|touch|unlink|truncate|install|tee|chmod|chown|dd|curl|wget|fetch|scp|sftp|ftp|rsync|python[0-9.]*|perl|ruby|node|osascript)([[:space:]]|$)|sed[[:space:]]+(-[a-zA-Z]*i|--in-place)'
# O próprio diretório como alvo (`cp x ~/.prumo/`, `rm -rf ~/.prumo`, `curl --output-dir ~/.prumo`).
PROT_DIR_RE="(${DIRS})/?([[:space:];&|)]|\$)"
# Mudar para o diretório (ou para approvals/), ou guardar numa variável esse diretório ou um
# ficheiro protegido, e escrever depois por caminho relativo ou pela variável. Um subdiretório
# não protegido (`~/.prumo/backups`, `~/.prumo/log`) não conta.
PROT_TARGET="(${DIRS})(/?([[:space:];&|)]|\$)|/(${NAMES}))"
CD_PROT_RE="(^|[[:space:];&|(])(cd|pushd)[[:space:]]+${PROT_TARGET}"
VAR_PROT_RE="(^|[[:space:];&|(])[A-Za-z_][A-Za-z0-9_]*=${PROT_TARGET}"
CD_CLAUDE_RE='(^|[[:space:];&|(])(cd|pushd)[[:space:]]+[^[:space:];&|]*\.claude/?([[:space:];&|)]|$)'
VAR_CLAUDE_RE='(^|[[:space:];&|(])[A-Za-z_][A-Za-z0-9_]*=[^[:space:];&|]*\.claude(/?([[:space:];&|)]|$)|/settings(\.local)?\.json)'
SETTINGS_NAME_RE='(^|[^A-Za-z0-9_.-])settings(\.local)?\.json'
INTERP_RE='(^|[[:space:]/\\(`])(python[0-9.]*|perl|ruby|node|osascript)([[:space:]]|$)|(^|[[:space:]/])(sh|bash|zsh)[[:space:]]+-[a-z]*c'
# `ln` seguido, na mesma cláusula, de um argumento com `.prumo` (relativo ou absoluto).
LN_PRUMO_RE='(^|[[:space:]/\\(`])ln[[:space:]].*\.prumo'

# Interpretador + ficheiro protegido em qualquer ponto da linha: um ';' dentro
# de aspas parte a linha em cláusulas e separa o verbo do caminho.
if printf '%s' "$NORM" | grep -qiE "$INTERP_RE"; then
  if printf '%s' "$NORM" | grep -qiE "$PROT_RE"; then
    deny "interpretador numa linha que nomeia um ficheiro protegido de ~/.prumo: ${CMD:0:120}"
  fi
  if printf '%s' "$NORM" | grep -qiE "$SETTINGS_RE"; then
    deny "interpretador numa linha que nomeia um settings do Claude Code: ${CMD:0:120}"
  fi
fi

# Escrita na linha: um verbo de escrita ou uma redirecção que sobrou da normalização.
line_writes() { printf '%s' "$NORM" | grep -qE "$VERB_RE" || printf '%s' "$NORM" | grep -q '>'; }

if printf '%s' "$NORM" | grep -qiE "$CD_PROT_RE|$VAR_PROT_RE" && line_writes; then
  deny "linha que entra em ~/.prumo (cd ou variável) e escreve: ${CMD:0:120}"
fi
if printf '%s' "$NORM" | grep -qiE "$CD_CLAUDE_RE|$VAR_CLAUDE_RE" && printf '%s' "$NORM" | grep -qiE "$SETTINGS_NAME_RE" && line_writes; then
  deny "linha que entra num .claude (cd ou variável) e escreve num settings: ${CMD:0:120}"
fi

while IFS= read -r clause; do
  [ -n "$clause" ] || continue
  # Redirecção para um alvo protegido, ou verbo de escrita + alvo na cláusula.
  # Ler um ficheiro protegido para outro (cat mode > /tmp/x) é leitura.
  if printf '%s' "$clause" | grep -qiE "$REDIR_PROT_RE"; then
    deny "comando que escreve num ficheiro protegido de ~/.prumo: ${clause:0:120}"
  fi
  if printf '%s' "$clause" | grep -qiE "$REDIR_SETTINGS_RE"; then
    deny "comando que escreve num settings do Claude Code: ${clause:0:120}"
  fi
  if printf '%s' "$clause" | grep -qiE "$LN_PRUMO_RE"; then
    deny "ln com um argumento em .prumo (um link para ~/.prumo contorna esta proteção): ${clause:0:120}"
  fi
  printf '%s' "$clause" | grep -qE "$VERB_RE" || continue
  if printf '%s' "$clause" | grep -qiE "$PROT_RE|$PROT_DIR_RE"; then
    deny "comando que escreve num ficheiro protegido de ~/.prumo: ${clause:0:120}"
  fi
  if printf '%s' "$clause" | grep -qiE "$SETTINGS_RE"; then
    deny "comando que escreve num settings do Claude Code: ${clause:0:120}"
  fi
done < <(printf '%s' "$NORM" | awk '{ gsub(/&&|\|\||;|\|/, "\n"); print }')

exit 0

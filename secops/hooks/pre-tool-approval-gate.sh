#!/usr/bin/env bash
# Wire SecOps · pre-tool · Approval gate (N1/N2/N3)
#
# Env-var-based — NÃO interactivo. Pattern: PRUMO_APPROVE=Nx <comando>
#
# Robustez (v0.4.0):
#   - $CMD é normalizado: newlines→espaços, tabs→espaços. Defesa contra payloads
#     multi-line tipo "DROP\nTABLE foo" que escapariam regex line-oriented grep.
#   - flag-matchers em rm/git aceitam combinações (-rf, -fr, -rfv, --force-with-lease).
#   - DROP TABLE aceita SQL comments inline (DROP/**/TABLE).
#   - cap production deploy não é anchored ao fim de linha (aceita --branch X etc).

set -euo pipefail
# shellcheck source=_lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

# Normaliza whitespace: newlines+tabs viram espaços simples para que grep line-
# oriented veja o comando como uma única linha. Idempotente em comandos curtos.
RAW_CMD=$(hook_tool_payload "${1:-}")
CMD=$(printf '%s' "$RAW_CMD" | tr '\n\t' '  ')

LEVEL=""

match() {
  # match <pattern> — true se $CMD bate o pattern extendido case-insensitive
  echo "$CMD" | grep -qiE "$1"
}

# ────────────────────────────────────────────────────────────────────────────
# N3 — catastrophic (parar no primeiro match)
# ────────────────────────────────────────────────────────────────────────────

# rm com flags variáveis (-rf, -fr, -rfv, --no-preserve-root etc) contra
# /forensics. Aceita zero ou mais grupos de flags antes do target.
#
# Fronteira de palavra obrigatória em todos os matchers "rm" deste ficheiro
# (mirror do fix em base/hooks/pre-tool-audit-guard.sh): o char antes do
# token "rm" tem de ser início-de-string, espaço, "/" ou "\" — nunca uma
# letra/dígito. Sem isto "rm" batia como substring de "confirm", "terraform",
# "platform", etc.
if [ -z "$LEVEL" ] && match '(^|[[:space:]]|/|\\)rm[[:space:]]+([-][^/[:space:]]+[[:space:]]+)*/forensics(/|[[:space:]]|$)'; then
  LEVEL="N3"
fi
if [ -z "$LEVEL" ] && match 'systemctl[[:space:]]+(stop|disable)\b'; then
  LEVEL="N3"
fi
if [ -z "$LEVEL" ] && match 'vault[[:space:]]+secrets[[:space:]]+disable\b'; then
  LEVEL="N3"
fi
# cap production deploy SEM :rollback (esse cai em N2). Non-anchored — aceita
# args trailing como --branch main, --dry-run, etc. Negative-lookahead em ERE
# é simulado: matchar 'deploy' seguido de espaço/EOL e NÃO ':rollback' adjacente.
if [ -z "$LEVEL" ] && match 'cap[[:space:]]+production[[:space:]]+deploy([[:space:]]|$)' \
   && ! match 'cap[[:space:]]+production[[:space:]]+deploy:rollback\b'; then
  LEVEL="N3"
fi

# ────────────────────────────────────────────────────────────────────────────
# N2 — cross-tenant ou prod data
# ────────────────────────────────────────────────────────────────────────────

# DROP TABLE/DATABASE/SCHEMA aceita comments inline tipo DROP/**/TABLE.
# `.{0,40}` cobre comments curtos sem perder especificidade.
if [ -z "$LEVEL" ] && match 'DROP.{0,40}(TABLE|DATABASE|SCHEMA)\b'; then
  LEVEL="N2"
fi
if [ -z "$LEVEL" ] && match 'cap[[:space:]]+production[[:space:]]+deploy:rollback\b'; then
  LEVEL="N2"
fi
if [ -z "$LEVEL" ] && match 'vault[[:space:]]+token[[:space:]]+revoke[[:space:]]+-accessor\b'; then
  LEVEL="N2"
fi
# Mass-delete SQL — o `.{0,40}` livre do DROP acima batia em prosa como "echo
# delete rows from table" (qualquer texto entre DELETE e FROM, até 40 chars).
# Aqui exige-se contexto SQL genuíno: DELETE e FROM ligados só por espaço(s)
# ou um comment inline curto (DELETE/**/FROM) — nunca outras palavras no meio.
if [ -z "$LEVEL" ] && match 'DELETE([[:space:]]|/\*[^*]*\*/)+FROM\b'; then
  LEVEL="N2"
fi

# ────────────────────────────────────────────────────────────────────────────
# N1 — destrutivo local
# ────────────────────────────────────────────────────────────────────────────

if [ -z "$LEVEL" ] && match '(^|[[:space:]]|/|\\|"|'"'"')truncate[[:space:]]+TABLE\b'; then
  LEVEL="N1"
fi
# git push aceita -f, --force, --force-with-lease (com ou sem =branch)
if [ -z "$LEVEL" ] && match 'git[[:space:]]+push[[:space:]]+([^[:space:]]+[[:space:]]+)*(-f\b|--force\b|--force-with-lease\b)'; then
  LEVEL="N1"
fi
# rm de $HOME ou /tmp com flags variáveis
# shellcheck disable=SC2016  # regex literal: casa a string '$HOME', não expande
if [ -z "$LEVEL" ] && match '(^|[[:space:]]|/|\\)rm[[:space:]]+([-][^/[:space:]]+[[:space:]]+)*\$HOME(/|[[:space:]]|$)'; then
  LEVEL="N1"
fi
if [ -z "$LEVEL" ] && match '(^|[[:space:]]|/|\\)rm[[:space:]]+([-][^/[:space:]]+[[:space:]]+)*/tmp(/|[[:space:]]|$)'; then
  LEVEL="N1"
fi
# Catch-all: rm com flag recursiva/força (-r, -f, -rf, -fr, --recursive,
# --force, ...) contra QUALQUER outro path não coberto pelas regras acima
# (/forensics já é N3; $HOME/.prumo e /tmp já são N1 acima). Sem isto,
# `rm -rf /qualquer/outro/caminho/prod` não batia nenhum pattern específico
# e passava sem aprovação (exit 0 silencioso).
#
# Fronteira de palavra obrigatória: sem ela, "deploy --confirm -f" e
# "terraform -force x" batiam falsamente porque "confirm"/"terraform" contêm
# "rm" como substring, seguido de "-f"/"-force" que a classe de flags aceita.
if [ -z "$LEVEL" ] && match '(^|[[:space:]]|/|\\)rm[[:space:]]+(-[a-zA-Z]*[rf][a-zA-Z]*|--recursive|--force)\b'; then
  LEVEL="N1"
fi

# Não-destrutivo → passa
[ -z "$LEVEL" ] && exit 0

# ────────────────────────────────────────────────────────────────────────────
# Gate
# ────────────────────────────────────────────────────────────────────────────

if [ "${PRUMO_APPROVE:-}" != "$LEVEL" ]; then
  CMD_PREVIEW=$(printf '%s' "$CMD" | head -c 100)
  cat >&2 <<EOF
[hook] approval-gate · Operação ${LEVEL} detectada:
  ${CMD_PREVIEW}

Para autorizar, re-executa com:
  PRUMO_APPROVE=${LEVEL} <comando>

Níveis (Wire SecOps):
  N1 = destrutivo local
  N2 = cross-tenant ou prod data
  N3 = catastrophic

Audit log: ${PRUMO_LOG_DIR:-\$HOME/.prumo/log}/approvals.log
EOF
  exit 2
fi

# ────────────────────────────────────────────────────────────────────────────
# Autorizado — log (best-effort; falha de I/O não bloqueia decisão)
# ────────────────────────────────────────────────────────────────────────────

# umask 077 · approvals.log pode conter fragmentos de comandos com credenciais
# embutidas (URLs com user:pass, tokens) — nunca criar com permissões ambiente
# (umask por defeito pode deixar o ficheiro world/group-readable).
umask 077
LOG_DIR="${PRUMO_LOG_DIR:-$HOME/.prumo/log}"
if mkdir -p "$LOG_DIR" 2>/dev/null; then
  # Redacta formas comuns de credencial antes de persistir: URLs com
  # user:pass@, Bearer tokens, token=..., VAULT_TOKEN=..., e o valor de -w
  # SÓ no contexto Keychain (`security find-generic-password ... -w`) — um
  # `-w` genérico mangla logs benignos como `grep -w foo` sem essa condição.
  CMD_LOG=$(printf '%s' "$CMD" | head -c 200 | sed -E \
    -e 's#(://[^:/@[:space:]]+:)[^@[:space:]]+(@)#\1***\2#g' \
    -e 's/([Bb]earer)[[:space:]]+[^[:space:]]+/\1 ***/g' \
    -e 's/([Tt]oken=)[^[:space:]&]+/\1***/g' \
    -e 's/(VAULT_TOKEN=)[^[:space:]]+/\1***/g' \
    -e '/security/{
/find-generic-password/{
s/(-w)([[:space:]]+[^[:space:]]+)?/\1 ***/g
}
}')
  touch "$LOG_DIR/approvals.log" 2>/dev/null && chmod 600 "$LOG_DIR/approvals.log" 2>/dev/null || true
  echo "$(date -u +%FT%TZ) | level=$LEVEL | user=${USER:-unknown} | cmd=${CMD_LOG}" \
    >> "$LOG_DIR/approvals.log" 2>/dev/null || true
fi
echo "[hook] approval-gate · ${LEVEL} authorised by PRUMO_APPROVE env var · logged." >&2

exit 0

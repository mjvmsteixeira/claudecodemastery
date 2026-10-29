#!/usr/bin/env bash
# vault-inbox-list.sh — lista a inbox do prumo-guard do projecto actual (só metadados).
#
# Uso:  vault-inbox-list.sh
# Saída: uma linha TSV por entrada: caminho, created_time, idade, estado (OK / ⚠ >7 dias).
# Só `kv list` e `kv metadata get`, nunca `kv get`: nenhum valor é lido. Identidade: token da
# pessoa (vault-env.sh); o AppRole não lista a inbox. Sem N2 no approval-gate (não há `kv get`).
# Exit: 0 listou (ou inbox vazia); 1 não foi possível listar (token, permissões, Vault selado).
# Segmento do projecto: o mesmo de `projectSegment` em guard/hooks/capture.ts. Limite assumido:
# nomes de pasta com emoji ou casos Unicode raros (ex.: `İ`) podem dar um segmento diferente
# do usado na captura.
set -uo pipefail

# shellcheck source=vault-env.sh
source "$(dirname "${BASH_SOURCE[0]}")/vault-env.sh" >/dev/null 2>&1

SEG=$(printf '%s' "$(basename "$PWD")" | jq -Rr 'ascii_downcase | gsub("[^a-z0-9]";"-") | sub("^-+";"") | sub("-+$";"")')
SEG=${SEG:-sessao}
INBOX="secret/inbox/$SEG"

unlistable() { echo "⚠ não foi possível listar $INBOX/ (token, permissões ou Vault selado)"; exit 1; }

command -v V >/dev/null 2>&1 || unlistable
vault_ready || unlistable

ERR=$(mktemp); trap 'rm -f "$ERR"' EXIT
OUT=$(V kv list -format=json "$INBOX" 2>"$ERR")
RC=$?
if [ "$RC" -ne 0 ]; then
  # Medido contra o CLI (Vault v2.0.0): inbox inexistente dá rc 2, stdout `{}` e stderr vazio.
  # Token inválido, sem `list` e Vault inacessível dão rc 2 com stdout vazio e erro no stderr.
  if [ "$RC" = 2 ] && { [ -z "$OUT" ] || [ "$OUT" = "{}" ]; } \
     && { [ ! -s "$ERR" ] || grep -q 'No value found' "$ERR"; }; then
    echo "Inbox vazia: $INBOX/"
    exit 0
  fi
  unlistable
fi
ENTRADAS=$(printf '%s' "$OUT" | jq -r '.[]?' 2>/dev/null) || unlistable
[ -n "$ENTRADAS" ] || { echo "Inbox vazia: $INBOX/"; exit 0; }

printf '%s\n' "$ENTRADAS" | while read -r entry; do
  case "$entry" in
    */) echo "⚠ subpasta inesperada: $INBOX/$entry"; continue ;;
  esac
  V kv metadata get -format=json "$INBOX/$entry" 2>/dev/null \
    | jq -r --arg p "$INBOX/$entry" \
      '(.data.versions[(.data.current_version | tostring)].created_time | sub("\\.[0-9]+Z$"; "Z")) as $t
       | (((now - ($t | fromdateiso8601)) / 86400) | floor) as $d
       | [$p, $t, "\($d) dias", (if $d > 7 then "⚠ >7 dias" else "OK" end)] | @tsv' 2>/dev/null \
    || echo "⚠ sem metadados: $INBOX/$entry"
done

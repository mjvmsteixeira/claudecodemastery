#!/usr/bin/env bash
# vault-promote.sh — promove um segredo da inbox do prumo-guard para o destino definitivo.
#
# Uso:  vault-promote.sh <secret/inbox/…#campo> <secret/destino> <campo>
# O valor corre num único pipe `kv get | kv put/patch`, nunca em variável, ficheiro,
# argv ou saída. Identidade: token da pessoa (vault-env.sh), nunca o AppRole.
# Leitura de volta por sha256 dos dois lados; só com hashes iguais apaga a inbox.
# Saída: `OK: <destino>#<campo> (promovido de <inbox-ref>)` ou um erro genérico.
set -uo pipefail
REF="${1:-}"; DEST="${2:-}"; F="${3:-}"
fail() { echo "vault-promote: $1" >&2; exit 1; }
[ -n "$REF" ] && [ -n "$DEST" ] && [ -n "$F" ] || fail "uso: vault-promote.sh <inbox-ref> <destino> <campo>"
[[ "$REF" == *#* ]] || fail "referência da inbox inválida (falta #campo)"
IN="${REF%%#*}"; IF="${REF#*#}"
FIELD_RE='^[A-Za-z0-9_][A-Za-z0-9_.-]*$'
[[ "$F" =~ $FIELD_RE ]] || fail "campo inválido"
[[ "$IF" =~ $FIELD_RE ]] || fail "referência da inbox inválida"
[[ "$IN" =~ ^secret/inbox/[A-Za-z0-9._/-]+$ ]] || fail "referência fora de secret/inbox/ ou inválida"
case "/$IN/" in */../*|*/./*|*//*) fail "referência inválida" ;; esac
[[ "$DEST" =~ ^secret/[A-Za-z0-9._/-]+$ ]] || fail "destino inválido"
case "/$DEST/" in */../*|*/./*|*//*) fail "destino inválido" ;; esac
case "$DEST/" in secret/inbox/*) fail "o destino não pode estar na inbox" ;; esac

# shellcheck source=vault-env.sh
source "$(dirname "${BASH_SOURCE[0]}")/vault-env.sh" >/dev/null 2>&1
[ -n "${VAULT_TOKEN:-}" ] || fail "sem token da pessoa"
command -v shasum >/dev/null 2>&1 || fail "shasum em falta"
command -v jq >/dev/null 2>&1 || fail "jq em falta (precisa dele para ler a versão do destino)"

EMPTY=e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
hash_of() { V kv get -field="$2" "$1" 2>/dev/null | shasum -a 256 | cut -d' ' -f1; }

H_IN=$(hash_of "$IN" "$IF") || fail "leitura da inbox falhou"
{ [ -n "$H_IN" ] && [ "$H_IN" != "$EMPTY" ]; } || fail "inbox vazia ou ilegível"

# A versão corrente do destino (o JSON do get passa direto ao jq, só sai o número).
# Falha de leitura conta como «não existe»; o `put -cas=0` falha então se existir.
PREV=$(V kv get -format=json "$DEST" 2>/dev/null | jq -r '.data.metadata.version // empty' 2>/dev/null) || PREV=""
if [ -n "$PREV" ]; then
  VERB="patch"; CAS="-cas=$PREV"
else
  VERB="put"; CAS="-cas=0"
fi

if [ "$VAULT_MODE" = "native" ]; then
  V kv get -field="$IF" "$IN" 2>/dev/null | V kv "$VERB" ${CAS:+"$CAS"} "$DEST" "$F=-" >/dev/null 2>&1
else
  # O stdin leva o token e o valor, nunca argv.
  { printf '%s\n' "$VAULT_TOKEN"; V kv get -field="$IF" "$IN" 2>/dev/null; } | docker exec -i \
    -e VAULT_ADDR="$VAULT_ADDR" \
    -e VAULT_CACERT="$VAULT_CACERT_IN_CONTAINER" \
    "$VAULT_CONTAINER" sh -c 'IFS= read -r t; VAULT_TOKEN="$t" exec vault kv "$@"' sh "$VERB" ${CAS:+"$CAS"} "$DEST" "$F=-" >/dev/null 2>&1
fi || {
  if [ "$VERB" = put ]; then
    fail "gravação falhou ($DEST#$F). Se o destino já existe e este token não o consegue ler, nada foi alterado (put -cas=0); a inbox ficou intacta"
  fi
  fail "gravação falhou ($DEST#$F); pode ter havido uma escrita concorrente no destino; a inbox ficou intacta"
}

H_OUT=$(hash_of "$DEST" "$F") || H_OUT=""
if [ "$H_OUT" != "$H_IN" ]; then
  if [ -n "$PREV" ]; then
    if V kv rollback -version="$PREV" "$DEST" >/dev/null 2>&1; then
      fail "leitura de volta não confere ($DEST#$F); destino revertido para a versão $PREV; a inbox ficou intacta"
    fi
    fail "leitura de volta não confere ($DEST#$F) e o rollback falhou; repor à mão: vault kv rollback -version=$PREV $DEST; a inbox ficou intacta"
  fi
  if V kv metadata delete "$DEST" >/dev/null 2>&1; then
    fail "leitura de volta não confere ($DEST#$F); o destino criado agora foi apagado; a inbox ficou intacta"
  fi
  fail "leitura de volta não confere ($DEST#$F) e apagar o destino falhou; apagar à mão: vault kv metadata delete $DEST; a inbox ficou intacta"
fi

echo "OK: $DEST#$F (promovido de $REF)"
if ! V kv metadata delete "$IN" >/dev/null 2>&1; then
  echo "vault-promote: aviso: a entrada da inbox não foi apagada ($IN)" >&2
  exit 3
fi

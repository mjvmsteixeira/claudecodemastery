#!/usr/bin/env bash
# Teste de base/lib/vault-write-field.sh com um `vault` falso no PATH (modo nativo).
# Nunca toca no Vault real: PRUMO_HOME e VAULT_HOME apontam para um tmp, sem token.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$HERE/../lib/vault-write-field.sh"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
mkdir -p "$T/bin" "$T/prumo" "$T/vhome"
cat > "$T/bin/vault" <<'FAKE'
#!/usr/bin/env bash
printf '%s\n' "$@" > "$FAKE_ARGV"
cat > "$FAKE_STDIN"
exit "${FAKE_EXIT:-0}"
FAKE
chmod +x "$T/bin/vault"

PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); echo "  ok   $1"; }
bad() { FAIL=$((FAIL+1)); echo "  FAIL $1"; }

run() { # run <exit-vault-falso> <caminho> <campo> ; valor em $VAL
  rm -f "$T/argv" "$T/stdin"
  printf '%s' "$VAL" | env -u VAULT_TOKEN -u VAULT_FORCE_DOCKER \
    PATH="$T/bin:/opt/homebrew/bin:/usr/bin:/bin" \
    PRUMO_HOME="$T/prumo" VAULT_HOME="$T/vhome" VAULT_ADDR="http://127.0.0.1:1" \
    FAKE_ARGV="$T/argv" FAKE_STDIN="$T/stdin" FAKE_EXIT="$1" \
    bash "$SCRIPT" "$2" "$3" >"$T/out" 2>"$T/err"
  RC=$?
}

A="ab"; B="cd"; SECRET="s3${A}${B}-XYZ"

echo "valor simples"
VAL="$SECRET"; run 0 secret/inbox/x/y value
[ "$RC" = 0 ] && ok "exit 0" || bad "exit $RC"
[ ! -s "$T/out" ] && ok "stdout vazio" || bad "stdout não vazio"
grep -qx 'kv' "$T/argv" && grep -qx 'put' "$T/argv" && grep -qx 'secret/inbox/x/y' "$T/argv" && grep -qx 'value=-' "$T/argv" \
  && ok "argv kv put <caminho> value=-" || bad "argv inesperado: $(tr '\n' ' ' <"$T/argv")"
grep -qF -- "$SECRET" "$T/argv" && bad "valor no argv" || ok "valor fora do argv"
[ "$(cat "$T/stdin")" = "$VAL" ] && ok "stdin == valor" || bad "stdin difere"

echo "multi-linha, byte-exacto"
VAL=$'linha1\nlinha2\n\nlinha4 com espaços  \n'; run 0 secret/inbox/m/n value
cmp -s <(printf '%s' "$VAL") "$T/stdin" && ok "multi-linha com newline final preservado" || bad "multi-linha difere"
VAL=$'sem newline final'; run 0 secret/inbox/m/n value
cmp -s <(printf '%s' "$VAL") "$T/stdin" && ok "sem newline final preservado" || bad "newline acrescentado"

echo "metacaracteres"
VAL='a$(echo PWNED)b"c'"'"'d`e`\n$HOME'; run 0 secret/inbox/q/r value
cmp -s <(printf '%s' "$VAL") "$T/stdin" && ok "\$(…), aspas e backticks literais" || bad "metacaracteres alterados"

echo "falha do vault"
VAL="$SECRET"; run 3 secret/inbox/x/y value
[ "$RC" = 1 ] && ok "exit 1" || bad "exit $RC"
grep -qF -- "$SECRET" "$T/err" "$T/out" && bad "valor vazou" || ok "sem valor no stderr/stdout"
grep -qF 'vault-write-field: gravação falhou (secret/inbox/x/y#value)' "$T/err" && ok "mensagem genérica" || bad "mensagem: $(cat "$T/err")"

echo "recusas"
VAL="$SECRET"
run 0 secret/outro/x value;     [ "$RC" = 1 ] && [ ! -e "$T/argv" ] && ok "fora de secret/inbox/" || bad "aceitou secret/outro"
run 0 secret/inbox/ value;      [ "$RC" = 1 ] && [ ! -e "$T/argv" ] && ok "caminho só prefixo" || bad "aceitou prefixo vazio"
run 0 secret/inbox/../x value;  [ "$RC" = 1 ] && [ ! -e "$T/argv" ] && ok "'..' recusado" || bad "aceitou .."
run 0 "" value;                 [ "$RC" = 1 ] && [ ! -e "$T/argv" ] && ok "caminho vazio" || bad "aceitou caminho vazio"
run 0 secret/inbox/x "";        [ "$RC" = 1 ] && [ ! -e "$T/argv" ] && ok "campo vazio" || bad "aceitou campo vazio"

echo "$PASS ok, $FAIL falhas"
[ "$FAIL" = 0 ]

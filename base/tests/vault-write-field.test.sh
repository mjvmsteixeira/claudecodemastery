#!/usr/bin/env bash
# Teste de base/lib/vault-write-field.sh com um `vault` falso no PATH (modo nativo).
# Nunca toca no Vault real: PRUMO_HOME e VAULT_HOME apontam para um tmp, sem token.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$HERE/../lib/vault-write-field.sh"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
mkdir -p "$T/bin" "$T/prumo" "$T/vhome" "$T/home"
cat > "$T/bin/vault" <<'FAKE'
#!/usr/bin/env bash
printf '%s\n' "$@" > "$FAKE_ARGV"
cat > "$FAKE_STDIN"
touch "$FAKE_RAN"
[ -n "${FAKE_ECHO:-}" ] && { cat "$FAKE_STDIN"; cat "$FAKE_STDIN" >&2; }
exit "${FAKE_EXIT:-0}"
FAKE
chmod +x "$T/bin/vault"
sed 's/^#!.*//' "$T/bin/vault" | { echo '#!/usr/bin/env bash'; cat; } > "$T/bin/docker"
chmod +x "$T/bin/docker"

PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); echo "  ok   $1"; }
bad() { FAIL=$((FAIL+1)); echo "  FAIL $1"; }

run() { # run <exit-falso> <caminho> <campo> ; valor em $VAL ; DOCKER=1 usa o ramo docker
  rm -f "$T/argv" "$T/stdin" "$T/ran"
  printf '%s' "$VAL" | env -u VAULT_TOKEN -u VAULT_FORCE_DOCKER \
    ${DOCKER:+VAULT_FORCE_DOCKER=1 VAULT_TOKEN=tok-$TOKX} FAKE_ECHO="${ECHO:-}" FAKE_RAN="$T/ran" \
    HOME="$T/home" \
    PATH="$T/bin:/opt/homebrew/bin:/usr/bin:/bin" \
    PRUMO_HOME="$T/prumo" VAULT_HOME="$T/vhome" VAULT_ADDR="http://127.0.0.1:1" \
    FAKE_ARGV="$T/argv" FAKE_STDIN="$T/stdin" FAKE_EXIT="$1" \
    bash "$SCRIPT" "$2" "$3" >"$T/out" 2>"$T/err"
  RC=$?
}

A="ab"; B="cd"; TOKX="q${A}z"; SECRET="s3${A}${B}-XYZ"

echo "valor simples"
VAL="$SECRET"; run 0 secret/inbox/x/y value
[ "$RC" = 0 ] && ok "exit 0" || bad "exit $RC"
[ ! -s "$T/out" ] && ok "stdout vazio" || bad "stdout não vazio"
grep -qx 'kv' "$T/argv" && grep -qx 'put' "$T/argv" && grep -qx 'secret/inbox/x/y' "$T/argv" && grep -qx 'value=-' "$T/argv" \
  && grep -qx -- '-cas=0' "$T/argv" && ok "argv kv put -cas=0 <caminho> value=-" || bad "argv inesperado: $(tr '\n' ' ' <"$T/argv")"
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

echo "falha com eco do stdin"
VAL="$SECRET"; ECHO=1 run 3 secret/inbox/x/y value; unset ECHO
[ "$RC" = 1 ] && ! grep -qF -- "$SECRET" "$T/err" "$T/out" && ok "eco do vault não chega ao stderr" || bad "valor no stderr"

echo "ramo docker"
VAL=$'v1\nv2 $(x)\n'; DOCKER=1 run 0 secret/inbox/d/e value
[ -e "$T/ran" ] && ok "docker falso correu" || bad "docker falso NÃO correu"
[ "$RC" = 0 ] && ok "exit 0" || bad "exit $RC"
cmp -s <(printf 'tok-%s\n%s' "$TOKX" "$VAL") "$T/stdin" && ok "stdin = token\\nvalor" || bad "stdin difere"
grep -qF -- "tok-$TOKX" "$T/argv" && bad "token no argv" || ok "token fora do argv"
grep -qF -- 'v2 $(x)' "$T/argv" && bad "valor no argv" || ok "valor fora do argv"
grep -qF -- 'kv put -cas=0' "$T/argv" && ok "docker: kv put -cas=0" || bad "docker sem -cas=0"
grep -qx 'secret/inbox/d/e' "$T/argv" && grep -qx 'value' "$T/argv" && grep -qx -- '-i' "$T/argv" && ok "argv docker exec -i … caminho campo" || bad "argv: $(tr '\n' ' ' <"$T/argv")"
VAL="$SECRET"; DOCKER=1 ECHO=1 run 3 secret/inbox/d/e value
[ -e "$T/ran" ] && [ "$RC" = 1 ] && ok "docker falha -> exit 1" || bad "docker falha: rc=$RC"
grep -qF -- "$SECRET" "$T/err" "$T/out" || grep -qF -- "tok-$TOKX" "$T/err" "$T/out" && bad "vazou" || ok "docker: sem vazamento"

echo "recusas"
VAL="$SECRET"
run 0 secret/outro/x value;     [ "$RC" = 1 ] && [ ! -e "$T/argv" ] && ok "fora de secret/inbox/" || bad "aceitou secret/outro"
run 0 secret/inbox/ value;      [ "$RC" = 1 ] && [ ! -e "$T/argv" ] && ok "caminho só prefixo" || bad "aceitou prefixo vazio"
run 0 secret/inbox/../x value;  [ "$RC" = 1 ] && [ ! -e "$T/argv" ] && ok "'..' recusado" || bad "aceitou .."
run 0 "" value;                 [ "$RC" = 1 ] && [ ! -e "$T/argv" ] && ok "caminho vazio" || bad "aceitou caminho vazio"
run 0 secret/inbox/x "";        [ "$RC" = 1 ] && [ ! -e "$T/argv" ] && ok "campo vazio" || bad "aceitou campo vazio"

run 0 secret/inbox/x -address=http://evil; [ "$RC" = 1 ] && [ ! -e "$T/ran" ] && ok "campo -opção recusado" || bad "aceitou -opção"
run 0 secret/inbox/x a=b;       [ "$RC" = 1 ] && [ ! -e "$T/ran" ] && ok "campo a=b recusado" || bad "aceitou a=b"
run 0 secret/inbox/x "a b";     [ "$RC" = 1 ] && [ ! -e "$T/ran" ] && ok "campo com espaço recusado" || bad "aceitou espaço"
run 0 $'secret/inbox/x\ny' value; [ "$RC" = 1 ] && [ ! -e "$T/ran" ] && ok "newline no caminho recusado" || bad "aceitou newline"

echo "$PASS ok, $FAIL falhas"
[ "$FAIL" = 0 ]

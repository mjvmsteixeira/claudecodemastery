#!/usr/bin/env bash
# Teste de base/lib/vault-write-field.sh com `vault` e `docker` falsos no PATH.
# Nunca toca no Vault real: HOME, PRUMO_HOME, VAULT_HOME e as credenciais apontam para um tmp.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$HERE/../lib/vault-write-field.sh"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
mkdir -p "$T/bin" "$T/prumo" "$T/vhome" "$T/home" "$T/projx"

# Um só falso para `vault` e `docker`. Login (arg auth/approle/login): grava argv/stdin do login e
# responde com o token "tok-<role_id>"; qualquer outra chamada é a gravação: grava argv/stdin e o VAULT_TOKEN do ambiente.
cat > "$T/bin/vault" <<'FAKE'
#!/usr/bin/env bash
case " $* " in
  *" auth/approle/login "*)
    printf '%s\n' "$@" > "$FAKE_DIR/argv.login"
    cat > "$FAKE_DIR/stdin.login"
    echo x >> "$FAKE_DIR/logins"
    [ "${FAKE_LOGIN_FAIL:-}" = 1 ] && exit 2
    rid=$(sed -n 's/.*"role_id":"\([^"]*\)".*/\1/p' "$FAKE_DIR/stdin.login")
    printf '{"auth":{"client_token":"tok-%s"}}\n' "$rid"
    exit 0 ;;
esac
printf '%s\n' "$@" > "$FAKE_DIR/argv"
printf '%s' "${VAULT_TOKEN:-}" > "$FAKE_DIR/envtoken"
cat > "$FAKE_DIR/stdin"
touch "$FAKE_DIR/ran"
[ -n "${FAKE_ECHO:-}" ] && { cat "$FAKE_DIR/stdin"; cat "$FAKE_DIR/stdin" >&2; }
exit "${FAKE_EXIT:-0}"
FAKE
chmod +x "$T/bin/vault"; cp "$T/bin/vault" "$T/bin/docker"

PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); echo "  ok   $1"; }
bad() { FAIL=$((FAIL+1)); echo "  FAIL $1"; }

# Marcadores, montados por concatenação: nenhum literal que pareça credencial.
A="ab"; B="cd"; SECRET="[prumo:SEGREDO]"
RID="RID-${A}1"; SID="SID-${B}2"; RID_PX="RID-px9"; SID_PX="SID-px9"
ROOTM="ROOT-${A}${B}"; INHM="INHERITED-${A}${B}"
TOKX="tok-$RID"
write_creds() { printf '{"agent-claude":{"role_id":"%s","secret_id":"%s"},"projx":{"role_id":"%s","secret_id":"%s"}}' "$RID" "$SID" "$RID_PX" "$SID_PX" > "$T/creds.json"; }
write_creds
printf '{"root_token":"%s"}' "$ROOTM" > "$T/vhome/vault-init.json"

# run <exit-falso> <caminho> <campo>; valor em $VAL; DOCKER=1 usa o ramo docker; cwd = projeto com role própria
run() {
  rm -f "$T/argv" "$T/stdin" "$T/ran" "$T/envtoken" "$T/argv.login" "$T/stdin.login" "$T/logins"
  [ -n "${KEEPCACHE:-}" ] || rm -f "$T/prumo/inbox-token-cache"
  ( cd "$T/projx" && printf '%s' "$VAL" | env -u VAULT_FORCE_DOCKER ${DOCKER:+VAULT_FORCE_DOCKER=1} \
    VAULT_TOKEN="$INHM" FAKE_DIR="$T" FAKE_EXIT="$1" FAKE_ECHO="${ECHO:-}" FAKE_LOGIN_FAIL="${LOGINFAIL:-}" \
    HOME="$T/home" PATH="$T/bin:/opt/homebrew/bin:/usr/bin:/bin" \
    PRUMO_HOME="$T/prumo" VAULT_HOME="$T/vhome" VAULT_ADDR="http://127.0.0.1:1" \
    PRUMO_VAULT_CREDS="${CREDS:-$T/creds.json}" \
    bash "$SCRIPT" "$2" "$3" >"$T/out" 2>"$T/err" )
  RC=$?
}
leaked() { # leaked <padrão>: aparece em algum rasto do fake (argv, stdin do login, token da gravação)?
  grep -qF -- "$1" "$T/argv" "$T/argv.login" 2>/dev/null
}

echo "valor simples"
VAL="$SECRET"; run 0 secret/inbox/x/y value
[ "$RC" = 0 ] && ok "exit 0" || bad "exit $RC: $(cat "$T/err")"
[ ! -s "$T/out" ] && ok "stdout vazio" || bad "stdout não vazio"
grep -qx 'kv' "$T/argv" && grep -qx 'put' "$T/argv" && grep -qx 'secret/inbox/x/y' "$T/argv" && grep -qx 'value=-' "$T/argv" \
  && grep -qx -- '-cas=0' "$T/argv" && ok "argv kv put -cas=0 <caminho> value=-" || bad "argv inesperado: $(tr '\n' ' ' <"$T/argv")"
grep -qF -- "$SECRET" "$T/argv" && bad "valor no argv" || ok "valor fora do argv"
[ "$(cat "$T/stdin")" = "$VAL" ] && ok "stdin == valor" || bad "stdin difere"

echo "login como agent-claude, sem segredos em argv"
[ -e "$T/argv.login" ] && ok "login feito" || bad "sem login"
grep -qF "$RID" "$T/stdin.login" && grep -qF "$SID" "$T/stdin.login" && ok "role_id e secret_id seguem por stdin" || bad "stdin do login: $(cat "$T/stdin.login" 2>/dev/null)"
leaked "$RID" && bad "role_id em argv" || ok "role_id fora do argv"
leaked "$SID" && bad "secret_id em argv" || ok "secret_id fora do argv"
grep -qF "$RID_PX" "$T/stdin.login" "$T/argv.login" && bad "usou a role do cwd ($RID_PX)" || ok "cwd com role própria não conta: agent-claude"
[ "$(cat "$T/envtoken")" = "$TOKX" ] && ok "gravação com o token do login" || bad "token da gravação: $(cat "$T/envtoken")"
grep -qF "$TOKX" "$T/argv" && bad "token em argv" || ok "token fora do argv"

echo "token raiz e token herdado nunca"
grep -rqF -- "$ROOTM" "$T/argv" "$T/stdin" "$T/envtoken" "$T/argv.login" "$T/stdin.login" "$T/prumo" 2>/dev/null && bad "token raiz chegou ao vault" || ok "token raiz nunca usado"
grep -rqF -- "$INHM" "$T/argv" "$T/stdin" "$T/envtoken" "$T/argv.login" "$T/stdin.login" "$T/prumo" 2>/dev/null && bad "VAULT_TOKEN herdado usado" || ok "VAULT_TOKEN herdado ignorado"

echo "cache do token"
CF="$T/prumo/inbox-token-cache"
[ -f "$CF" ] && ok "inbox-token-cache criada" || bad "sem cache"
MODE=$(stat -f%Lp "$CF" 2>/dev/null || stat -c%a "$CF" 2>/dev/null)
[ "$MODE" = 600 ] && ok "cache com modo 600" || bad "modo da cache: $MODE"
[ ! -e "$T/prumo/token-cache" ] && ok "token-cache dos outros hooks intacta" || bad "escreveu token-cache"
[ "$(cat "$CF")" = "$TOKX" ] && ok "cache guarda o token" || bad "conteúdo da cache"
VAL="$SECRET"; KEEPCACHE=1 run 0 secret/inbox/x/z value
[ "$RC" = 0 ] && [ ! -e "$T/logins" ] && [ ! -e "$T/argv.login" ] && ok "dentro do TTL reutiliza a cache, sem novo login" || bad "voltou a fazer login (rc=$RC)"
[ "$(cat "$T/envtoken")" = "$TOKX" ] && ok "gravação com o token em cache" || bad "token em cache não usado"
touch -t 202001010000 "$CF"
VAL="$SECRET"; KEEPCACHE=1 run 0 secret/inbox/x/z value
[ "$RC" = 0 ] && [ -e "$T/argv.login" ] && ok "cache expirada -> novo login" || bad "cache expirada reutilizada"

echo "sem credenciais ou login falhado: exit 1, nenhuma gravação, nunca o token raiz"
VAL="$SECRET"; CREDS="$T/nao-existe.json" run 0 secret/inbox/x/y value
[ "$RC" = 1 ] && [ ! -e "$T/ran" ] && ok "ficheiro de credenciais ausente" || bad "rc=$RC ran=$([ -e "$T/ran" ] && echo sim)"
printf '{"projx":{"role_id":"%s","secret_id":"%s"}}' "$RID_PX" "$SID_PX" > "$T/creds-sem.json"
CREDS="$T/creds-sem.json" run 0 secret/inbox/x/y value
[ "$RC" = 1 ] && [ ! -e "$T/ran" ] && [ ! -e "$T/argv.login" ] && ok "sem agent-claude (só a role do cwd): recusa" || bad "usou outra role (rc=$RC)"
LOGINFAIL=1 run 0 secret/inbox/x/y value
[ "$RC" = 1 ] && [ ! -e "$T/ran" ] && ok "login falhado" || bad "login falhado: rc=$RC"
[ ! -e "$T/prumo/inbox-token-cache" ] && ok "login falhado não deixa cache" || bad "cache após falha"
grep -qF -- "$SECRET" "$T/err" "$T/out" && bad "valor vazou" || ok "mensagens sem valor"
grep -rqF -- "$ROOTM" "$T/argv" "$T/stdin" "$T/envtoken" "$T/stdin.login" 2>/dev/null && bad "caiu no token raiz" || ok "sem fallback para o token raiz"

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
[ "$RC" = 0 ] && ok "exit 0" || bad "exit $RC: $(cat "$T/err")"
cmp -s <(printf '%s\n%s' "$TOKX" "$VAL") "$T/stdin" && ok "stdin = token do login\\nvalor" || bad "stdin difere"
grep -qF -- "$TOKX" "$T/argv" "$T/argv.login" && bad "token no argv" || ok "token fora do argv"
grep -qF -- 'v2 $(x)' "$T/argv" && bad "valor no argv" || ok "valor fora do argv"
grep -qF "$RID" "$T/stdin.login" && grep -qF "$SID" "$T/stdin.login" && ok "docker: login com role_id/secret_id por stdin" || bad "docker: stdin do login"
leaked "$RID" && bad "docker: role_id em argv" || ok "docker: role_id fora do argv"
leaked "$SID" && bad "docker: secret_id em argv" || ok "docker: secret_id fora do argv"
grep -qF "$RID_PX" "$T/stdin.login" && bad "docker: role do cwd" || ok "docker: agent-claude mesmo com role no cwd"
grep -rqF -- "$ROOTM" "$T/argv" "$T/stdin" "$T/argv.login" "$T/stdin.login" 2>/dev/null && bad "docker: token raiz" || ok "docker: token raiz nunca"
grep -rqF -- "$INHM" "$T/argv" "$T/stdin" "$T/argv.login" "$T/stdin.login" 2>/dev/null && bad "docker: token herdado" || ok "docker: token herdado ignorado"
grep -qF -- 'kv put -cas=0' "$T/argv" && ok "docker: kv put -cas=0" || bad "docker sem -cas=0"
grep -qx 'secret/inbox/d/e' "$T/argv" && grep -qx 'value' "$T/argv" && grep -qx -- '-i' "$T/argv" && ok "argv docker exec -i … caminho campo" || bad "argv: $(tr '\n' ' ' <"$T/argv")"
[ "$(stat -f%Lp "$CF" 2>/dev/null || stat -c%a "$CF")" = 600 ] && ok "docker: cache 600" || bad "docker: modo da cache"
VAL="$SECRET"; DOCKER=1 ECHO=1 run 3 secret/inbox/d/e value
[ -e "$T/ran" ] && [ "$RC" = 1 ] && ok "docker falha -> exit 1" || bad "docker falha: rc=$RC"
grep -qF -- "$SECRET" "$T/err" "$T/out" || grep -qF -- "$TOKX" "$T/err" "$T/out" && bad "vazou" || ok "docker: sem vazamento"
VAL="$SECRET"; DOCKER=1 CREDS="$T/nao-existe.json" run 0 secret/inbox/d/e value
[ "$RC" = 1 ] && [ ! -e "$T/ran" ] && ok "docker sem credenciais -> exit 1, sem gravação" || bad "docker sem credenciais: rc=$RC"

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

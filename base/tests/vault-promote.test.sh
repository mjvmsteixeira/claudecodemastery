#!/usr/bin/env bash
# Teste de base/lib/vault-promote.sh com `vault` e `docker` falsos no PATH.
# O falso guarda os segredos num tmp (kv/), regista argv e token de cada chamada.
# Nunca toca no Vault real: HOME, VAULT_HOME e as credenciais apontam para um tmp.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$HERE/../lib/vault-promote.sh"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
mkdir -p "$T/bin" "$T/vhome" "$T/home"

cat > "$T/bin/vault" <<'FAKE'
#!/usr/bin/env bash
D="$FAKE_DIR"; KV="$D/kv"
key() { printf '%s' "$1" | tr '/' '_'; }
printf '%s\n' "$*" >> "$D/argv.log"
run_vault() {
  printf '%s\n' "${VAULT_TOKEN:-}" >> "$D/tokens.log"
  [ "$1 $2" = "kv get" ] && printf '%s\n' "$*" >> "$D/gets.log"
  case "$1 $2" in
    "kv get")
      shift 2; fld=""; fmt=""
      for a in "$@"; do case "$a" in -field=*) fld="${a#-field=}";; -format=*) fmt=1;; *) p="$a";; esac; done
      d="$KV/$(key "$p")"
      case "$p" in secret/inbox/*) ;; *) [ -n "${FAKE_NOREAD_DEST:-}" ] && exit 2 ;; esac
      [ -d "$d" ] || exit 2
      if [ -n "$fld" ]; then [ -f "$d/$fld" ] || exit 2; cat "$d/$fld"
      else printf '{"data":{"data":{},"metadata":{"version":%s}}}\n' "$(cat "$d/.ver")"; fi
      exit 0 ;;
    "kv put"|"kv patch")
      verb="$2"; shift 2; cas=""
      for a in "$@"; do case "$a" in -cas=*) cas="${a#-cas=}";; *) set -- "$@"; esac; done
      pos=(); for a in "$@"; do case "$a" in -*) ;; *) pos+=("$a");; esac; done
      path="${pos[0]}"; f="${pos[1]%=-}"
      d="$KV/$(key "$path")"
      if [ "$verb" = put ]; then
        [ -n "${FAKE_PUTFAIL:-}" ] && { cat >/dev/null; exit 3; }
        [ "$cas" = 0 ] && [ -d "$d" ] && { cat >/dev/null; exit 3; }
        [ -d "$d" ] && touch "$D/put-on-existing"
        v=$(cat "$d/.ver" 2>/dev/null || echo 0); rm -rf "$d"; mkdir -p "$d"; echo $((v+1)) > "$d/.ver"
      else
        [ -d "$d" ] || { cat >/dev/null; exit 2; }
        echo $(( $(cat "$d/.ver") + 1 )) > "$d/.ver"
      fi
      cat > "$d/$f"
      [ -n "${FAKE_CORRUPT:-}" ] && printf 'x' >> "$d/$f"
      mkdir -p "$D/snap"; rm -rf "$D/snap/$(key "$path").$(cat "$d/.ver")"; cp -R "$d" "$D/snap/$(key "$path").$(cat "$d/.ver")"
      echo "$verb $path" >> "$D/writes.log"; exit 0 ;;
    "kv rollback")
      [ -n "${FAKE_ROLLFAIL:-}" ] && exit 5
      shift 2; ver=""; for a in "$@"; do case "$a" in -version=*) ver="${a#-version=}";; *) path="$a";; esac; done
      d="$KV/$(key "$path")"; v=$(( $(cat "$d/.ver") + 1 ))
      rm -rf "$d"; cp -R "$D/snap/$(key "$path").$ver" "$d"; echo "$v" > "$d/.ver"
      echo "rollback $ver $path" >> "$D/writes.log"; exit 0 ;;
    "kv metadata")
      [ "$3" = delete ] || exit 2
      [ -n "${FAKE_DELFAIL:-}" ] && exit 4
      rm -rf "$KV/$(key "$4")"; echo "$4" >> "$D/deleted.log"; exit 0 ;;
  esac
  exit 9
}
case "$(basename "$0")" in
  vault) run_vault "$@" ;;
  docker)
    echo docker >> "$D/docker.calls"
    i=0; for a in "$@"; do
      i=$((i+1))
      if [ "$a" = vault-token-sh ]; then VAULT_TOKEN="$(cat)"; export VAULT_TOKEN; shift "$i"; run_vault "$@"; fi
    done
    if printf '%s' "$*" | grep -qF 'IFS= read -r t'; then
      IFS= read -r VAULT_TOKEN || true; export VAULT_TOKEN
      while ! printf '%s' "$1" | grep -qF 'IFS= read -r t'; do shift; done; shift 2
      run_vault kv "$@"
    fi
    exit 9 ;;
esac
FAKE
chmod +x "$T/bin/vault"; cp "$T/bin/vault" "$T/bin/docker"

PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); echo "  ok   $1"; }
bad() { FAIL=$((FAIL+1)); echo "  FAIL $1"; }

A="ab"; B="cd"
TOKP="person-${A}${B}"; ROOTM="ROOT-${A}${B}"
INB=secret/inbox/proj/api; DST=secret/projects/proj/svc
KVD() { printf '%s' "$1" | tr '/' '_'; }
setup() { # setup <valor> [campo-inbox]
  rm -rf "$T/kv" "$T/snap" "$T"/*.log "$T/put-on-existing" "$T/docker.calls"
  mkdir -p "$T/kv/$(KVD "$INB")"; echo 1 > "$T/kv/$(KVD "$INB")/.ver"; printf '%s' "$1" > "$T/kv/$(KVD "$INB")/${2:-value}"
}
dest_file() { echo "$T/kv/$(KVD "$1")/$2"; }
run() { # run <inbox-ref> <destino> <campo>
  ( env -u VAULT_FORCE_DOCKER ${DOCKER:+VAULT_FORCE_DOCKER=1} \
    VAULT_TOKEN="$TOKP" FAKE_DIR="$T" FAKE_CORRUPT="${CORRUPT:-}" FAKE_PUTFAIL="${PUTFAIL:-}" FAKE_DELFAIL="${DELFAIL:-}" FAKE_NOREAD_DEST="${NOREAD:-}" FAKE_ROLLFAIL="${ROLLFAIL:-}" \
    HOME="$T/home" PATH="$T/bin:/opt/homebrew/bin:/usr/bin:/bin" \
    VAULT_HOME="$T/vhome" VAULT_ADDR="http://127.0.0.1:1" PRUMO_VAULT_CREDS="$T/creds.json" \
    bash "$SCRIPT" "$1" "$2" "$3" >"$T/out" 2>"$T/err" )
  RC=$?
}
noleak() { # noleak <valor>: valor fora de stdout/stderr/argv
  grep -qF -- "$1" "$T/out" "$T/err" "$T/argv.log" 2>/dev/null && bad "valor vazou" || ok "valor fora de stdout/stderr/argv"
}
VAL=$'sv-'"${A}${B}"$'-linha1\nlinha2 $(x) `y` "z"\n'

echo "destino novo -> put"
setup "$VAL"; run "$INB#value" $DST api_key
[ "$RC" = 0 ] && ok "exit 0" || bad "exit $RC: $(cat "$T/err")"
[ "$(cat "$T/out")" = "OK: $DST#api_key (promovido de $INB#value)" ] && ok "saída exacta" || bad "saída: $(cat "$T/out")"
cmp -s <(printf '%s' "$VAL") "$(dest_file $DST api_key)" && ok "destino byte-exacto" || bad "destino difere"
grep -qx "put $DST" "$T/writes.log" && ok "usou put" || bad "não usou put"
[ ! -e "$T/kv/$(KVD "$INB")" ] && grep -qx "$INB" "$T/deleted.log" && ok "inbox apagada" || bad "inbox não apagada"
noleak "sv-${A}${B}"
[ ! -s "$T/err" ] && ok "stderr vazio" || bad "stderr: $(cat "$T/err")"
[ -s "$T/tokens.log" ] && [ "$(grep -vxc "$TOKP" "$T/tokens.log")" = 0 ] && ok "todas as chamadas com o token da pessoa" || bad "token inesperado"
grep -q 'auth/approle' "$T/argv.log" && bad "usou AppRole" || ok "sem login AppRole"
grep -qF "$TOKP" "$T/argv.log" && bad "token no argv" || ok "token fora do argv"

echo "destino existente -> patch, preserva outras chaves"
setup "$VAL"; mkdir -p "$T/kv/$(KVD $DST)"; echo 1 > "$T/kv/$(KVD $DST)/.ver"; printf 'outro' > "$(dest_file $DST other)"; cp -R "$T/kv/$(KVD $DST)" "$T/snap_seed" 2>/dev/null; mkdir -p "$T/snap"; cp -R "$T/kv/$(KVD $DST)" "$T/snap/$(KVD $DST).1"
run "$INB#value" $DST api_key
[ "$RC" = 0 ] && grep -qx "patch $DST" "$T/writes.log" && ok "usou patch" || bad "rc=$RC writes=$(cat "$T/writes.log" 2>/dev/null)"
[ ! -e "$T/put-on-existing" ] && ok "nunca put em existente" || bad "put em existente"
[ "$(cat "$(dest_file $DST other)")" = outro ] && ok "outra chave preservada" || bad "outra chave perdida"
cmp -s <(printf '%s' "$VAL") "$(dest_file $DST api_key)" && ok "campo gravado" || bad "campo difere"
[ ! -e "$T/kv/$(KVD "$INB")" ] && ok "inbox apagada" || bad "inbox ficou"

echo "campo da inbox diferente de value"
setup "$VAL" token; run "$INB#token" $DST k
[ "$RC" = 0 ] && grep -qx -- "kv get -field=token $INB" "$T/gets.log" && ok "get -field=token" || bad "rc=$RC"

echo "leitura de volta diferente -> não apaga, exit 1"
setup "$VAL"; CORRUPT=1 run "$INB#value" $DST api_key
[ "$RC" = 1 ] && ok "exit 1" || bad "exit $RC"
[ -e "$T/kv/$(KVD "$INB")/value" ] && ! grep -qx "$INB" "$T/deleted.log" 2>/dev/null && ok "inbox intacta" || bad "inbox apagada"
[ ! -s "$T/out" ] && ok "stdout vazio" || bad "stdout: $(cat "$T/out")"
noleak "sv-${A}${B}"

echo "gravação falhada -> não apaga"
setup "$VAL"; PUTFAIL=1 run "$INB#value" $DST api_key
[ "$RC" = 1 ] && [ -e "$T/kv/$(KVD "$INB")/value" ] && [ ! -e "$T/deleted.log" ] && ok "exit 1, inbox intacta" || bad "rc=$RC"
noleak "sv-${A}${B}"

echo "inbox inexistente ou vazia -> exit 1, sem gravar"
setup "$VAL"; run "secret/inbox/nao/existe#value" $DST api_key
[ "$RC" = 1 ] && [ ! -e "$T/writes.log" ] && ok "inexistente" || bad "inexistente rc=$RC"
setup ""; run "$INB#value" $DST api_key
[ "$RC" = 1 ] && [ ! -e "$T/writes.log" ] && [ -e "$T/kv/$(KVD "$INB")/value" ] && ok "valor vazio recusado" || bad "vazio rc=$RC"

echo "apagar falha -> promoção mantida, aviso em stderr"
setup "$VAL"; DELFAIL=1 run "$INB#value" $DST api_key
[ "$RC" = 3 ] && [ "$(grep -c "OK: " "$T/out")" = 1 ] && [ -s "$T/err" ] && ok "exit 3, OK uma vez no stdout, aviso no stderr" || bad "rc=$RC"
noleak "sv-${A}${B}"

echo "destino existente mas ilegível -> put -cas=0 falha, nada se perde"
setup "$VAL"; mkdir -p "$T/kv/$(KVD $DST)"; echo 1 > "$T/kv/$(KVD $DST)/.ver"; printf 'outro' > "$(dest_file $DST other)"
NOREAD=1 run "$INB#value" $DST api_key
[ "$RC" = 1 ] && ok "exit 1" || bad "exit $RC"
[ "$(cat "$(dest_file $DST other)" 2>/dev/null)" = outro ] && [ ! -e "$T/put-on-existing" ] && ok "outra chave intacta" || bad "chave perdida"
grep -q 'put -cas=0' "$T/argv.log" && ok "put -cas=0" || bad "put sem -cas=0"
grep -q 'não o consegue ler' "$T/err" && ok "mensagem clara" || bad "mensagem: $(cat "$T/err")"
[ -e "$T/kv/$(KVD "$INB")/value" ] && ok "inbox intacta" || bad "inbox apagada"
setup "$VAL"; mkdir -p "$T/kv/$(KVD $DST)"; echo 1 > "$T/kv/$(KVD $DST)/.ver"; printf 'outro' > "$(dest_file $DST other)"
DOCKER=1 NOREAD=1 run "$INB#value" $DST api_key
[ "$RC" = 1 ] && [ "$(cat "$(dest_file $DST other)" 2>/dev/null)" = outro ] && grep -q -- '-cas=0' "$T/argv.log" && ok "docker: put -cas=0, nada perdido" || bad "docker cas rc=$RC"

echo "divergência reverte o destino"
setup "$VAL"; mkdir -p "$T/kv/$(KVD $DST)"; echo 1 > "$T/kv/$(KVD $DST)/.ver"; printf 'antigo' > "$(dest_file $DST api_key)"; printf 'outro' > "$(dest_file $DST other)"
mkdir -p "$T/snap"; cp -R "$T/kv/$(KVD $DST)" "$T/snap/$(KVD $DST).1"
CORRUPT=1 run "$INB#value" $DST api_key
[ "$RC" = 1 ] && grep -qx "rollback 1 $DST" "$T/writes.log" && ok "rollback -version=1" || bad "rc=$RC"
[ "$(cat "$(dest_file $DST api_key)")" = antigo ] && [ "$(cat "$(dest_file $DST other)")" = outro ] && ok "destino restaurado" || bad "destino não restaurado"
grep -q 'revert' "$T/err" && ok "mensagem diz o que foi feito" || bad "mensagem: $(cat "$T/err")"
noleak "sv-${A}${B}"
setup "$VAL"; CORRUPT=1 run "$INB#value" $DST api_key
[ "$RC" = 1 ] && [ ! -e "$T/kv/$(KVD $DST)" ] && grep -qx "$DST" "$T/deleted.log" && ok "destino criado agora é apagado" || bad "criado: rc=$RC"
grep -q 'apagad' "$T/err" && ok "mensagem: destino apagado" || bad "mensagem: $(cat "$T/err")"
setup "$VAL"; mkdir -p "$T/kv/$(KVD $DST)"; echo 1 > "$T/kv/$(KVD $DST)/.ver"; printf 'antigo' > "$(dest_file $DST api_key)"
mkdir -p "$T/snap"; cp -R "$T/kv/$(KVD $DST)" "$T/snap/$(KVD $DST).1"
CORRUPT=1 ROLLFAIL=1 run "$INB#value" $DST api_key
[ "$RC" = 1 ] && grep -qF "vault kv rollback -version=1 $DST" "$T/err" && ok "rollback falhado: comando manual na mensagem" || bad "rollfail: $(cat "$T/err")"
[ -e "$T/kv/$(KVD "$INB")/value" ] && ok "inbox intacta" || bad "inbox apagada"
noleak "sv-${A}${B}"

echo "recusas"
for c in "secret/outro/x#value|$DST|k|ref fora da inbox" "secret/inbox/x|$DST|k|ref sem #campo" \
         "secret/inbox/../x#value|$DST|k|ref com .." "secret/inbox/x#a b|$DST|k|campo da ref inválido" \
         "$INB#value|secret/inbox/z|k|destino na inbox" "$INB#value|secret/inbox|k|destino é a inbox" \
         "$INB#value|other/x|k|destino fora de secret/" "$INB#value|secret/|k|destino só prefixo" \
         "$INB#value|secret/a/../b|k|destino com .." "$INB#value|secret/a//b|k|destino com //" \
         "$INB#value|$DST|-address=x|campo -opção" "$INB#value|$DST|a=b|campo a=b" "$INB#value|$DST||campo vazio" \
         "|$DST|k|ref vazia"; do
  IFS='|' read -r r d f n <<<"$c"
  setup "$VAL"; run "$r" "$d" "$f"
  [ "$RC" = 1 ] && [ ! -e "$T/argv.log" ] && ok "$n" || bad "$n (rc=$RC)"
done

echo "ramo docker"
setup "$VAL"; DOCKER=1 run "$INB#value" $DST api_key
[ -e "$T/docker.calls" ] && ok "docker falso correu" || bad "docker falso NÃO correu"
[ "$RC" = 0 ] && ok "exit 0" || bad "exit $RC: $(cat "$T/err")"
[ "$(cat "$T/out")" = "OK: $DST#api_key (promovido de $INB#value)" ] && ok "saída exacta" || bad "saída: $(cat "$T/out")"
cmp -s <(printf '%s' "$VAL") "$(dest_file $DST api_key)" && ok "destino byte-exacto" || bad "destino difere"
[ ! -e "$T/kv/$(KVD "$INB")" ] && ok "inbox apagada" || bad "inbox ficou"
grep -qF "$TOKP" "$T/argv.log" && bad "token no argv" || ok "token fora do argv"
noleak "sv-${A}${B}"
grep -qx "$TOKP" "$T/tokens.log" && [ "$(grep -vxc "$TOKP" "$T/tokens.log")" = 0 ] && ok "docker: token da pessoa em todas" || bad "docker: tokens"
setup "$VAL"; mkdir -p "$T/kv/$(KVD $DST)"; echo 1 > "$T/kv/$(KVD $DST)/.ver"; DOCKER=1 run "$INB#value" $DST api_key
grep -qx "patch $DST" "$T/writes.log" && ok "docker: patch em existente" || bad "docker: patch"
setup "$VAL"; DOCKER=1 CORRUPT=1 run "$INB#value" $DST api_key
[ "$RC" = 1 ] && [ -e "$T/kv/$(KVD "$INB")/value" ] && ok "docker: divergência -> não apaga" || bad "docker: divergência rc=$RC"
noleak "sv-${A}${B}"

echo "$PASS ok, $FAIL falhas"
[ "$FAIL" = 0 ]

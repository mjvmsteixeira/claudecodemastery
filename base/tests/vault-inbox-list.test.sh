#!/usr/bin/env bash
# Teste de base/lib/vault-inbox-list.sh com `vault` falso no PATH e HOME temporário.
# Nunca toca no Vault real.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$HERE/../lib/vault-inbox-list.sh"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
mkdir -p "$T/bin" "$T/home" "$T/vhome"
FAILS=0

# Saídas (rc, stdout, stderr) medidas contra o CLI real, Vault v2.0.0 (vault server -dev), em 2026-10-29.
cat > "$T/bin/vault" <<'FAKE'
#!/usr/bin/env bash
# FAKE_LIST: entradas separadas por espaço; "" -> inbox inexistente. O token escolhe o cenário de erro.
case "$1" in
  status) [ "${VAULT_ADDR##*:}" = 1 ] && { echo 'Get "http://127.0.0.1:1/v1/sys/seal-status": dial tcp 127.0.0.1:1: connect: connection refused' >&2; exit 2; }
          echo '{"sealed":false}'; exit 0 ;;
esac
[ "$1 $2" = "kv get" ] && { echo "KVGET" >> "$FAKE_DIR/kvget.log"; echo "SEGREDO-NAO-DEVIA-SAIR"; exit 0; }
case "$1 $2" in
  "kv list")
    printf '%s\n' "$*" >> "$FAKE_DIR/lists.log"
    case "${VAULT_TOKEN:-}" in
      bad) printf 'Error making API request.\n\nURL: GET http://127.0.0.1:18299/v1/sys/internal/ui/mounts/secret/inbox/proj\nCode: 403. Errors:\n\n* 2 errors occurred:\n\t* permission denied\n\t* invalid token\n' >&2; exit 2 ;;
      nolist) printf 'Error listing secret/metadata/inbox/proj: Error making API request.\n\nURL: GET http://127.0.0.1:18299/v1/secret/metadata/inbox/proj?list=true\nCode: 403. Errors:\n\n* 1 error occurred:\n\t* permission denied\n' >&2; exit 2 ;;
    esac
    [ -n "${FAKE_LIST:-}" ] || { echo '{}'; exit 2; }
    printf '['; sep=""; for e in $FAKE_LIST; do printf '%s"%s"' "$sep" "$e"; sep=","; done; printf ']\n' ;;
  "kv metadata")
    p="${@: -1}"; n="${p##*/}"
    case "$n" in
      old*) t="2026-01-01T10:00:00.123456789Z" ;;
      *) t=$(date -u +%Y-%m-%dT%H:%M:%S.000000000Z) ;;
    esac
    printf '{"data":{"current_version":1,"versions":{"1":{"created_time":"%s"}}}}\n' "$t" ;;
esac
FAKE
chmod +x "$T/bin/vault"

# run <cwd-basename> <FAKE_LIST> [token]  -> OUT, RC
run() {
  local d="$T/cwd/$1"; mkdir -p "$d"; : > "$T/lists.log"
  OUT=$(cd "$d" && HOME="$T/home" VAULT_HOME="$T/vhome" VAULT_ADDR="${4:-http://127.0.0.1:18299}" VAULT_TOKEN="${3:-good}" \
    VAULT_FORCE_DOCKER='' PATH="$T/bin:$PATH" FAKE_DIR="$T" FAKE_LIST="$2" \
    bash "$SCRIPT" 2>&1)
  RC=$?
}
ok() { echo "  ✓ $1"; }
ko() { echo "  ✗ $1"; echo "$OUT" | sed 's/^/      /'; FAILS=$((FAILS+1)); }
has() { grep -qF -- "$1" <<<"$OUT"; }

echo "vault-inbox-list"
run proj ""
{ [ $RC = 0 ] && has "Inbox vazia: secret/inbox/proj/"; } && ok "inbox vazia" || ko "inbox vazia"

run proj "a" bad
{ [ $RC != 0 ] && has "não foi possível listar secret/inbox/proj/" && ! has "vazia"; } && ok "token inválido: aviso, rc!=0, sem «vazia»" || ko "token inválido"
run proj "a" nolist
{ [ $RC != 0 ] && has "não foi possível listar secret/inbox/proj/" && ! has "vazia"; } && ok "token sem list: aviso, rc!=0, sem «vazia»" || ko "token sem list"
run proj "" good http://127.0.0.1:1
{ [ $RC != 0 ] && has "não foi possível listar secret/inbox/proj/" && ! has "vazia"; } && ok "Vault inacessível: aviso, rc!=0, sem «vazia»" || ko "Vault inacessível"

run proj "old-1 new-2"
{ [ $RC = 0 ] && grep -qE '^secret/inbox/proj/old-1	2026-01-01T10:00:00Z	[0-9]+ dias	⚠ >7 dias$' <<<"$OUT"; } && ok "entrada com mais de 7 dias destacada" || ko ">7 dias"
grep -qE '^secret/inbox/proj/new-2	.*	0 dias	OK$' <<<"$OUT" && ok "entrada recente OK" || ko "entrada recente"

run proj "sub/ new-3"
has "⚠ subpasta inesperada: secret/inbox/proj/sub/" && ok "subpasta assinalada" || ko "subpasta"

run "Meu_Proj.X" "new-1"
has "secret/inbox/meu-proj-x/new-1" && ok "segmento Meu_Proj.X -> meu-proj-x" || ko "segmento"
run "___" "new-1"
has "secret/inbox/sessao/new-1" && ok "segmento ___ -> sessao" || ko "segmento sessao"

run proj "old-1 new-2"
{ ! has "SEGREDO-NAO-DEVIA-SAIR" && [ ! -f "$T/kvget.log" ]; } && ok "nenhum valor no output, sem kv get" || ko "valor/kv get"

[ "$FAILS" = 0 ] && { echo "✓ vault-inbox-list.test passou"; exit 0; } || { echo "✗ $FAILS falha(s)"; exit 1; }

#!/usr/bin/env bash
# prumo · eval · vault-read-field.sh com um binário vault falso.
set -uo pipefail
EVAL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$EVAL_DIR/../.." && pwd)"
S="$(mktemp -d "${TMPDIR:-/tmp}/prumo-vrf.XXXXXX")"
trap 'rm -r "$S"' EXIT
mkdir -p "$S/bin" "$S/home/.prumo"
cat > "$S/bin/vault" <<'EOF'
#!/usr/bin/env bash
# devolve o valor só se o token for o da cache e os argumentos baterem
[ "${VAULT_TOKEN:-}" = "tok-cache" ] || { echo "permission denied" >&2; exit 2; }
[ "$1 $2" = "kv get" ] || exit 3
case "$*" in *"-field=db_password"*"secret/projects/x"*) printf 's3nha' ;; *) echo "No value found" >&2; exit 2 ;; esac
EOF
chmod +x "$S/bin/vault"
printf 'tok-cache' > "$S/home/.prumo/token-cache"
FAILS=0
check() { if [ "$1" = "$2" ]; then echo "  ✓ $3"; else echo "  ✗ $3 (esperado '$1', obtido '$2')"; FAILS=$((FAILS+1)); fi; }

OUT=$(HOME="$S/home" PATH="$S/bin:$PATH" env -u VAULT_TOKEN bash "$REPO_ROOT/base/lib/vault-read-field.sh" secret/projects/x db_password 2>/dev/null)
check "s3nha" "$OUT" "lê o campo com o token da cache"

ERR=$(HOME="$S/home" PATH="$S/bin:$PATH" env -u VAULT_TOKEN bash "$REPO_ROOT/base/lib/vault-read-field.sh" secret/projects/x outro 2>&1 >/dev/null)
case "$ERR" in *tok-cache*) check "sem token" "com token" "erro não ecoa o token" ;; *) check 1 1 "erro não ecoa o token" ;; esac

[ "$FAILS" -eq 0 ] || exit 1
echo "✓ vault-read-field-test passou"

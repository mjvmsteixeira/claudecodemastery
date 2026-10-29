#!/usr/bin/env bash
# prumo · eval · approval-gate N2 para a inbox do prumo-guard: correr vault-promote.sh,
# ler a inbox (kv get, vault read, curl/wget à API) e apagar nela exigem aprovação,
# com o pedido N2 e o approval-id. Leituras fora da inbox continuam livres.
# Hermético: HOME num sandbox.
set -uo pipefail
EVAL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GATE="$(cd "$EVAL_DIR/../.." && pwd)/secops/hooks/pre-tool-approval-gate.sh"
SANDBOX="$(mktemp -d)"; trap 'rm -r "$SANDBOX"' EXIT
mkdir -p "$SANDBOX/.claude/plugins/cache"
FAILS=0

run() { # run <comando> -> RC, ERR
  ERR=$(jq -cn --arg c "$1" '{tool_name:"Bash",tool_input:{command:$c}}' \
    | HOME="$SANDBOX" env -u PRUMO_OPERATING_MODE -u PRUMO_APPROVE -u PRUMO_HOME bash "$GATE" 2>&1 >/dev/null)
  RC=$?
}
blocks() { # blocks <nome> <comando>
  run "$2"
  if [ "$RC" = 2 ] && grep -q 'Operação N2' <<<"$ERR" && grep -qE 'approval-id: [0-9a-f]{64}' <<<"$ERR"; then echo "  ✓ $1"
  else echo "  ✗ $1 (rc=$RC)"; FAILS=$((FAILS+1)); fi
}
passes() { # passes <nome> <comando>
  run "$2"
  if [ "$RC" = 0 ]; then echo "  ✓ $1"; else echo "  ✗ $1 (rc=$RC)"; FAILS=$((FAILS+1)); fi
}

echo "approval-gate · inbox (N2)"
blocks "vault-promote.sh" 'bash "$CLAUDE_PLUGIN_ROOT/lib/vault-promote.sh" secret/inbox/a/b#value secret/projects/x/y k'
blocks "vault-promote.sh por caminho absoluto" '/Users/p/plugins/base/lib/vault-promote.sh secret/inbox/a#value secret/x k'
blocks "vault kv get da inbox" 'vault kv get secret/inbox/a/b'
blocks "vault kv get -field da inbox" 'vault kv get -field=value secret/inbox/a/b'
blocks "V kv get da inbox" 'source vault-env.sh; V kv get -field=value secret/inbox/a/b'
blocks "docker exec vault kv get da inbox" 'docker exec -i vault vault kv get -field=value secret/inbox/a/b'
blocks "vault read secret/data/inbox" 'vault read secret/data/inbox/a/b'
blocks "vault read -format=json secret/data/inbox" 'vault read -format=json secret/data/inbox/a/b'
blocks "curl à API da inbox" 'curl -s -H "X-Vault-Token: $T" https://127.0.0.1:8200/v1/secret/data/inbox/a/b'
blocks "wget à API da inbox" 'wget -qO- https://127.0.0.1:8200/v1/secret/data/inbox/a/b'
blocks "kv metadata delete da inbox" 'vault kv metadata delete secret/inbox/a/b'
blocks "kv delete da inbox" 'vault kv delete secret/inbox/a/b'
blocks "V kv metadata delete da inbox" 'V kv metadata delete secret/inbox/a/b'
blocks "vault delete secret/data/inbox" 'vault delete secret/data/inbox/a/b'
blocks "multi-linha" $'echo x\nvault kv get secret/inbox/a/b'

echo "approval-gate · fora da inbox"
passes "kv get de projecto" 'vault kv get secret/projects/x'
passes "kv get -field de projecto" 'vault kv get -field=api_key secret/projects/x/y'
passes "vault read de projecto" 'vault read secret/data/projects/x'
passes "curl a outro caminho" 'curl -s https://127.0.0.1:8200/v1/secret/data/projects/x'
passes "captura: vault-write-field.sh" 'printf x | bash lib/vault-write-field.sh secret/inbox/a value'
passes "kv metadata delete de projecto" 'vault kv metadata delete secret/projects/x'

[ "$FAILS" -eq 0 ] || { echo "✗ $FAILS falha(s)"; exit 1; }
echo "✓ inbox-n2-test passou"

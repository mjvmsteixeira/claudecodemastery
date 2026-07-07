---
name: prumo-vault-policy
description: Gera um template HCL de policy Vault para um novo AppRole ou projecto. Não aplica — escreve em $VAULT_HOME/policies/<nome>-policy.hcl para revisão e posterior `vault policy write`. Suporta KV (read/write/delete), transit (encrypt/decrypt), SSH sign roles.
allowed-tools: Bash, Read
---

# /prumo-vault-policy `<nome>` [`--kv-read <path>...`] [`--kv-write <path>...`] [`--transit-key <nome>`] [`--ssh-role <role>`]

Gera um template HCL parametrizável para uma policy Vault. **Não aplica nada** — escreve um ficheiro em `$VAULT_HOME/policies/<nome>-policy.hcl` (ou `~/vault/policies/`) para o utilizador rever e depois aplicar manualmente via `vault policy write <nome> <ficheiro>`.

## Argumento obrigatório

- `<nome>` — nome da policy (kebab-case, ex: `wire-monitor`, `cmcaminha-ro`). Recusa se conter espaços ou maiúsculas.

## Flags opcionais

| Flag | Repetível | Significado |
|------|-----------|-------------|
| `--kv-read <path>` | sim | Path em `secret/data/<path>/*` com `["read", "list"]` |
| `--kv-write <path>` | sim | Path em `secret/data/<path>/*` com `["create", "update", "read", "list"]` |
| `--kv-full <path>` | sim | Path com `["create", "update", "read", "list", "delete"]` (atenção: delete) |
| `--transit-key <nome>` | sim | Capacidade `encrypt`/`decrypt` em `transit/encrypt/<nome>` e `transit/decrypt/<nome>` |
| `--ssh-role <role>` | sim | Capacidade `["update"]` em `ssh/sign/<role>` (cert SSH efémero) |
| `--dest <dir>` | não | Override do directório de output (default: `$VAULT_HOME/policies/` ou `~/vault/policies/`) |

## Passo 1 — Validar argumentos

```bash
NAME="${1:-}"
if [ -z "$NAME" ]; then
  echo "Uso: /prumo-vault-policy <nome> [--kv-read <path>] [--kv-write <path>] ..."
  echo "Exemplos:"
  echo "  /prumo-vault-policy wire-monitor --kv-read observability --ssh-role wire-srv-role"
  echo "  /prumo-vault-policy cmcaminha-ro --kv-read projects/cmcaminha --kv-read ai"
  exit 1
fi

# Recusar nome com espaços/uppercase/start-non-letter
if ! echo "$NAME" | grep -qE '^[a-z][a-z0-9-]*$'; then
  echo "Erro: nome inválido '$NAME'. Use kebab-case (a-z, 0-9, hífen)." >&2
  exit 1
fi
```

## Passo 2 — Resolver destino

```bash
VAULT_HOME="${VAULT_HOME:-$HOME/vault}"
DEST_DIR="${DEST_DIR:-$VAULT_HOME/policies}"
mkdir -p "$DEST_DIR"
OUT="$DEST_DIR/${NAME}-policy.hcl"

if [ -f "$OUT" ]; then
  echo "Aviso: $OUT já existe."
  echo "Renomeia o existente ou usa --dest <outro-dir> para evitar sobrescrita acidental." >&2
  exit 1
fi
```

## Passo 3 — Construir HCL

Cada flag traduz-se num bloco `path "..." { capabilities = [...] }`. Header com comentário identifica origem, data, e que requer revisão antes de `vault policy write`.

Esqueleto:

```hcl
# ──────────────────────────────────────────────────────────────
# Policy Vault: <NAME>
# Gerado por /prumo-vault-policy em <DATA-ISO>
# Plugin: prumo-base @ prumo
#
# REVÊ ANTES DE APLICAR. Não há rollback automático em Vault.
# Aplicar com:
#   vault policy write <NAME> <ficheiro>
# ──────────────────────────────────────────────────────────────

# Lookup do próprio token (necessário para todas as policies não-root)
path "auth/token/lookup-self" {
  capabilities = ["read"]
}
path "auth/token/renew-self" {
  capabilities = ["update"]
}

# KV READ blocks (--kv-read)
path "secret/data/<KV_READ_PATH>/*" {
  capabilities = ["read", "list"]
}

# KV WRITE blocks (--kv-write)
path "secret/data/<KV_WRITE_PATH>/*" {
  capabilities = ["create", "update", "read", "list"]
}

# KV FULL blocks (--kv-full) — inclui delete
path "secret/data/<KV_FULL_PATH>/*" {
  capabilities = ["create", "update", "read", "list", "delete"]
}
path "secret/metadata/<KV_FULL_PATH>/*" {
  capabilities = ["delete"]
}

# Transit blocks (--transit-key)
path "transit/encrypt/<TRANSIT_KEY>" {
  capabilities = ["update"]
}
path "transit/decrypt/<TRANSIT_KEY>" {
  capabilities = ["update"]
}

# SSH sign blocks (--ssh-role)
path "ssh/sign/<SSH_ROLE>" {
  capabilities = ["update"]
}
```

Para cada flag repetida, gerar um bloco separado.

## Passo 4 — Escrever ficheiro e reportar

```bash
echo "OK · template escrito em:"
echo "  $OUT"
echo
echo "Revê o conteúdo, depois aplica com:"
echo "  ROOT_TOKEN=\$(jq -r .root_token \"$VAULT_HOME/vault-init.json\")"
echo "  docker exec -e VAULT_ADDR=https://127.0.0.1:8200 \\"
echo "    -e VAULT_CACERT=/vault/tls/ca.pem \\"
echo "    -e \"VAULT_TOKEN=\$ROOT_TOKEN\" \\"
echo "    vault vault policy write $NAME /vault/policies/$(basename $OUT)"
echo
echo "Verifica com:"
echo "  vault policy read $NAME"
```

## Padrões típicos

| Caso | Invocação |
|------|-----------|
| AppRole "monitor" (read observability + sign SSH para servidores) | `--kv-read observability --ssh-role wire-srv-role` |
| AppRole "ir" (transit forensics + KV write ir/* + SSH ir) | `--kv-full ir --transit-key forensics --ssh-role wire-ir-role` |
| Projecto read-only (acesso de leitura aos segredos partilhados) | `--kv-read ai --kv-read tokens --kv-read projects/<nome>` |
| AppRole "deploy" (KV cicd + lookup) | `--kv-read cicd` |

## Notas

- O comando **não aplica** a policy. É template; precisas de rever e correr `vault policy write` à mão. Razão: policies aplicadas mal podem desbloquear paths críticos. Mantemo-lo manual por segurança.
- Comenta-se a header com data e origem para auditoria — facilita code review do `vault-policies.hcl` em git.
- Para o stack `prumo-secops`, há um ficheiro consolidado em `secops/vault-policies.hcl` com as 7 AppRoles. Este comando ajuda a adicionar **novas** policies sem perder o padrão.
- Se um path KV não estiver `secret/data/...` (ex: KV v1 em outro mount), editar à mão depois — o template assume KV v2 (`secret/data/*` para data + `secret/metadata/*` para metadados/delete).

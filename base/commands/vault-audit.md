---
name: vault-audit
description: Health check da integração Vault LOCAL de desenvolvimento (127.0.0.1:8200) — PLACEHOLDERs em .env, AppRole TTL, policy coverage do projecto. NÃO confundir com /prumo-vault-doctor (que diagnostica o Vault de produção do SaaS).
allowed-tools: Bash, Read, Grep
---

# Vault Audit — Estado do Projecto

Verifica o estado da integração Vault do projecto actual (`basename $PWD`).

## Execução

```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/vault-env.sh"
vault_ready || { echo "Vault inacessível ou sealed — abortar."; exit 1; }

PROJECT=$(basename "$PWD")
BASE="secret/projects/$PROJECT"

echo "### 1. SEGREDOS — PLACEHOLDERs"
V kv list -format=json "$BASE" 2>/dev/null | jq -r '.[]?' | while read -r entry; do
  V kv get -format=json "$BASE/$entry" 2>/dev/null \
    | jq -r --arg p "$BASE/$entry" \
      '.data.data | to_entries[] | [$p, .key, (if .value == "PLACEHOLDER" or .value == "" then "⚠ PLACEHOLDER" else "OK" end)] | @tsv'
done

echo ""
echo "### 2. APPROLE"
V read -format=json "auth/approle/role/$PROJECT" 2>/dev/null \
  | jq '{token_ttl: .data.token_ttl, token_max_ttl: .data.token_max_ttl, secret_id_ttl: .data.secret_id_ttl, policies: .data.token_policies}' \
  || echo "⚠ AppRole '$PROJECT' não existe"

echo ""
echo "### 3. POLICY"
[ -f "$VAULT_HOME/policies/${PROJECT}-policy.hcl" ] \
  && echo "OK: $VAULT_HOME/policies/${PROJECT}-policy.hcl" \
  || echo "⚠ Policy não encontrada"

echo ""
echo "### 4. .ENV"
[ -f ".env" ] && {
  grep -q "VAULT_ROLE_ID" .env && echo "OK: VAULT_ROLE_ID presente" || echo "⚠ VAULT_ROLE_ID em falta no .env"
  grep -q "VAULT_SECRET_ID" .env && echo "OK: VAULT_SECRET_ID presente" || echo "⚠ VAULT_SECRET_ID em falta no .env"
} || echo "⚠ Ficheiro .env não encontrado"

echo ""
echo "### 5. INTEGRAÇÃO NO CÓDIGO"
grep -rl "loadVaultSecrets\|VAULT_ROLE_ID\|vault.*approle" . \
  --include="*.js" --include="*.ts" --include="*.py" --include="*.go" 2>/dev/null \
  | head -5 \
  || echo "⚠ Nenhum ficheiro com integração Vault detectado — correr /vault-integrate"
```

## Output esperado

Apresentar em 5 secções:

**1. Segredos**

| Path | Key | Estado |
|------|-----|--------|
| `secret/projects/<projecto>/<serviço>` | `api_key` | OK |
| `secret/projects/<projecto>/<serviço>` | `api_key` | ⚠ PLACEHOLDER |

**2. AppRole** — TTLs e policies associadas

**3. Policy** — ficheiro HCL existe ou não

**4. .env** — VAULT_ROLE_ID e VAULT_SECRET_ID presentes ou em falta

**5. Integração** — ficheiros com código de integração detectados, ou sugestão de correr `/vault-integrate`

## Regras

- Nunca imprimir valores — apenas estado OK / PLACEHOLDER
- Se o projecto não tiver nada em `secret/projects/<nome>/`, sugerir `/vault-integrate`
- Se o Vault estiver inacessível, reportar e parar

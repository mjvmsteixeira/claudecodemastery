---
name: vault-list
description: Lista segredos do projecto no Vault local (com prévia mascarada).
allowed-tools: Bash, Read
---

# Vault List — Auditoria de Segredos do Projecto

Lista os segredos específicos do projecto e os segredos partilhados a que tem acesso, com prévia do valor.

## Passo 1 — Identificar o projecto

O nome do projecto é derivado do directório de trabalho actual (`basename $PWD`).

## Passo 2 — Recolher segredos

```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/vault-env.sh"
vault_ready || { echo "Vault inacessível ou sealed — abortar."; exit 1; }

PROJECT=$(basename "$PWD")

# Função: listar keys de um path e imprimir prévia
audit_path() {
  local base="$1"
  V kv list -format=json "$base" 2>/dev/null | jq -r '.[]?' | while read -r entry; do
    V kv get -format=json "$base/$entry" 2>/dev/null \
      | jq -r --arg path "$base/$entry" \
        '.data.data | to_entries[] | [$path, .key, (.value | tostring | .[0:8]) + "…"] | @tsv'
  done
}

# 1. Segredos específicos do projecto
echo "=== PROJECTO ==="
audit_path "secret/projects/$PROJECT"

# 2. Segredos partilhados — ler da policy do AppRole do projecto
POLICY_FILE="$VAULT_HOME/policies/${PROJECT}-policy.hcl"
if [ -f "$POLICY_FILE" ]; then
  echo "=== PARTILHADOS ==="
  # Extrair paths do tipo secret/data/X/* da policy (excluir projects/)
  grep -oE '"secret/data/[^"]*"' "$POLICY_FILE" \
    | tr -d '"' \
    | grep -v 'projects/' \
    | sed 's|secret/data/||; s|/\*$||' \
    | sort -u \
    | while read -r mount; do
        audit_path "secret/$mount"
      done
fi
```

## Passo 3 — Apresentar como tabela markdown

Com os dados recolhidos, apresentar em duas secções:

**Segredos do projecto** (`secret/projects/<nome>/`)

| Path | Key | Prévia | Estado |
|------|-----|--------|--------|
| `secret/projects/<nome>/<serviço>` | `api_key` | `sk-ant-a...` | OK |
| `secret/projects/<nome>/<serviço>` | `api_key` | ⚠ PLACEHOLDER | Pendente |

**Segredos partilhados** (acesso via policy)

| Path | Key | Prévia | Estado |
|------|-----|--------|--------|
| `secret/ai/<serviço>` | `api_key` | `sk-ant-a...` | OK |
| `secret/tokens/github` | `token` | `ghp_Ab1C...` | OK |

**Regras de prévia:**
- Valor preenchido → primeiros 8 caracteres + `...`
- `PLACEHOLDER` ou vazio → `⚠ PLACEHOLDER`
- Nunca mostrar mais de 8 caracteres

## Regras

- Se o projecto não tiver segredos em `secret/projects/<nome>/`, informar e sugerir `/vault-integrate`
- Se não existir `<nome>-policy.hcl`, mostrar apenas os segredos específicos e avisar que a policy não foi encontrada
- Se o Vault estiver inacessível, informar e parar
- Nunca listar segredos de outros projectos

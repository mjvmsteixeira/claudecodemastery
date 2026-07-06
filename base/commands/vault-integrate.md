---
name: vault-integrate
description: Integra um projecto com o Vault local — migra API keys/tokens/passwords de .env ou hardcoded.
allowed-tools: Bash, Read, Write, Edit, Glob, Grep
---

# Vault Integration

Integra um projecto com o Vault local. Cria os segredos, policy e AppRole, e integra o código.

## Passo 0 — Garantir que o Vault está operacional

```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/vault-env.sh"

# vault_arrange_up() (definido em vault-env.sh) arranca o container docker e
# faz unseal — mas só em dev/lab, ou se PRUMO_VAULT_AUTO_UP=1 for definido
# explicitamente. Em modo prod, sem esse override, recusa-se a auto-unseal
# silenciosamente (evita mexer no Vault de produção sem intervenção humana).
if ! vault_ready; then
  vault_arrange_up || {
    echo "Vault não está operacional/unsealed e o auto-arranque está desactivado (modo prod)."
    echo "Arranca e faz unseal manualmente, ou define PRUMO_VAULT_AUTO_UP=1 para permitir auto-unseal."
    exit 1
  }
fi
vault_ready || { echo "Vault não ficou operacional — verificar manualmente."; exit 1; }
```

Estados possíveis e o que fazer:

| Estado | Acção |
|--------|-------|
| Vault operacional, unsealed | Continuar |
| Sealed, `vault-init.json` presente, modo dev/lab ou `PRUMO_VAULT_AUTO_UP=1` | `vault_arrange_up` trata (automático no Passo 0) |
| Sealed/parado, modo prod sem `PRUMO_VAULT_AUTO_UP=1` | Parar — pedir para unseal manual (ver mensagem acima) |
| Container/serviço parado (modo docker, auto-up permitido) | `vault_arrange_up` chama `docker compose up -d` em `$VAULT_HOME` |
| `vault-init.json` não existe | Parar — o Vault não foi inicializado. Pedir ao utilizador para o inicializar primeiro |

## Passo 1 — Catalogar segredos

Ler `.env`, `.env.example`, código-fonte, `package.json`/scripts, Makefiles, Dockerfiles. Mapear cada credencial ao path Vault correcto:

| Tipo | Exemplos no código | Path Vault |
|------|--------------------|------------|
| LLM API key | `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` | `secret/ai/` (partilhado, não duplicar) |
| GitHub token | `GITHUB_TOKEN`, `GH_TOKEN`, git remote com token | `secret/tokens/github` (partilhado) |
| npm token | `NPM_TOKEN` | `secret/tokens/npm` (partilhado) |
| SSH / servidor | `SSH_HOST`, `SSH_USER`, `SERVER_IP` | `secret/infrastructure/<hostname>` (partilhado) |
| Token genérico | `*_TOKEN`, `*_API_KEY` de serviço externo | `secret/tokens/<serviço>` ou `secret/projects/<nome>/` |
| DB, SMTP, serviços | `DATABASE_URL`, `SMTP_*`, etc. | `secret/projects/<nome>/<serviço>` (específico) |

Regra de decisão:
- **Partilhado** = usado em vários projectos (GitHub token, SSH a um servidor, LLM key) → path global, policy inclui esse path
- **Específico** = só este projecto usa → `secret/projects/<nome>/`

## Passo 1.5 — Validar nome do projecto e do serviço

Antes de usar `<nome>`/`<serviço>` em qualquer comando Vault, validar o formato (kebab-case, minúsculas) — evita que um nome com caracteres especiais quebre o comando `kv put`/`write` (mesmo padrão de `/prumo-vault-policy`):

```bash
NAME="<nome>"
SERVICE="<servico>"

for v in "$NAME" "$SERVICE"; do
  if ! echo "$v" | grep -qE '^[a-z][a-z0-9-]*$'; then
    echo "Erro: nome inválido '$v'. Use kebab-case (a-z, 0-9, hífen)." >&2
    exit 1
  fi
done
```

## Passo 2 — Criar segredos específicos no Vault

```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/vault-env.sh"

# Só para segredos específicos do projecto (não duplicar os partilhados)
V kv put "secret/projects/$NAME/$SERVICE" key1="PLACEHOLDER" key2="PLACEHOLDER"
```

## Passo 3 — Criar policy

Ficheiro `$VAULT_HOME/policies/<nome>-policy.hcl` — incluir paths partilhados se necessário:

```hcl
# Segredos específicos do projecto
path "secret/data/projects/<nome>/*" {
  capabilities = ["read"]
}
path "secret/metadata/projects/<nome>/*" {
  capabilities = ["list", "read"]
}

# Segredos partilhados (apenas os que o projecto precisa)
# path "secret/data/ai/*" { capabilities = ["read"] }
```

```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/vault-env.sh"

if [ "$VAULT_MODE" = "docker" ]; then
  docker cp "$VAULT_HOME/policies/$NAME-policy.hcl" "$VAULT_CONTAINER:/tmp/"
  V policy write "$NAME-policy" "/tmp/$NAME-policy.hcl"
else
  V policy write "$NAME-policy" "$VAULT_HOME/policies/$NAME-policy.hcl"
fi
```

## Passo 4 — Criar AppRole (idempotente)

```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/vault-env.sh"

# write é idempotente — actualiza se já existir
V write "auth/approle/role/$NAME" \
  token_policies="$NAME-policy" \
  token_ttl=1h token_max_ttl=4h \
  secret_id_ttl=720h secret_id_num_uses=0

ROLE_ID=$(V read -format=json "auth/approle/role/$NAME/role-id" | jq -r '.data.role_id')
SECRET_ID=$(V write -format=json -f "auth/approle/role/$NAME/secret-id" | jq -r '.data.secret_id')

# Guardar em approle-credentials.json (criar o ficheiro se não existir)
CREDS="$VAULT_HOME/approle-credentials.json"
[ -f "$CREDS" ] || echo '{}' > "$CREDS"

# mktemp (nome imprevisível) + chmod 600 antes de escrever — evita a janela
# TOCTOU de um ficheiro temporário previsível e world-readable em /tmp.
ACFILE=$(mktemp)
chmod 600 "$ACFILE"
jq --arg r "$NAME" --arg rid "$ROLE_ID" --arg sid "$SECRET_ID" \
  '.[$r] = {"role_id": $rid, "secret_id": $sid}' \
  "$CREDS" > "$ACFILE" && mv "$ACFILE" "$CREDS"
rm -f "$ACFILE"
chmod 600 "$CREDS"
```

## Passo 5 — Integrar o código no projecto

O comando corre no contexto do projecto — integrar directamente, não gerar prompts.

**Ponto de entrada:** identificar o ficheiro servidor principal (ex: `server/index.js`, `app.py`, `main.ts`).

**Padrão de integração (antes de qualquer handler):**

```js
// Node.js — no topo do ficheiro servidor, antes de qualquer handler
async function loadVaultSecrets() {
  const roleId = process.env.VAULT_ROLE_ID;
  const secretId = process.env.VAULT_SECRET_ID;
  if (!roleId || !secretId) return; // fallback para env vars existentes

  const vaultAddr = process.env.VAULT_ADDR || 'https://127.0.0.1:8200';
  try {
    const auth = await fetch(`${vaultAddr}/v1/auth/approle/login`, {
      method: 'POST',
      body: JSON.stringify({ role_id: roleId, secret_id: secretId }),
    }).then(r => r.json());

    const token = auth.auth?.client_token;
    if (!token) return;

    const headers = { 'X-Vault-Token': token };
    // buscar cada segredo e injectar em process.env
    // ex: const s = await fetch(`${vaultAddr}/v1/secret/data/...`, { headers }).then(r => r.json())
    //     process.env.ANTHROPIC_API_KEY = s.data.data.api_key
  } catch { /* vault inacessível — continuar com env vars */ }
}

await loadVaultSecrets(); // chamar antes de app.listen()
```

**Para TLS auto-assinado em Node.js**, adicionar no topo:
```js
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // apenas para Vault local
```
Ou passar o CA cert via `https.Agent` se o projecto já usa https nativo.

**Ficheiros de configuração:**
- `.env`: adicionar `VAULT_ROLE_ID=<role_id>` e `VAULT_SECRET_ID=<secret_id>`
- `.env.example`: adicionar `VAULT_ROLE_ID=` e `VAULT_SECRET_ID=`
- Confirmar que `.env` está no `.gitignore`

## Regras

- Segredos partilhados (`secret/ai/`, `secret/tokens/`) não se duplicam em `secret/projects/`
- SECRET_ID nunca vai para código ou ficheiros git-tracked
- Não instalar bibliotecas vault dedicadas — usar fetch/requests/urllib já disponível
- Sempre fallback silencioso se Vault inacessível (não quebrar o projecto)
- Após criar segredos, lembrar o utilizador de substituir os PLACEHOLDERs com valores reais

---
name: vault-set
description: Adiciona/actualiza um segredo no Vault local; substitui PLACEHOLDERs.
allowed-tools: Bash
argument-hint: "[path] [key] — opcional; se omitido, pergunta interactivamente"
---

# Vault Set — Adicionar ou Actualizar Segredo

## Passo 1 — Recolher informação

Perguntar ao utilizador (ou usar os argumentos passados ao comando):
1. **Path** — onde guardar (ex: `secret/projects/<nome>/<serviço>`, `secret/tokens/github`)
2. **Key** — nome da chave (ex: `api_key`, `token`)
3. **Valor** — pedir que cole o valor (avisar que ficará visível no terminal)

Se o utilizador não souber o path, sugerir com base no contexto:
- API key LLM → `secret/ai/<serviço>` ou `secret/projects/<nome>/<serviço>`
- Token GitHub → `secret/tokens/github`
- Credencial específica do projecto → `secret/projects/<nome>/<serviço>`

## Passo 2 — Actualizar no Vault

Usar `kv patch` para actualizar só a key indicada sem apagar as restantes. Se o path não existir ainda, usar `kv put`.

```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/vault-env.sh"
vault_ready || { echo "Vault inacessível ou sealed — abortar."; exit 1; }

# Verificar se o path já existe
if V kv get -format=json "<PATH>" > /dev/null 2>&1; then
  # Actualizar só a key (preserva as restantes)
  V kv patch "<PATH>" <KEY>="<VALOR>"
else
  # Criar novo
  V kv put "<PATH>" <KEY>="<VALOR>"
fi
```

## Passo 3 — Confirmar sem expor o valor

Após o comando, verificar que foi guardado lendo apenas o início:

```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/vault-env.sh"

VAL=$(V kv get -format=json "<PATH>" | jq -r '.data.data.<KEY>')
if [ "$VAL" = "PLACEHOLDER" ] || [ -z "$VAL" ]; then
  echo "ERRO: valor não foi guardado"
else
  echo "OK: guardado (${VAL:0:8}...)"
fi
```

## Regras

- Nunca registar o valor completo em logs, output ou contexto da conversa
- Nunca guardar o valor em ficheiros tracked por git
- Usar sempre `kv patch` quando o path já existe — nunca `kv put` em paths existentes (apagaria outras keys)
- Após actualizar, confirmar com prévia de 8 caracteres
- Se o utilizador quiser actualizar múltiplas keys do mesmo path, fazer num único `kv patch key1="v1" key2="v2"` para minimizar exposição

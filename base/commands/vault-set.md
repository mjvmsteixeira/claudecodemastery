---
name: vault-set
description: Adiciona/actualiza um segredo no Vault local; substitui PLACEHOLDERs.
allowed-tools: Bash
argument-hint: "[path] [key] | --from <ref da inbox> [destino] [campo] — opcional; se omitido, pergunta interactivamente"
---

# Vault Set — Adicionar ou Actualizar Segredo

## Passo 1 — Recolher informação

Perguntar ao utilizador (ou usar os argumentos passados ao comando):
1. **Path** — onde guardar (ex: `secret/projects/<nome>/<serviço>`, `secret/tokens/github`)
2. **Key** — nome da chave (ex: `api_key`, `token`)
3. **Valor** — pedir que cole o valor (avisar que ficará visível no terminal)

Com o prumo-guard ativo, um valor colado no chat pode chegar redigido como `[prumo:…]`, e o que seria gravado é o marcador, não o segredo. A forma preferida é a pessoa correr no seu terminal, com o `vault` instalado e `VAULT_ADDR`/`VAULT_TOKEN` definidos, `vault kv patch <caminho> <campo>=-` (ou `vault kv put <caminho> <campo>=-` se o caminho não existir) e colar lá o valor, que é lido do stdin e nunca passa pelo chat. Com o Vault em Docker: `docker exec -i -e VAULT_TOKEN vault vault kv patch <caminho> <campo>=-`.

Se o valor chegou como um marcador de redação com referência `secret/inbox/…#value`, já está no Vault (inbox do prumo-guard) e o modelo nunca o viu: promover com `--from` (ver abaixo). Não pedir o valor de novo.

### `--from <referência da inbox> [destino] [campo]`

Promove o segredo da inbox para o destino definitivo sem que o valor passe pelo chat, por argv, ficheiros ou logs. Se faltar o destino ou o campo, perguntar (um de cada vez), com as sugestões abaixo. Correr por Bash:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/lib/vault-promote.sh" "<secret/inbox/…#campo>" "<destino>" "<campo>"
```

O script lê a inbox com o token da pessoa (o AppRole não tem `read` na inbox), canaliza `kv get | kv patch` (`kv put` se o destino não existir) num só processo, confirma a leitura de volta por hash e só então apaga a entrada da inbox. Se a leitura de volta não conferir, a inbox fica intacta e o script sai com 1. Saída: `OK: <destino>#<campo> (promovido de <inbox>)` ou um erro genérico.

Esta corrida lê um segredo, por isso passa pelo approval-gate: a pessoa aprova uma vez, e o valor continua a não aparecer.

Se o utilizador não souber o path, sugerir com base no contexto:
- API key LLM → `secret/ai/<serviço>` ou `secret/projects/<nome>/<serviço>`
- Token GitHub → `secret/tokens/github`
- Credencial específica do projecto → `secret/projects/<nome>/<serviço>`

## Passo 2 — Actualizar no Vault

Usar `kv patch` para actualizar só a key indicada sem apagar as restantes. Se o path não existir ainda, usar `kv put`.

**Nunca** interpolar o valor colado directamente na string do comando (`KEY="<VALOR>"`) — se o valor contiver backticks, `$()`, `;` ou aspas, quebra para fora do comando e executa shell arbitrário. Ler o valor para uma variável através de um heredoc com delimitador *quoted* (`<<'EOF_VALOR'`), que não expande nada dentro do corpo, e só depois passá-lo como um único argumento `"$KEY=$VALOR"`:

```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/vault-env.sh"
vault_ready || { echo "Vault inacessível ou sealed — abortar."; exit 1; }

PATH_VAULT="<PATH>"
KEY="<KEY>"

# Delimitador entre aspas simples ('EOF_VALOR') => sem expansão de $, `, etc.
# dentro do heredoc. O valor colado fica em VALOR tal como foi introduzido.
VALOR=$(cat <<'EOF_VALOR'
<VALOR>
EOF_VALOR
)

# Recusar marcadores de redação: o valor real não chegou até aqui.
# O marcador é construído por partes: escrito por inteiro no comando, o hook
# do prumo-guard recusaria o próprio script.
M='[pru''mo:'
case "$VALOR" in
  *"$M"*secret/inbox/*)
    # Referência da inbox do prumo-guard: o valor já está no Vault; promover com --from.
    INBOX=$(printf '%s' "$VALOR" | sed -n 's/.*\(secret\/inbox\/[A-Za-z0-9._\/-]*#[A-Za-z0-9_.-]*\).*/\1/p')
    echo "O valor já está no Vault em ${INBOX:-secret/inbox/…} — nada foi gravado. Promover com: /vault-set --from ${INBOX:-<referência da inbox>} $PATH_VAULT $KEY"
    exit 1 ;;
  *"$M"*)
    echo "Valor redigido pelo prumo-guard — nada foi gravado. No teu terminal (com vault instalado e VAULT_ADDR/VAULT_TOKEN definidos): vault kv patch $PATH_VAULT $KEY=- (ou kv put se o caminho não existir) e cola lá o valor. Em Docker: docker exec -i -e VAULT_TOKEN vault vault kv patch $PATH_VAULT $KEY=-"
    exit 1 ;;
esac

# Verificar se o path já existe
if V kv get -format=json "$PATH_VAULT" > /dev/null 2>&1; then
  # Actualizar só a key (preserva as restantes) — valor passado como argv único
  V kv patch "$PATH_VAULT" "$KEY=$VALOR"
else
  # Criar novo
  V kv put "$PATH_VAULT" "$KEY=$VALOR"
fi
```

## Passo 3 — Confirmar sem expor o valor

Após o comando, verificar que foi guardado lendo apenas o início:

```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/vault-env.sh"

VAL=$(V kv get -format=json "<PATH>" | jq -r '.data.data.<KEY>')
M='[pru''mo:'
case "$VAL" in
  *"$M"*) echo "ERRO: o valor guardado é um marcador de redação"; exit 1 ;;
esac
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

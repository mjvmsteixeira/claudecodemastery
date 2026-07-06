---
name: ngrok-expose
description: Expõe uma app local via ngrok HTTPS. Authtoken obtido do Vault via prumo-base.
allowed-tools: Bash, Read, Edit
---

# /ngrok-expose

Expõe uma aplicação local via túnel ngrok público. O authtoken está no Vault
(`secret/tokens/ngrok`), acedido através do `lib/vault-env.sh` do plugin `prumo-base`.

## Pré-requisito

Requer o plugin `prumo-base` instalado (fornece `lib/vault-env.sh`). Sem ele, este
comando não consegue obter o authtoken — instalar com `/plugin install prumo-base@prumo`.

## Instruções

### 1. Localizar e carregar o helper do prumo-base

```bash
BASE_LIB=$(find ~/.claude/plugins/cache -path "*/prumo-base/*/lib/vault-env.sh" 2>/dev/null \
  | sort -V | tail -1)
if [ -z "$BASE_LIB" ]; then
  echo "prumo-base não está instalado — corre: /plugin install prumo-base@prumo"
  exit 1
fi
source "$BASE_LIB"
```

### 2. Garantir Vault acessível e obter o authtoken

```bash
vault_ready || vault_unseal          # vault_unseal lê as keys de vault-init.json
vault_ready || { echo "Vault inacessível ou sealed — abortar."; exit 1; }
NGROK_TOKEN=$(V kv get -field=authtoken secret/tokens/ngrok)
```

### 3. Configurar o ngrok (só precisa 1 vez)

```bash
ngrok config add-authtoken "$NGROK_TOKEN"
```

### 4. Determinar a porta da app

- Se o utilizador não especificar, verificar o `docker-compose.yml` do projecto actual.
- Procurar portas mapeadas: `docker ps --format "{{.Names}} {{.Ports}}" | grep -v "^$"`
- **CRÍTICO — detectar modo dev vs prod:**
  - Ler o `Dockerfile` do serviço frontend/web.
  - Se o CMD for `vite`, `npm run dev`, ou similar → dev server → usar **porta 5173**
    (ou a porta do Vite).
  - Se o CMD for nginx ou o stage final for `nginx` → prod → usar **porta 80**.
  - Nginx com redirect HTTP→HTTPS em porta 80 causa `ERR_NGROK_3004` porque o ngrok
    não segue o redirect para 443.
- Portas comuns: 5173 (Vite dev), 3000 (outros dev servers), 8080 / 80 (nginx prod).

### 5. Confirmação humana obrigatória antes de expor

**CRÍTICO — nunca avançar para o passo 6 sem esta confirmação explícita.**

Antes de lançar qualquer túnel, mostrar ao utilizador um resumo claro e esperar
literalmente por `sim`:

```
Vou expor publicamente:
  - Serviço/porta: <descrição>:<PORT>  (ex: "frontend Vite dev":5173)
  - Ambiente: <dev|prod — resultado do passo 4>
  - Modo de acesso: protegido por basic-auth (utilizador+password aleatórios)
    [OU, só se o utilizador pedir explicitamente acesso sem auth:]
    Modo de acesso: PÚBLICO SEM AUTENTICAÇÃO — qualquer pessoa com o URL acede.
  - O URL ngrok será acessível a partir da internet enquanto o túnel estiver activo.

Confirmas? (sim/não)
```

Se a resposta não for exactamente "sim" (ou equivalente inequívoco de aceitação),
abortar e não executar o passo 6.

**Basic-auth é o default.** Só omitir `--basic-auth` se o utilizador pedir
explicitamente acesso público sem autenticação (opt-in explícito, nunca default).

### 6. Iniciar o túnel

```bash
PORT=<porta-detectada-no-passo-4>   # ex: 5173, 3000, 80
LOG_FILE=$(mktemp -t ngrok.XXXXXX.log)

if [ "$SKIP_AUTH" != "1" ]; then
  # Default: gerar credenciais basic-auth aleatórias e mostrá-las ao utilizador
  NGROK_USER="ngrok"
  NGROK_PASS=$(openssl rand -base64 18 | tr -dc 'A-Za-z0-9' | head -c 20)
  echo "Basic-auth: utilizador=$NGROK_USER password=$NGROK_PASS  (guarda isto — não fica noutro lado)"
  ngrok http "$PORT" --basic-auth="${NGROK_USER}:${NGROK_PASS}" --log=stdout > "$LOG_FILE" 2>&1 &
else
  # Só chega aqui se o utilizador pediu explicitamente acesso público sem auth no passo 5
  ngrok http "$PORT" --log=stdout > "$LOG_FILE" 2>&1 &
fi
NGROK_PID=$!
sleep 5
URL=$(grep -o "https://[a-z0-9\-]*\.ngrok-free\.app" "$LOG_FILE" | head -1)
echo "URL: $URL"
echo "PID: $NGROK_PID  Log: $LOG_FILE"
```

Guardar `$NGROK_PID` e `$LOG_FILE` — são precisos para parar o túnel no passo 9
sem afectar outras instâncias de ngrok que possam estar a correr no host.

### 7. Se a app usar Vite dev server e bloquear o host

**Confirmar com o utilizador antes de editar qualquer ficheiro de configuração**
(mostrar o diff proposto e esperar aprovação — estas alterações tornam o
dev server aceitável a partir de qualquer Host header, o que é uma superfície
de ataque quando combinado com exposição pública).

Antes de editar, guardar uma cópia do original para permitir revert:
```bash
cp vite.config.ts vite.config.ts.ngrok-orig 2>/dev/null || true
cp <ficheiro-nginx-relevante> <ficheiro-nginx-relevante>.ngrok-orig 2>/dev/null || true
```

Alterações propostas (aplicar só após aprovação):
- Adicionar `allowedHosts: 'all'` ao `vite.config.ts` no bloco `server`.
- Se o nginx faz proxy para o vite, mudar `proxy_set_header Host $host` para
  `proxy_set_header Host localhost` nos `location` que proxiam para o frontend.

**Revert obrigatório ao terminar (passo 9):** restaurar os ficheiros originais a
partir das cópias `.ngrok-orig` e remover as cópias:
```bash
[ -f vite.config.ts.ngrok-orig ] && mv vite.config.ts.ngrok-orig vite.config.ts
[ -f <ficheiro-nginx-relevante>.ngrok-orig ] && mv <ficheiro-nginx-relevante>.ngrok-orig <ficheiro-nginx-relevante>
```

### 8. Reportar o URL ao utilizador.

### 9. Para parar

Parar apenas o processo ngrok lançado por este comando (nunca `pkill ngrok` —
isso mataria outras instâncias de ngrok no host):
```bash
kill "$NGROK_PID" 2>/dev/null
```
Depois, se o passo 7 tiver editado configs, aplicar o revert documentado acima.

## Notas

- URLs ngrok mudam a cada restart (conta free).
- Na primeira visita, o utilizador precisa de clicar "Visit Site" no aviso do ngrok.
- O token ngrok vive em `secret/tokens/ngrok` no Vault.

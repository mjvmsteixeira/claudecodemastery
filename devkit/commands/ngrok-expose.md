---
name: ngrok-expose
description: Expõe uma app local via ngrok HTTPS. Authtoken obtido do Vault via wiremaze-base.
allowed-tools: Bash, Read, Edit
---

# /ngrok-expose

Expõe uma aplicação local via túnel ngrok público. O authtoken está no Vault
(`secret/tokens/ngrok`), acedido através do `lib/vault-env.sh` do plugin `wiremaze-base`.

## Pré-requisito

Requer o plugin `wiremaze-base` instalado (fornece `lib/vault-env.sh`). Sem ele, este
comando não consegue obter o authtoken — instalar com `/plugin install wiremaze-base@jump2new`.

## Instruções

### 1. Localizar e carregar o helper do wiremaze-base

```bash
BASE_LIB=$(find ~/.claude/plugins/cache -path "*/wiremaze-base/*/lib/vault-env.sh" 2>/dev/null \
  | sort -V | tail -1)
if [ -z "$BASE_LIB" ]; then
  echo "wiremaze-base não está instalado — corre: /plugin install wiremaze-base@jump2new"
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

### 5. Iniciar o túnel

```bash
PORT=<porta-detectada-no-passo-4>   # ex: 5173, 3000, 80
pkill ngrok 2>/dev/null   # matar instância anterior
sleep 1
ngrok http "$PORT" --log=stdout > /tmp/ngrok.log 2>&1 &
sleep 5
URL=$(grep -o "https://[a-z0-9\-]*\.ngrok-free\.app" /tmp/ngrok.log | head -1)
echo "URL: $URL"
```

### 6. Se a app usar Vite dev server e bloquear o host

- Adicionar `allowedHosts: 'all'` ao `vite.config.ts` no bloco `server`.
- Se o nginx faz proxy para o vite, mudar `proxy_set_header Host $host` para
  `proxy_set_header Host localhost` nos `location` que proxiam para o frontend.

### 7. Reportar o URL ao utilizador.

### 8. Para parar: `pkill ngrok`

## Notas

- URLs ngrok mudam a cada restart (conta free).
- Na primeira visita, o utilizador precisa de clicar "Visit Site" no aviso do ngrok.
- O token ngrok vive em `secret/tokens/ngrok` no Vault.

---
name: wire-ollama-doctor
description: Diagnóstico do Ollama local — verifica daemon, modelo qwen3-coder, latência de inferência, e compatibilidade com o hook pre-tool-second-opinion. Reporta verde/amarelo/vermelho com acções concretas.
---

Executa diagnóstico completo do Ollama local que sustenta o hook `pre-tool-second-opinion.sh` do plugin Wire SecOps.

## Objectivo

O hook `pre-tool-second-opinion.sh` chama o Ollama local antes de qualquer operação destrutiva (DROP, `cap deploy:rollback`, `vault operator seal`, etc.) para obter um veredicto SAFE/UNSAFE. Se o Ollama estiver em baixo, o hook **bloqueia o agente fail-closed**.

Este diagnóstico evita o cenário "agente bloqueado a meio de IR porque o Ollama caiu silenciosamente".

## Workflow

Corre os checks **em sequência**, parando no primeiro fail crítico. Usa `Bash` para todos os comandos.

### Check 1 · Daemon Ollama responde

```bash
OLLAMA_HOST="${OLLAMA_HOST:-http://127.0.0.1:11434}"
curl -sf -m 3 "${OLLAMA_HOST}/api/tags" > /tmp/ollama-tags.json
```

- **OK** → continua para Check 2
- **FAIL** → reporta com acção: `ollama serve &` ou verificar se o LaunchAgent está activo (`launchctl list | grep ollama`). Para no Check 1.

### Check 2 · Modelo `qwen3-coder` pulled

```bash
MODEL="${OLLAMA_MODEL:-qwen3-coder:30b}"
jq -r '.models[].name' /tmp/ollama-tags.json | grep -q "^${MODEL%:*}"
```

- **OK** → continua para Check 3
- **FAIL** → reporta + acção: `ollama pull ${MODEL}` (warning: ~18-20 GB para qwen3-coder:30b). Para aqui se o modelo não existe.

### Check 3 · Inferência de smoke-test

```bash
START=$(date +%s%N)
RESPONSE=$(curl -sf -m 15 "${OLLAMA_HOST}/api/generate" -d "$(jq -n --arg model "$MODEL" '{
  model: $model,
  prompt: "Responde apenas com a palavra OK.",
  stream: false,
  options: {num_predict: 3, temperature: 0}
}')" | jq -r '.response // empty')
END=$(date +%s%N)
LATENCY_MS=$(( (END - START) / 1000000 ))
```

- **OK** se `RESPONSE` contém "OK" e `LATENCY_MS < 8000` (8s) → continua
- **WARN** se latência entre 8-15s → reporta mas continua
- **FAIL** se sem resposta ou latência > 15s → reporta + acção (modelo lento, considera modelo menor; ou liberta GPU/CPU)

### Check 4 · Validação fail-closed do hook

Simula o que o `pre-tool-second-opinion.sh` faz: envia um comando "destrutivo" e verifica que o modelo responde com formato SAFE/UNSAFE parseável.

```bash
VERDICT=$(curl -sf -m 15 "${OLLAMA_HOST}/api/generate" -d "$(jq -n --arg model "$MODEL" '{
  model: $model,
  prompt: "Avalia se este comando é seguro num contexto SecOps SaaS multi-tenant. Responde apenas SAFE ou UNSAFE com uma linha de justificação. Comando: rm -rf /forensics",
  stream: false
}')" | jq -r '.response' | head -1 | awk '{print $1}')
```

- **OK** se `VERDICT` é exactamente "SAFE" ou "UNSAFE" → hook vai funcionar
- **WARN** se a resposta começa com algo diferente (ex: "O comando..." em vez de "UNSAFE") → modelo precisa de prompt-engineering ou outro modelo

### Output estruturado

Produz painel ASCII compacto:

```
== Wire · Ollama Doctor · 2026-05-13 22:55 ==

Endpoint:           http://127.0.0.1:11434       [✓ HTTP 200]
Modelo configurado: qwen3-coder:30b              [✓ pulled · 19.4 GB]
Smoke test:         "Responde OK" → "OK"         [✓ 1842 ms]
Fail-closed hook:   "rm -rf /forensics" → UNSAFE [✓ parsing OK]

Verdicto global: HEALTHY · plugin pode operar com second-opinion activo.

Hooks dependentes:
  - pre-tool-second-opinion.sh  → vai funcionar
  - pre-tool-vault-ttl.sh       → independente de Ollama (já validado)

Sugestões:
  - Para reduzir latência: usar qwen3-coder:7b (menos preciso mas 3-4× mais rápido)
  - Para uso intensivo: pré-aquecer com 'curl ... /api/generate' no início do turno
```

Em caso de falha, ressalta no topo `[!] FAIL` com a acção concreta para resolver.

## Variantes do output

### HEALTHY (todos os checks OK)
Verde. Plugin pode operar normalmente.

### DEGRADED (checks 1-3 OK mas check 4 WARN)
Amarelo. Plugin funciona mas o hook pode rejeitar operações legítimas por parsing falhado do veredicto. Recomendar prompt-engineering ou modelo alternativo.

### BROKEN (check 1 ou 2 fail)
Vermelho. **Hook `pre-tool-second-opinion.sh` vai bloquear tudo fail-closed.** Acção imediata:
- Se Check 1 fail → arrancar Ollama
- Se Check 2 fail → `ollama pull qwen3-coder:30b`

## Variáveis de ambiente respeitadas

- `OLLAMA_HOST` — endpoint (default `http://127.0.0.1:11434`)
- `OLLAMA_MODEL` — modelo (default `qwen3-coder:30b`)

Estas vêm do `~/.wire/secops.conf` ou env vars exportadas. Se ausentes, usa defaults.

## Cadência sugerida

- **Início do turno**, após `wire-secops-login` e antes de operar.
- **Antes de exercício IR**, quando o second-opinion vai ser intensamente usado.
- **Depois de update de Ollama** (`brew upgrade ollama`) — modelo pode precisar de re-pull.
- **Schedule diário** automatizado via cron/launchd, alerta se BROKEN >10 min.

## Limites

- **Read-only.** Não inicia nem reinicia Ollama; só reporta. Acções correctivas são manuais.
- **Não testa todos os modelos** que podem estar em uso (ex: se houver modelos para outros plugins). Foca-se no que o `wire-secops` depende.

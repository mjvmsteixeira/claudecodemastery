---
name: prumo-mode
description: Mostra o PRUMO_OPERATING_MODE do ecossistema prumo (prod/dev/lab) e como o alterar. Lê ~/.prumo/mode e o marker ~/.prumo/lab-mode; a alteração é humana. Sem argumentos = mostra estado actual.
allowed-tools: Bash, Read
---

# /prumo-mode

Configura o modo operacional dos plugins prumo. O modo é lido por `prumo_mode()` da `prumo-common.sh` e respeitado por todos os hooks do `prumo-secops` via `prumo_fail_or_warn`.

## Passo 1 — Detectar estado actual

```bash
echo "=== PRUMO_OPERATING_MODE — estado actual ==="

# Fonte 1: env var (override)
ENV_MODE="${PRUMO_OPERATING_MODE:-}"
[ -n "$ENV_MODE" ] && echo "  env PRUMO_OPERATING_MODE=$ENV_MODE  ← override por sessão"

# Fonte 2: ~/.prumo/mode (persistente)
FILE_MODE=""
[ -f ~/.prumo/mode ] && FILE_MODE=$(tr -d '[:space:]' < ~/.prumo/mode)
[ -n "$FILE_MODE" ] && echo "  ~/.prumo/mode=$FILE_MODE          ← persistente"
[ -z "$FILE_MODE" ] && echo "  ~/.prumo/mode                      ← ausente (default: prod)"

# Marker lab (requerido para modo lab)
[ -f ~/.prumo/lab-mode ] && echo "  ~/.prumo/lab-mode                  ← marker presente"

# Modo efectivo (env > file > prod)
EFFECTIVE="${ENV_MODE:-${FILE_MODE:-prod}}"
echo
echo "Modo efectivo: $EFFECTIVE"
```

## Passo 2 — Interpretar argumento

Se o utilizador passou um argumento em `$ARGUMENTS`, responde em texto, **sem correr Bash**: alterar o modo é uma ação humana e o hook `self-guard` bloqueia escritas do agente em `~/.prumo/mode` e `~/.prumo/lab-mode`, em todos os modos (um bloco Bash que só imprimisse as instruções também seria bloqueado, porque nomeia esses ficheiros ao lado de `>`).

- `status` ou vazio — apenas mostrar o Passo 1.
- `prod`, `dev` ou `lab` — mostrar ao utilizador os dois caminhos, com o valor pedido:
  - com o prumo-guard instalado: `/prumo-guard-mode <valor>`
  - no terminal dele, fora do Claude Code:
    - `prod`: `echo prod > ~/.prumo/mode && rm -f ~/.prumo/lab-mode`
    - `dev`: `echo dev > ~/.prumo/mode && rm -f ~/.prumo/lab-mode`
    - `lab`: `echo lab > ~/.prumo/mode && touch ~/.prumo/lab-mode` (lab faz bypass dos hooks)
- qualquer outro valor — recusar com a lista de valores válidos: `prod | dev | lab | status`.

## Passo 3 — Resumo do que cada modo significa

Depois de consultar ou de mostrar os caminhos, mostrar tabela curta para o utilizador saber o que muda:

```
| Modo | Hooks                              | Auto-up Vault (Docker) |
|------|------------------------------------|------------------------|
| prod | Fail-closed (exit 2 em violação)   | Off · espera arranque manual |
| dev  | Warn-only (loga, não bloqueia)     | Permitido (PRUMO_VAULT_AUTO_UP=1) |
| lab  | Bypass total (silent)              | Permitido — requer marker ~/.prumo/lab-mode |
```

## Passo 4 — Notas

- O override por **env var** (`export PRUMO_OPERATING_MODE=dev`) tem prioridade sobre o ficheiro. Útil para uma sessão pontual sem mexer no persistente.
- O ficheiro `~/.prumo/mode` persiste entre sessões.
- O modo `lab` requer **dois** sinais (ficheiro = `lab` E marker `~/.prumo/lab-mode` presente). Isto previne activação acidental.
- Para reverter: `/prumo-guard-mode prod`, ou no terminal `echo prod > ~/.prumo/mode && rm -f ~/.prumo/lab-mode`.

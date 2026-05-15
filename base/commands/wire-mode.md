---
name: wire-mode
description: Mostra ou altera o WIRE_OPERATING_MODE do ecossistema Wire (prod/dev/lab). Lê/escreve ~/.wire/mode e gere o marker ~/.wire/lab-mode. Sem argumentos = mostra estado actual.
allowed-tools: Bash, Read
---

# /wire-mode

Configura o modo operacional dos plugins Wire. O modo é lido por `wire_mode()` da `wire-common.sh` e respeitado por todos os hooks do `wire-secops` via `wire_fail_or_warn`.

## Passo 1 — Detectar estado actual

```bash
echo "=== WIRE_OPERATING_MODE — estado actual ==="

# Fonte 1: env var (override)
ENV_MODE="${WIRE_OPERATING_MODE:-}"
[ -n "$ENV_MODE" ] && echo "  env WIRE_OPERATING_MODE=$ENV_MODE  ← override por sessão"

# Fonte 2: ~/.wire/mode (persistente)
FILE_MODE=""
[ -f ~/.wire/mode ] && FILE_MODE=$(tr -d '[:space:]' < ~/.wire/mode)
[ -n "$FILE_MODE" ] && echo "  ~/.wire/mode=$FILE_MODE          ← persistente"
[ -z "$FILE_MODE" ] && echo "  ~/.wire/mode                      ← ausente (default: prod)"

# Marker lab (requerido para modo lab)
[ -f ~/.wire/lab-mode ] && echo "  ~/.wire/lab-mode                  ← marker presente"

# Modo efectivo (env > file > prod)
EFFECTIVE="${ENV_MODE:-${FILE_MODE:-prod}}"
echo
echo "Modo efectivo: $EFFECTIVE"
```

## Passo 2 — Interpretar argumento

Se o utilizador passou um argumento em `$ARGUMENTS`:

- `prod` — escrever `prod` em `~/.wire/mode`; remover `~/.wire/lab-mode` se existir
- `dev` — escrever `dev` em `~/.wire/mode`; remover `~/.wire/lab-mode` se existir
- `lab` — escrever `lab` em `~/.wire/mode`; **criar `~/.wire/lab-mode`** (obrigatório); avisar que lab faz bypass de hooks
- `status` ou vazio — apenas mostrar o Passo 1
- qualquer outro valor — recusar com lista de valores válidos

```bash
case "$ARGUMENTS" in
  ""|status)
    : ;;  # apenas mostrar; já feito no Passo 1
  prod|dev)
    mkdir -p ~/.wire
    echo "$ARGUMENTS" > ~/.wire/mode
    rm -f ~/.wire/lab-mode
    echo "OK · modo definido para $ARGUMENTS (persistente em ~/.wire/mode)"
    ;;
  lab)
    mkdir -p ~/.wire
    echo "lab" > ~/.wire/mode
    touch ~/.wire/lab-mode
    cat <<'EOF'
OK · modo lab activado.
ATENÇÃO: lab faz BYPASS de hooks (TTL guard, approval gate, second-opinion).
Apenas para exploração de novos hooks / eval de skills. NÃO usar em operação real.
EOF
    ;;
  *)
    echo "Valor inválido: $ARGUMENTS"
    echo "Valores válidos: prod | dev | lab | status"
    exit 1
    ;;
esac
```

## Passo 3 — Resumo do que cada modo significa

Após alterar (ou só consultar), mostrar tabela curta para o utilizador saber o que muda:

```
| Modo | Hooks                              | Auto-up Vault (Docker) |
|------|------------------------------------|------------------------|
| prod | Fail-closed (exit 2 em violação)   | Off · espera arranque manual |
| dev  | Warn-only (loga, não bloqueia)     | Permitido (WIRE_VAULT_AUTO_UP=1) |
| lab  | Bypass total (silent)              | Permitido — requer marker ~/.wire/lab-mode |
```

## Passo 4 — Notas

- O override por **env var** (`export WIRE_OPERATING_MODE=dev`) tem prioridade sobre o ficheiro. Útil para uma sessão pontual sem mexer no persistente.
- O ficheiro `~/.wire/mode` persiste entre sessões.
- O modo `lab` requer **dois** sinais (ficheiro = `lab` E marker `~/.wire/lab-mode` presente). Isto previne activação acidental.
- Para reverter: `/wire-mode prod`.

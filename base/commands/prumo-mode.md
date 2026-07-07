---
name: prumo-mode
description: Mostra ou altera o PRUMO_OPERATING_MODE do ecossistema prumo (prod/dev/lab). Lê/escreve ~/.prumo/mode e gere o marker ~/.prumo/lab-mode. Sem argumentos = mostra estado actual.
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

Se o utilizador passou um argumento em `$ARGUMENTS`:

- `prod` — escrever `prod` em `~/.prumo/mode`; remover `~/.prumo/lab-mode` se existir
- `dev` — escrever `dev` em `~/.prumo/mode`; remover `~/.prumo/lab-mode` se existir
- `lab` — escrever `lab` em `~/.prumo/mode`; **criar `~/.prumo/lab-mode`** (obrigatório); avisar que lab faz bypass de hooks
- `status` ou vazio — apenas mostrar o Passo 1
- qualquer outro valor — recusar com lista de valores válidos

```bash
case "$ARGUMENTS" in
  ""|status)
    : ;;  # apenas mostrar; já feito no Passo 1
  prod|dev)
    mkdir -p ~/.prumo
    echo "$ARGUMENTS" > ~/.prumo/mode
    rm -f ~/.prumo/lab-mode
    echo "OK · modo definido para $ARGUMENTS (persistente em ~/.prumo/mode)"
    ;;
  lab)
    mkdir -p ~/.prumo
    echo "lab" > ~/.prumo/mode
    touch ~/.prumo/lab-mode
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
| dev  | Warn-only (loga, não bloqueia)     | Permitido (PRUMO_VAULT_AUTO_UP=1) |
| lab  | Bypass total (silent)              | Permitido — requer marker ~/.prumo/lab-mode |
```

## Passo 4 — Notas

- O override por **env var** (`export PRUMO_OPERATING_MODE=dev`) tem prioridade sobre o ficheiro. Útil para uma sessão pontual sem mexer no persistente.
- O ficheiro `~/.prumo/mode` persiste entre sessões.
- O modo `lab` requer **dois** sinais (ficheiro = `lab` E marker `~/.prumo/lab-mode` presente). Isto previne activação acidental.
- Para reverter: `/prumo-mode prod`.

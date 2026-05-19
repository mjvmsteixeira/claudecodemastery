---
name: wire-vault-bootstrap
description: Provisiona infra Vault genérica (audit device, kv-v2 em secret/, approle auth, transit/ engine, ssh/ engine). Idempotente. Default --plan (read-only); --apply para executar. Requer token com policy 'root'.
allowed-tools: Bash, Read
argument-hint: "[--plan | --apply]"
---

# /wire-vault-bootstrap [--plan | --apply]

<!-- Nota para o leitor: todos os blocos bash deste comando executam numa única
shell session — variáveis declaradas em Passos anteriores estão disponíveis
em Passos seguintes (ACTIONS, REFUSE, CREATE, SECRET_TYPE, MODE). Mesmo padrão
de `wire-vault-policy.md`. -->

Provisiona infraestrutura Vault genérica e idempotente. Audit device, kv-v2 em `secret/`, approle auth method, transit engine, ssh engine. Não toca em conteúdo wire-specific (esse é o `/wire-secops-bootstrap`).

## Passo 1 — Parse flags

```bash
MODE="${1:---plan}"
case "$MODE" in
  --plan|--apply) ;;
  *) echo "Uso: /wire-vault-bootstrap [--plan | --apply]" >&2; exit 1 ;;
esac
```

## Passo 2 — Source vault-env e validar Vault + root

```bash
# shellcheck disable=SC1091
source "${CLAUDE_PLUGIN_ROOT}/lib/vault-env.sh"

if ! vault_ready; then
  echo "Vault inacessível ou sealed. Corre /wire-vault-doctor primeiro." >&2
  exit 1
fi

# Validação defesa-em-profundidade: token actual tem policy 'root'?
POLICIES=$(V token lookup -format=json 2>/dev/null | jq -r '.data.policies[]' 2>/dev/null || true)
if ! echo "$POLICIES" | grep -qx "root"; then
  cat >&2 <<EOF
Bootstrap exige token com policy 'root' — actual: ${POLICIES:-(nenhuma)}.

Exportar root:
  export VAULT_TOKEN=\$(jq -r .root_token ~/vault/vault-init.json)

Depois corre /wire-vault-bootstrap --plan novamente.
EOF
  exit 1
fi
```

## Passo 3 — Construir action list com status actual

```bash
declare -a ACTIONS=()

# 1. Audit device file em /vault/audit/audit.log
AUDIT_JSON=$(V read sys/audit -format=json 2>/dev/null || echo '{"data":{}}')
if echo "$AUDIT_JSON" | jq -e '.data | to_entries[] | select(.value.type=="file" and .value.options.file_path=="/vault/audit/audit.log")' >/dev/null 2>&1; then
  ACTIONS+=("✓|audit file device|/vault/audit/audit.log|skip:já existe")
else
  ACTIONS+=("+|audit file device|/vault/audit/audit.log|create")
fi

# 2. kv-v2 em secret/
MOUNTS_JSON=$(V read sys/mounts -format=json 2>/dev/null || echo '{"data":{}}')
SECRET_TYPE=$(echo "$MOUNTS_JSON" | jq -r '.data["secret/"].type // "none"')
SECRET_VERSION=$(echo "$MOUNTS_JSON" | jq -r '.data["secret/"].options.version // "1"')

if [ "$SECRET_TYPE" = "kv" ] && [ "$SECRET_VERSION" = "2" ]; then
  ACTIONS+=("✓|kv-v2 mount|secret/|skip:já v2")
elif [ "$SECRET_TYPE" = "kv" ] && [ "$SECRET_VERSION" != "2" ]; then
  # kv-v1: verificar se tem dados (LIST top-level)
  HAS_DATA=$(V list -format=json secret 2>/dev/null | jq 'length // 0' 2>/dev/null || echo 0)
  if [ "${HAS_DATA:-0}" -gt 0 ]; then
    ACTIONS+=("⚠|kv-v2 mount|secret/|refuse:kv-v1 com $HAS_DATA path(s) — corre /wire-vault-kv-migrate")
  else
    ACTIONS+=("+|kv-v2 mount|secret/|recreate:kv-v1 vazio, disable→re-enable")
  fi
elif [ "$SECRET_TYPE" = "none" ]; then
  ACTIONS+=("+|kv-v2 mount|secret/|create")
else
  ACTIONS+=("⚠|kv-v2 mount|secret/|refuse:mount type='$SECRET_TYPE' inesperado")
fi

# 3. approle auth
AUTH_JSON=$(V read sys/auth -format=json 2>/dev/null || echo '{"data":{}}')
if echo "$AUTH_JSON" | jq -e '.data["approle/"]' >/dev/null 2>&1; then
  ACTIONS+=("✓|approle auth|auth/approle/|skip:já existe")
else
  ACTIONS+=("+|approle auth|auth/approle/|enable")
fi

# 4. transit engine
if echo "$MOUNTS_JSON" | jq -e '.data["transit/"]' >/dev/null 2>&1; then
  ACTIONS+=("✓|transit engine|transit/|skip:já existe")
else
  ACTIONS+=("+|transit engine|transit/|enable")
fi

# 5. ssh engine
if echo "$MOUNTS_JSON" | jq -e '.data["ssh/"]' >/dev/null 2>&1; then
  ACTIONS+=("✓|ssh engine|ssh/|skip:já existe")
else
  ACTIONS+=("+|ssh engine|ssh/|enable")
fi
```

## Passo 4 — Imprimir plano

```bash
echo "── Plano: /wire-vault-bootstrap ──"
echo
printf "%-3s %-22s %-32s %s\n" "" "Recurso" "Path" "Status"
echo "─────────────────────────────────────────────────────────────────────────────"

CREATE=0; SKIP=0; REFUSE=0
for entry in "${ACTIONS[@]}"; do
  IFS="|" read -r mark resource path status <<< "$entry"
  printf "%-3s %-22s %-32s %s\n" "$mark" "$resource" "$path" "$status"
  case "$mark" in
    "+") CREATE=$((CREATE+1)) ;;
    "✓") SKIP=$((SKIP+1)) ;;
    "⚠") REFUSE=$((REFUSE+1)) ;;
  esac
done

echo
echo "Resumo: + $CREATE a aplicar · ✓ $SKIP a skipar · ⚠ $REFUSE refuse"

if [ "$MODE" = "--plan" ]; then
  if [ "$REFUSE" -gt 0 ]; then
    echo
    echo "Resolve os refuses antes de --apply (ver Status acima)." >&2
    exit 0
  fi
  if [ "$CREATE" -eq 0 ]; then
    echo "Nada a fazer — infra já provisionada."
  else
    echo "Para executar: /wire-vault-bootstrap --apply"
  fi
  exit 0
fi
```

## Passo 5 — Apply

```bash
# MODE=--apply daqui para baixo

if [ "$REFUSE" -gt 0 ]; then
  echo "Aborto: há refuses pendentes. Corre --plan e resolve antes." >&2
  exit 1
fi

if [ "$CREATE" -eq 0 ]; then
  echo "Nada a aplicar."
  exit 0
fi

for entry in "${ACTIONS[@]}"; do
  IFS="|" read -r mark resource path status <<< "$entry"
  [ "$mark" != "+" ] && continue

  case "$resource" in
    "audit file device")
      echo "→ Enable audit file device em /vault/audit/audit.log"
      V audit enable file file_path=/vault/audit/audit.log || { echo "ERRO ao enable audit" >&2; exit 1; }
      ;;
    "kv-v2 mount")
      echo "→ Mount kv-v2 em secret/"
      if [ "$SECRET_TYPE" = "kv" ]; then
        echo "  (disable kv-v1 vazio primeiro)"
        V secrets disable secret || { echo "ERRO ao disable secret/" >&2; exit 1; }
      fi
      V secrets enable -version=2 -path=secret kv || { echo "ERRO ao enable kv-v2" >&2; exit 1; }
      ;;
    "approle auth")
      echo "→ Enable approle auth method"
      V auth enable approle || { echo "ERRO ao enable approle" >&2; exit 1; }
      ;;
    "transit engine")
      echo "→ Enable transit engine"
      V secrets enable transit || { echo "ERRO ao enable transit" >&2; exit 1; }
      ;;
    "ssh engine")
      echo "→ Enable ssh engine"
      V secrets enable -path=ssh ssh || { echo "ERRO ao enable ssh" >&2; exit 1; }
      ;;
  esac
done

echo
echo "✓ /wire-vault-bootstrap --apply completo."
echo "Próximo: /wire-secops-bootstrap --plan (para provisionar conteúdo wire-*)."
echo
echo "Aviso: audit device 'file' é blocking — se /vault/audit/ encher, Vault para de aceitar operações."
echo "Considera configurar logrotate no host sobre o volume vault-audit."
```

## Notas

- **Idempotente**: re-correr `--apply` salta itens já feitos (skip silencioso).
- **kv-v1 com dados**: refuse explícito + manda para `/wire-vault-kv-migrate`. Disable destruiria os dados.
- **Audit path**: `/vault/audit/audit.log` — o `docker-compose.yml` do utilizador já tem volume `vault-audit` com `chown vault:vault` no entrypoint.
- **Sem rollback**: cada operação é atómica em Vault, mas o conjunto não é. Em caso de erro mid-apply, corre `--plan` para ver estado parcial e decide à mão.
- **Token requirement**: policy "root". Bootstrap valida internamente (defesa em profundidade — allowlist do hook não substitui).

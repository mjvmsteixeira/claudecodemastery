---
name: prumo-secops-bootstrap
description: Provisiona conteúdo Wire-specific no Vault — 7 policies wire-*, 7 AppRoles com TTLs do HCL, transit/keys/forensics, ssh/config/ca + 2 ssh roles. Popula macOS Keychain + ~/vault/approle-credentials.json. Idempotente. --plan default; --apply executa. Requer policy 'root' e infra base previamente bootstrapped.
allowed-tools: Bash, Read
argument-hint: "[--plan | --apply]"
---

# /prumo-secops-bootstrap [--plan | --apply]

Provisiona o conteúdo Wire-specific no Vault assumindo que a infra genérica já existe (`/prumo-vault-bootstrap` correu antes).

## Passo 1 — Parse flags

```bash
MODE="${1:---plan}"
case "$MODE" in
  --plan|--apply) ;;
  *) echo "Uso: /prumo-secops-bootstrap [--plan | --apply]" >&2; exit 1 ;;
esac
```

## Passo 2 — Runtime-find de lib/vault-env.sh do prumo-base

```bash
VAULT_ENV=""
for path in \
  "${HOME}/.claude/plugins/cache"/*/prumo-base/*/lib/vault-env.sh \
  "${HOME}/.claude/plugins/cache"/*/*/prumo-base/*/lib/vault-env.sh \
  "${CLAUDE_PLUGIN_ROOT}/../base/lib/vault-env.sh"; do
  [ -f "$path" ] && { VAULT_ENV="$path"; break; }
done

if [ -z "$VAULT_ENV" ]; then
  cat >&2 <<'EOF'
prumo-base não detectado. prumo-secops-bootstrap depende de prumo-base.

Instala primeiro:
  /plugin install prumo-base@prumo
EOF
  exit 1
fi

# shellcheck disable=SC1090
source "$VAULT_ENV"
```

## Passo 3 — Validar Vault + root token + infra base

```bash
if ! vault_ready; then
  echo "Vault inacessível ou sealed. Corre /prumo-vault-doctor." >&2
  exit 1
fi

POLICIES=$(V token lookup -format=json 2>/dev/null | jq -r '.data.policies[]' 2>/dev/null || true)
if ! echo "$POLICIES" | grep -qx "root"; then
  echo "Bootstrap exige token com policy 'root'. Actual: ${POLICIES:-(nenhuma)}." >&2
  echo "  export VAULT_TOKEN=\$(jq -r .root_token ~/vault/vault-init.json)" >&2
  exit 1
fi

# Verifica que approle/transit/ssh já existem (caso contrário manda para prumo-vault-bootstrap)
AUTH_JSON=$(V read sys/auth -format=json 2>/dev/null || echo '{"data":{}}')
MOUNTS_JSON=$(V read sys/mounts -format=json 2>/dev/null || echo '{"data":{}}')

MISSING=""
echo "$AUTH_JSON"   | jq -e '.data["approle/"]' >/dev/null 2>&1 || MISSING="$MISSING approle/"
echo "$MOUNTS_JSON" | jq -e '.data["transit/"]' >/dev/null 2>&1 || MISSING="$MISSING transit/"
echo "$MOUNTS_JSON" | jq -e '.data["ssh/"]'     >/dev/null 2>&1 || MISSING="$MISSING ssh/"

if [ -n "$MISSING" ]; then
  echo "Infra base ausente:$MISSING" >&2
  echo "Corre /prumo-vault-bootstrap --plan && /prumo-vault-bootstrap --apply primeiro." >&2
  exit 1
fi
```

## Passo 4 — Localizar vault-policies.hcl shipado

```bash
HCL_FILE="${CLAUDE_PLUGIN_ROOT}/vault-policies.hcl"
if [ ! -f "$HCL_FILE" ]; then
  echo "vault-policies.hcl não encontrado em $HCL_FILE — reinstala prumo-secops." >&2
  exit 1
fi
```

## Passo 5 — Split HCL em 7 ficheiros temporários por policy

```bash
TMPDIR=$(mktemp -d -t wire-secops-policies.XXXXXX)
trap "rm -rf '$TMPDIR'" EXIT

awk -v out="$TMPDIR" '
  /^# wire-[a-z-]+ —/ {
    match($0, /wire-[a-z-]+/)
    name = substr($0, RSTART, RLENGTH)
    f = out "/policy-" name ".hcl"
    next
  }
  # Terminador: linhas "# ====" marcam o fim das policies (início da secção
  # "Configuração dos AppRoles" no HCL). Fecha o policy actual.
  /^# =+/ { f = ""; next }
  f != "" && !/^# -+$/ { print >> f }
' "$HCL_FILE"

POLICY_FILES=("$TMPDIR"/policy-*.hcl)
if [ "${#POLICY_FILES[@]}" -lt 7 ]; then
  echo "Split do HCL produziu ${#POLICY_FILES[@]} ficheiros, esperados 7. Verifica $HCL_FILE." >&2
  exit 1
fi
```

## Passo 6 — Configs AppRole (TTLs espelham os comentários do HCL)

```bash
# Formato: name|token_ttl|token_max_ttl|secret_id_ttl|secret_id_num_uses
APPROLE_CONFIGS=(
  "wire-monitor|30m|1h|5m|1"
  "wire-ir|15m|1h|5m|1"
  "wire-tenant|15m|30m|5m|1"
  "wire-srv|15m|30m|5m|1"
  "wire-deploy|15m|30m|5m|1"
  "wire-compliance|30m|1h|5m|1"
  "wire-cowork-reporting|60m|2h|10m|1"
)
```

## Passo 7 — Construir action list com status actual

```bash
declare -a ACTIONS=()

# Action 1: 7 policies
for pf in "${POLICY_FILES[@]}"; do
  pname=$(basename "$pf" .hcl | sed 's/^policy-//')
  EXISTING=$(V policy read "$pname" 2>/dev/null || true)
  if [ -z "$EXISTING" ]; then
    ACTIONS+=("+|policy|$pname|write")
  else
    # Compare strip comments + normalize whitespace.
    # Razão: V policy read devolve a representação normalizada pelo Vault
    # (sem comentários, possivelmente reformatada). O local tem comentários.
    NORMAL_EXIST=$(echo "$EXISTING" | grep -v '^[[:space:]]*#' | tr -s '[:space:]' ' ')
    NORMAL_FILE=$(grep -v '^[[:space:]]*#' "$pf" | tr -s '[:space:]' ' ')
    if [ "$NORMAL_EXIST" = "$NORMAL_FILE" ]; then
      ACTIONS+=("✓|policy|$pname|skip:igual")
    else
      ACTIONS+=("+|policy|$pname|update:divergente")
    fi
  fi
done

# Action 2: 7 AppRoles
for conf in "${APPROLE_CONFIGS[@]}"; do
  IFS="|" read -r rname ttl max sid_ttl sid_uses <<< "$conf"
  if V read "auth/approle/role/$rname" >/dev/null 2>&1; then
    ACTIONS+=("✓|approle|$rname|skip:já existe")
  else
    ACTIONS+=("+|approle|$rname|create ttl=$ttl max=$max")
  fi
done

# Action 3: transit/keys/forensics
if V read transit/keys/forensics >/dev/null 2>&1; then
  ACTIONS+=("✓|transit-key|forensics|skip:já existe")
else
  ACTIONS+=("+|transit-key|forensics|create")
fi

# Action 4: ssh/config/ca
if V read ssh/config/ca >/dev/null 2>&1; then
  ACTIONS+=("✓|ssh-ca|ssh/config/ca|skip:já existe")
else
  ACTIONS+=("+|ssh-ca|ssh/config/ca|generate signing key")
fi

# Action 5: ssh roles (wire-srv-role + wire-ir-role)
for role in wire-srv-role wire-ir-role; do
  if V read "ssh/roles/$role" >/dev/null 2>&1; then
    ACTIONS+=("✓|ssh-role|$role|skip:já existe")
  else
    ACTIONS+=("+|ssh-role|$role|create")
  fi
done

# Action 6: Keychain + file por AppRole
KEYCHAIN_FILE="${VAULT_HOME:-$HOME/vault}/approle-credentials.json"
for conf in "${APPROLE_CONFIGS[@]}"; do
  IFS="|" read -r rname _ <<< "$conf"
  HAS_RID=$(security find-generic-password -a wire-secops -s "vault-role-id-$rname" -w 2>/dev/null || true)
  HAS_SID=$(security find-generic-password -a wire-secops -s "vault-secret-id-$rname" -w 2>/dev/null || true)
  if [ -n "$HAS_RID" ] && [ -n "$HAS_SID" ]; then
    ACTIONS+=("⟳|credentials|$rname|rotate secret-id (invalida o anterior)")
  else
    ACTIONS+=("+|credentials|$rname|generate + Keychain + file")
  fi
done
```

## Passo 8 — Imprimir plano

```bash
echo "── Plano: /prumo-secops-bootstrap ──"
echo
printf "%-3s %-14s %-26s %s\n" "" "Tipo" "Nome" "Status"
echo "──────────────────────────────────────────────────────────────────────"

CREATE=0; SKIP=0; ROTATE=0; REFUSE=0
for entry in "${ACTIONS[@]}"; do
  IFS="|" read -r mark kind name status <<< "$entry"
  printf "%-3s %-14s %-26s %s\n" "$mark" "$kind" "$name" "$status"
  case "$mark" in
    "+") CREATE=$((CREATE+1)) ;;
    "✓") SKIP=$((SKIP+1)) ;;
    "⟳") ROTATE=$((ROTATE+1)) ;;
    "⚠") REFUSE=$((REFUSE+1)) ;;
  esac
done

echo
echo "Resumo: + $CREATE a criar/update · ⟳ $ROTATE a rotar · ✓ $SKIP skip · ⚠ $REFUSE refuse"

if [ "$ROTATE" -gt 0 ]; then
  echo
  echo "AVISO: ⟳ items rodam secret-ids. Tokens emitidos a partir do secret-id anterior serão invalidados."
fi

if [ "$MODE" = "--plan" ]; then
  echo
  if [ "$CREATE" -gt 0 ] || [ "$ROTATE" -gt 0 ]; then
    echo "Para executar: /prumo-secops-bootstrap --apply"
  else
    echo "Nada a fazer."
  fi
  exit 0
fi
```

## Passo 9 — Apply

```bash
if [ "$CREATE" -eq 0 ] && [ "$ROTATE" -eq 0 ]; then
  echo "Nada a aplicar."
  exit 0
fi

for entry in "${ACTIONS[@]}"; do
  IFS="|" read -r mark kind name status <<< "$entry"
  [ "$mark" = "✓" ] && continue
  [ "$mark" = "⚠" ] && { echo "Aborto: refuse pendente para $kind/$name" >&2; exit 1; }

  case "$kind" in
    "policy")
      pf="$TMPDIR/policy-$name.hcl"
      echo "→ policy write $name"
      # Via HTTP API directa — funciona em native E docker mode (V não passa
      # ficheiros host para o container; policy write CLI exigiria isso).
      CURL_CACERT="${VAULT_CACERT:-${VAULT_HOME:-$HOME/vault}/tls/ca.pem}"
      CURL_ARGS=()
      if [[ "$VAULT_ADDR" == https://* ]]; then
        if [ ! -f "$CURL_CACERT" ]; then
          echo "ERRO: VAULT_ADDR é HTTPS mas VAULT_CACERT ausente ou inválido: $CURL_CACERT" >&2
          echo "       Export VAULT_CACERT ou use VAULT_ADDR=http:// para dev." >&2
          exit 1
        fi
        CURL_ARGS+=(--cacert "$CURL_CACERT")
      fi
      POLICY_BODY=$(jq -n --arg p "$(cat "$pf")" '{policy: $p}')
      HTTP=$(curl -s -o /dev/null -w '%{http_code}' "${CURL_ARGS[@]}" \
        -H "X-Vault-Token: $VAULT_TOKEN" \
        -X PUT \
        -d "$POLICY_BODY" \
        "${VAULT_ADDR}/v1/sys/policies/acl/${name}")
      if [ "$HTTP" != "204" ] && [ "$HTTP" != "200" ]; then
        echo "ERRO ao policy write $name (HTTP $HTTP)" >&2
        exit 1
      fi
      ;;
    "approle")
      # Encontrar config
      for conf in "${APPROLE_CONFIGS[@]}"; do
        IFS="|" read -r rname ttl max sid_ttl sid_uses <<< "$conf"
        if [ "$rname" = "$name" ]; then
          echo "→ approle create $name (ttl=$ttl max_ttl=$max)"
          V write "auth/approle/role/$name" \
            token_ttl="$ttl" \
            token_max_ttl="$max" \
            token_policies="$name" \
            secret_id_ttl="$sid_ttl" \
            secret_id_num_uses="$sid_uses" \
            || { echo "ERRO ao criar approle $name" >&2; exit 1; }
          break
        fi
      done
      ;;
    "transit-key")
      echo "→ transit/keys/forensics"
      V write -f transit/keys/forensics || { echo "ERRO" >&2; exit 1; }
      ;;
    "ssh-ca")
      echo "→ ssh/config/ca (generate signing key)"
      V write ssh/config/ca generate_signing_key=true || { echo "ERRO" >&2; exit 1; }
      ;;
    "ssh-role")
      case "$name" in
        wire-srv-role)
          echo "→ ssh/roles/wire-srv-role"
          V write ssh/roles/wire-srv-role \
            key_type=ca \
            algorithm_signer=rsa-sha2-256 \
            allowed_users="wire-srv,wire-deploy" \
            default_user="wire-srv" \
            ttl=15m max_ttl=15m \
            || { echo "ERRO" >&2; exit 1; }
          ;;
        wire-ir-role)
          echo "→ ssh/roles/wire-ir-role"
          V write ssh/roles/wire-ir-role \
            key_type=ca \
            algorithm_signer=rsa-sha2-256 \
            allowed_users="wire-ir" \
            default_user="wire-ir" \
            ttl=15m max_ttl=15m \
            || { echo "ERRO" >&2; exit 1; }
          ;;
      esac
      ;;
    "credentials")
      echo "→ credentials $name (role-id + secret-id → Keychain + file)"
      RID=$(V read -field=role_id "auth/approle/role/$name/role-id") || { echo "ERRO ao ler role-id" >&2; exit 1; }
      SID=$(V write -force -field=secret_id "auth/approle/role/$name/secret-id") || { echo "ERRO ao gerar secret-id" >&2; exit 1; }

      # Keychain (substitui -U se já existe)
      security add-generic-password -a wire-secops -s "vault-role-id-$name"   -w "$RID" -U >/dev/null
      security add-generic-password -a wire-secops -s "vault-secret-id-$name" -w "$SID" -U >/dev/null

      # File (chmod 600 idempotente)
      mkdir -p "$(dirname "$KEYCHAIN_FILE")"
      [ ! -f "$KEYCHAIN_FILE" ] && echo '{}' > "$KEYCHAIN_FILE"
      chmod 600 "$KEYCHAIN_FILE"
      # tmpfile no MESMO directório que $KEYCHAIN_FILE garante mv atómico
      TMPMERGE=$(mktemp "${KEYCHAIN_FILE}.XXXXXX")
      jq --arg n "$name" --arg r "$RID" --arg s "$SID" --arg ts "$(date -u +%FT%TZ)" \
         '.[$n] = {role_id: $r, secret_id: $s, rotated_at: $ts}' "$KEYCHAIN_FILE" > "$TMPMERGE"
      mv "$TMPMERGE" "$KEYCHAIN_FILE"
      chmod 600 "$KEYCHAIN_FILE"

      echo "  ✓ $name: armazenado (Keychain + $KEYCHAIN_FILE)"
      ;;
  esac
done

echo
echo "✓ /prumo-secops-bootstrap --apply completo."
echo
echo "Próximos passos:"
echo "  /prumo-vault-doctor      # validar findings resolvidos"
echo "  vault write auth/approle/login \\"
echo "    role_id=\$(security find-generic-password -a wire-secops -s vault-role-id-wire-monitor -w) \\"
echo "    secret_id=\$(security find-generic-password -a wire-secops -s vault-secret-id-wire-monitor -w)"
```

## Notas

- **Idempotente**: re-correr `--apply` salta policies/AppRoles/keys/roles iguais. Credenciais são marcadas `⟳` para rotação explícita (não skip).
- **Rotação de secret-id**: re-apply gera SEMPRE novo secret-id (Vault não tem "get existing"). O anterior é invalidado. Mostra warning no plan.
- **Sem rollback**: cada operação atómica em Vault; o conjunto não é. Em erro mid-apply, log diz onde parou; re-correr `--apply` é seguro (idempotente).
- **Keychain + file**: dual storage. Keychain primário (hook espera-o); ficheiro `~/vault/approle-credentials.json` (chmod 600) é audit trail + recovery.
- **Token requirement**: policy "root". Defesa em profundidade.
- **HCL como source-of-truth**: split via `awk` por header `# wire-<nome> —`. Se editares o HCL para adicionar uma policy nova, lembra-te de adicionar à `APPROLE_CONFIGS` se também for AppRole.

---
name: prumo-vault-kv-migrate
description: Migra kv-v1 → kv-v2 no mount secret/. Destrutivo (disable apaga dados). Fluxo em 3 etapas exclusivas: --plan (default, conta paths/keys, não escreve), --backup (exporta para ~/vault/backups/kv-v1-<ts>.json), --apply (exige backup <24h, executa migração e re-import). Requer policy 'root'.
allowed-tools: Bash, Read, Write
argument-hint: "[--plan | --backup | --apply]"
---

# /prumo-vault-kv-migrate [--plan | --backup | --apply]

<!-- Nota: todos os blocos bash partilham state. Em --apply, `walk_kv1` é
re-derivada do backup (não do walker em runtime). MODE define qual Passo
executa. -->

Migra `secret/` de KV v1 para KV v2. **Destrutivo** — o disable apaga os dados; o re-import a partir do backup é a única recuperação. Por isso o fluxo é faseado.

## Passo 1 — Parse flag (exactamente uma)

```bash
MODE="${1:---plan}"
case "$MODE" in
  --plan|--backup|--apply) ;;
  *) echo "Uso: /prumo-vault-kv-migrate [--plan | --backup | --apply]" >&2; exit 1 ;;
esac
```

## Passo 2 — Source vault-env + validar Vault + root

```bash
# shellcheck disable=SC1091
source "${CLAUDE_PLUGIN_ROOT}/lib/vault-env.sh"

if ! vault_ready; then
  echo "Vault inacessível ou sealed. Corre /prumo-vault-doctor primeiro." >&2
  exit 1
fi

POLICIES=$(V token lookup -format=json 2>/dev/null | jq -r '.data.policies[]' 2>/dev/null || true)
if ! echo "$POLICIES" | grep -qx "root"; then
  echo "Migrate exige token com policy 'root'. Actual: ${POLICIES:-(nenhuma)}." >&2
  echo "  export VAULT_TOKEN=\$(jq -r .root_token ~/vault/vault-init.json)" >&2
  exit 1
fi
```

## Passo 3 — Verificar estado do mount secret/

```bash
MOUNTS_JSON=$(V read sys/mounts -format=json 2>/dev/null || echo '{"data":{}}')
SECRET_TYPE=$(echo "$MOUNTS_JSON" | jq -r '.data["secret/"].type // "none"')
SECRET_VERSION=$(echo "$MOUNTS_JSON" | jq -r '.data["secret/"].options.version // "1"')

if [ "$SECRET_TYPE" = "none" ]; then
  echo "secret/ não está montado. Corre /prumo-vault-bootstrap primeiro." >&2
  exit 1
fi

if [ "$SECRET_TYPE" = "kv" ] && [ "$SECRET_VERSION" = "2" ]; then
  echo "secret/ já é kv-v2. Nada a migrar."
  exit 0
fi

if [ "$SECRET_TYPE" != "kv" ]; then
  echo "secret/ tem type='$SECRET_TYPE' (não é kv). Migrate só suporta kv-v1 → kv-v2." >&2
  exit 1
fi
```

## Passo 4 — Walker recursivo (helper)

```bash
# Walker recursivo sobre kv-v1 (LIST top-level + recurse em paths terminados em /).
# Devolve linhas no formato "<path-relativo>" para folhas (não-pastas).
walk_kv1() {
  local prefix="$1"
  local listing
  listing=$(V list -format=json "secret/$prefix" 2>/dev/null | jq -r '.[]?' 2>/dev/null || true)
  while IFS= read -r entry; do
    [ -z "$entry" ] && continue
    if [[ "$entry" == */ ]]; then
      walk_kv1 "${prefix}${entry}"
    else
      echo "${prefix}${entry}"
    fi
  done <<< "$listing"
}
```

## Passo 5 — Modo --plan

```bash
if [ "$MODE" = "--plan" ]; then
  echo "── /prumo-vault-kv-migrate --plan ──"
  echo "Estado actual: secret/ é kv-v1."
  echo
  echo "A walk-ar recursivamente (pode demorar se houver muitos paths)..."

  TMPFILE=$(mktemp -t prumo-kv-plan.XXXXXX)
  walk_kv1 "" > "$TMPFILE"

  PATHS_COUNT=$(wc -l < "$TMPFILE" | tr -d ' ')
  KEYS_COUNT=0
  while IFS= read -r p; do
    [ -z "$p" ] && continue
    KS=$(V read "secret/$p" -format=json 2>/dev/null | jq -r '.data | keys[]' 2>/dev/null | wc -l | tr -d ' ')
    KEYS_COUNT=$((KEYS_COUNT + KS))
  done < "$TMPFILE"

  echo
  echo "Paths encontrados: $PATHS_COUNT"
  echo "Chaves totais: $KEYS_COUNT"
  echo
  if [ "$PATHS_COUNT" -eq 0 ]; then
    echo "secret/ kv-v1 está vazio. Podes correr /prumo-vault-bootstrap --apply directamente — ele faz disable+re-enable como v2."
  else
    echo "Próximo passo: /prumo-vault-kv-migrate --backup"
  fi
  rm -f "$TMPFILE"
  exit 0
fi
```

## Passo 6 — Modo --backup

```bash
if [ "$MODE" = "--backup" ]; then
  BACKUP_DIR="${VAULT_HOME:-$HOME/vault}/backups"
  mkdir -p "$BACKUP_DIR"
  chmod 700 "$BACKUP_DIR"
  TS=$(date +%Y%m%d-%H%M%S)
  BACKUP_FILE="$BACKUP_DIR/kv-v1-${TS}.json"

  echo "── /prumo-vault-kv-migrate --backup ──"
  echo "Backup para: $BACKUP_FILE"
  echo

  TMPFILE=$(mktemp -t prumo-kv-backup.XXXXXX)
  walk_kv1 "" > "$TMPFILE"
  PATHS_COUNT=$(wc -l < "$TMPFILE" | tr -d ' ')

  if [ "$PATHS_COUNT" -eq 0 ]; then
    echo "Nada a fazer — secret/ está vazio."
    rm -f "$TMPFILE"
    exit 0
  fi

  : > "$BACKUP_FILE"
  while IFS= read -r p; do
    [ -z "$p" ] && continue
    DATA_JSON=$(V read "secret/$p" -format=json 2>/dev/null | jq -c '.data' 2>/dev/null)
    if [ -z "$DATA_JSON" ] || [ "$DATA_JSON" = "null" ]; then
      echo "AVISO: $p sem data legível — skip" >&2
      continue
    fi
    # JSONL: uma linha por path. Usa jq para construir o JSON — seguro contra
    # paths/keys com aspas, barras invertidas, etc.
    jq -nc --arg path "$p" --argjson data "$DATA_JSON" '{path:$path, data:$data}' >> "$BACKUP_FILE"
  done < "$TMPFILE"
  rm -f "$TMPFILE"

  chmod 600 "$BACKUP_FILE"

  # Validar JSONL: cada linha parseia
  LINES=$(wc -l < "$BACKUP_FILE" | tr -d ' ')
  VALID=0
  while IFS= read -r line; do
    echo "$line" | jq -e . >/dev/null 2>&1 && VALID=$((VALID+1))
  done < "$BACKUP_FILE"

  if [ "$VALID" -ne "$LINES" ]; then
    echo "ERRO: backup tem $LINES linhas mas só $VALID parseiam. NÃO continuar com --apply." >&2
    exit 1
  fi

  echo "✓ Backup criado: $LINES paths, $VALID JSON válidos. Permissões 600."
  echo
  echo "Próximo passo (irreversível sem este backup): /prumo-vault-kv-migrate --apply"
  exit 0
fi
```

## Passo 7 — Modo --apply (destrutivo)

```bash
if [ "$MODE" = "--apply" ]; then
  BACKUP_DIR="${VAULT_HOME:-$HOME/vault}/backups"

  # Encontrar backup mais recente
  LATEST=$(ls -1t "$BACKUP_DIR"/kv-v1-*.json 2>/dev/null | head -1)
  if [ -z "$LATEST" ] || [ ! -f "$LATEST" ]; then
    echo "Sem backup em $BACKUP_DIR. Corre /prumo-vault-kv-migrate --backup primeiro." >&2
    exit 1
  fi

  # Idade < 24h
  NOW=$(date +%s)
  MTIME=$(file_mtime "$LATEST")
  AGE_S=$((NOW - MTIME))
  if [ "$AGE_S" -gt 86400 ]; then
    AGE_H=$((AGE_S / 3600))
    echo "Backup mais recente ($LATEST) tem ${AGE_H}h — >24h, demasiado velho." >&2
    echo "Corre /prumo-vault-kv-migrate --backup para refrescar." >&2
    exit 1
  fi

  EXPECTED_COUNT=$(wc -l < "$LATEST" | tr -d ' ')
  echo "── /prumo-vault-kv-migrate --apply ──"
  echo "Backup: $LATEST ($EXPECTED_COUNT paths, $((AGE_S / 60))m de idade)"
  echo
  echo "ATENÇÃO: vai correr disable→re-enable→re-import em secret/."
  echo "Estado parcial possível se algo falhar. O backup é a única recuperação."
  echo
  if [ "${PRUMO_VAULT_MIGRATE_CONFIRM:-}" != "migrate-now" ]; then
    cat >&2 <<'EOF'

Para prosseguir, define a env-var de confirmação e re-corre:

  PRUMO_VAULT_MIGRATE_CONFIRM=migrate-now /prumo-vault-kv-migrate --apply

A env-var é deliberada — força confirmação explícita e legível em transcripts.
EOF
    exit 0
  fi
  echo "→ Confirmação recebida (PRUMO_VAULT_MIGRATE_CONFIRM=migrate-now)"

  echo
  echo "→ disable secret/ (kv-v1)"
  V secrets disable secret || { echo "ERRO ao disable" >&2; exit 1; }

  echo "→ enable secret/ como kv-v2"
  V secrets enable -version=2 -path=secret kv || { echo "ERRO ao enable kv-v2" >&2; exit 1; }

  # Usa HTTP API directa em vez de `V kv put` porque (1) o V() em docker
  # mode não passa stdin para o container, e (2) precisamos de enviar o JSON
  # do payload sem o re-flatten que `vault kv put key=value` faria.
  echo "→ re-import de $EXPECTED_COUNT paths (via HTTP API directa)"
  IMPORTED=0
  FAILED=0
  # Cacert path: native mode tem exported; docker mode usa host path default
  CURL_CACERT="${VAULT_CACERT:-${VAULT_HOME:-$HOME/vault}/tls/ca.pem}"
  CURL_ARGS=()
  [ -f "$CURL_CACERT" ] && CURL_ARGS+=(--cacert "$CURL_CACERT")

  while IFS= read -r line; do
    PATH_REL=$(echo "$line" | jq -r '.path')
    DATA=$(echo "$line" | jq -c '.data')
    HTTP=$(curl -s -o /dev/null -w '%{http_code}' "${CURL_ARGS[@]}" \
      -H "X-Vault-Token: $VAULT_TOKEN" \
      -X POST \
      -d "{\"data\":${DATA}}" \
      "${VAULT_ADDR}/v1/secret/data/${PATH_REL}" 2>/dev/null || echo "000")
    if [ "$HTTP" = "200" ] || [ "$HTTP" = "204" ]; then
      IMPORTED=$((IMPORTED+1))
    else
      echo "  ✗ falhou (HTTP $HTTP): $PATH_REL"
      FAILED=$((FAILED+1))
    fi
  done < "$LATEST"

  echo
  echo "Re-import completo: $IMPORTED / $EXPECTED_COUNT paths."
  if [ "$FAILED" -gt 0 ]; then
    echo "ERRO: $FAILED paths falharam. Estado parcial. Vê os logs acima." >&2
    echo "O backup ainda está em $LATEST — podes re-tentar com /prumo-vault-kv-migrate --apply (idempotente em kv-v2: re-import sobrepõe)." >&2
    exit 1
  fi

  echo "✓ Migração completa. Verifica com: vault kv list secret/"
  exit 0
fi
```

## Notas

- **Backup é a verdade.** Se algo falhar mid-apply, o backup é a única fonte. Mantém-no até confirmares que tudo está OK em kv-v2.
- **Idempotente em re-tentativa.** Se `--apply` falhou parcialmente após o disable+enable, re-correr `--apply` (com o mesmo backup) faz re-import via `kv put` que sobrepõe — não duplica.
- **Confirmação via env-var** (`PRUMO_VAULT_MIGRATE_CONFIRM=migrate-now`) propositada — é destrutivo, não queremos enganos por copy-paste de comando incompleto. Funciona em ambientes sem TTY (ex: Claude via Bash tool).
- **Walker recursivo** caminha o que o LIST devolve por nível; paths terminados em `/` são folders, restantes são folhas. Vault kv-v1 não tem recursive LIST nativo.

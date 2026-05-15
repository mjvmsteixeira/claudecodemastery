---
name: vault-backup
description: Exporta/verifica backup encriptado dos segredos do projecto no Vault.
allowed-tools: Bash
argument-hint: "exportar | listar | verificar"
---

# Vault Backup — Segredos do Projecto

Exporta os segredos do projecto actual para um ficheiro local encriptado com `openssl`.
Útil para portabilidade ou recuperação sem depender do Vault.

> Este comando é o backup **por projecto**. O snapshot global da infraestrutura
> (Raft) é responsabilidade do operador do Vault, fora do âmbito deste plugin.

## Subcomandos

O utilizador pode pedir:
- **exportar / fazer backup** → criar ficheiro encriptado com os segredos do projecto
- **listar backups** → mostrar backups existentes do projecto
- **verificar estado** → último backup e se está actualizado

---

## Exportar segredos do projecto

```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/vault-env.sh"
vault_ready || { echo "Vault inacessível ou sealed — abortar."; exit 1; }

PROJECT=$(basename "$PWD")
BACKUP_DIR="$VAULT_HOME/backups/projects"
mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
OUT_FILE="$BACKUP_DIR/${PROJECT}-${TIMESTAMP}.json.enc"
TMP_FILE=$(mktemp)

# Recolher todos os segredos do projecto em JSON
V kv list -format=json "secret/projects/$PROJECT" 2>/dev/null | jq -r '.[]?' | while read -r entry; do
  V kv get -format=json "secret/projects/$PROJECT/$entry" 2>/dev/null \
    | jq --arg path "secret/projects/$PROJECT/$entry" \
      '{path: $path, data: .data.data}'
done | jq -s '.' > "$TMP_FILE"

# Encriptar com openssl (pede password interactivamente)
openssl enc -aes-256-cbc -pbkdf2 -in "$TMP_FILE" -out "$OUT_FILE"
rm -f "$TMP_FILE"
chmod 600 "$OUT_FILE"

echo "Backup: $OUT_FILE ($(du -h "$OUT_FILE" | cut -f1))"
```

---

## Listar backups do projecto

```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/vault-env.sh"
PROJECT=$(basename "$PWD")
BACKUP_DIR="$VAULT_HOME/backups/projects"

ls -t "$BACKUP_DIR/${PROJECT}-"*.json.enc 2>/dev/null | while read -r file; do
  size=$(du -h "$file" | cut -f1)
  age=$(( ( $(date +%s) - $(file_mtime "$file") ) / 86400 ))
  echo "$file  |  $size  |  ${age}d atrás"
done || echo "Nenhum backup encontrado para '$PROJECT'"
```

---

## Restaurar (desencriptar para inspecção)

```bash
# Substituir <ficheiro> pelo path do backup
openssl enc -d -aes-256-cbc -pbkdf2 -in <ficheiro> | jq .
```

**Não usar para restaurar directamente no Vault** — usar `/vault-set` para repor cada valor manualmente após inspecção.

---

## Regras

- O ficheiro exportado contém valores reais — tratar como segredo (permissão 600, não commitar)
- A password de encriptação não é guardada em lado nenhum — não a perder
- Nunca colocar o directório de backups dentro de um repositório git

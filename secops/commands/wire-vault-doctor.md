---
name: wire-vault-doctor
description: Diagnóstico do Vault de PRODUÇÃO do SaaS Wire (vault.wire.internal) — endpoint, token TTL, seal status, HA Raft leader, audit device, AppRoles wire-*, backends transit/ssh/kv. Reporta verde/amarelo/vermelho com acções concretas. NÃO confundir com /vault-audit (que valida o Vault LOCAL de desenvolvimento do projecto).
---

Executa diagnóstico completo do Vault que sustenta o broker de credenciais do plugin Wire SecOps.

## Objectivo

O Vault é a peça central — sem ele todos os hooks (`pre-tool-vault-ttl.sh`), todos os subagentes (AppRole login), todas as ops privilegiadas falham fail-closed. Este doctor antecipa problemas: token a expirar, seal status, audit device em down, AppRoles desconfigurados.

## Workflow

Corre checks **em sequência**, parando no primeiro fail crítico. Usa `Bash` para todos os comandos.

### Check 1 · Endpoint reachable

```bash
: "${VAULT_ADDR:?VAULT_ADDR não definido.

Produção:
  export VAULT_ADDR=https://vault.wire.internal:8200
  export VAULT_CACERT=/path/para/wire-prod-ca.pem

Local dev:
  export VAULT_ADDR=https://127.0.0.1:8200
  export VAULT_CACERT=\$HOME/vault/tls/ca.pem
}"

TMP_HEALTH=$(mktemp -t vault-doctor-health.XXXXXX)
TMP_TOK=$(mktemp -t vault-doctor-tok.XXXXXX)
TMP_AUDIT=$(mktemp -t vault-doctor-audit.XXXXXX)
TMP_MOUNTS=$(mktemp -t vault-doctor-mounts.XXXXXX)
TMP_APPROLES=$(mktemp -t vault-doctor-approles.XXXXXX)
trap 'rm -f "$TMP_HEALTH" "$TMP_TOK" "$TMP_AUDIT" "$TMP_MOUNTS" "$TMP_APPROLES"' EXIT

curl -sf -m 3 "${VAULT_ADDR}/v1/sys/health" > "$TMP_HEALTH"
```

- **OK** → continua
- **FAIL** (connection refused, timeout) → reporta: Vault server em down. Acção: `docker compose up -d` (dev) ou contactar SRE Wire (prod). Para aqui.
- **FAIL TLS** (`cert not trusted`) → indica que CLI está em HTTP mas server em HTTPS (ou vice-versa). Acção: verificar `VAULT_ADDR` e `VAULT_SKIP_VERIFY`.

### Check 2 · Seal status

```bash
SEALED=$(jq -r '.sealed' "$TMP_HEALTH")
INITIALIZED=$(jq -r '.initialized' "$TMP_HEALTH")
```

- **OK** se `sealed=false` e `initialized=true`
- **FAIL** se `sealed=true` → Vault precisa de unseal. Acção (prod): `vault operator unseal` com keys do quorum. Acção (dev): reiniciar container.
- **FAIL** se `initialized=false` → Vault novo, não bootstrapped. Acção: `vault operator init` (apenas primeira vez, gera unseal keys).

### Check 3 · Token válido + TTL

```bash
[ -n "$VAULT_TOKEN" ] || exit_fail "VAULT_TOKEN não definido na shell"
vault token lookup -format=json > "$TMP_TOK" 2>&1
TTL=$(jq -r '.data.ttl // 0' "$TMP_TOK")
POLICIES=$(jq -r '.data.policies | join(",")' "$TMP_TOK")
```

- **OK** se TTL ≥ 300s (5 min) e policies não-vazias
- **WARN** se TTL < 300s → token vai expirar em breve. Acção: `vault token renew` ou re-login AppRole (ver Re-login abaixo).
- **FAIL** se token inválido (404/permission denied) → expirado/revogado. Acção: re-login AppRole.

#### Re-login AppRole (substitui o antigo `wire-secops-login`)

```bash
export VAULT_ROLE_ID=$(security find-generic-password -a wire-secops -s vault-role-id-wire-monitor -w)
export VAULT_SECRET_ID=$(security find-generic-password -a wire-secops -s vault-secret-id-wire-monitor -w)
export VAULT_TOKEN=$(vault write -field=token auth/approle/login \
  role_id="$VAULT_ROLE_ID" secret_id="$VAULT_SECRET_ID")
```

(Substitui `wire-monitor` por outro AppRole conforme o contexto.)

### Check 4 · HA status (se aplicável)

```bash
HA=$(curl -sf "${VAULT_ADDR}/v1/sys/ha-status" -H "X-Vault-Token: $VAULT_TOKEN" 2>/dev/null)
```

- **OK** se modo single-node (dev) OU se HA com leader identificado e ≥2 nós healthy
- **WARN** se HA com apenas 1 nó healthy (sem redundância)
- **FAIL** se HA sem leader → split-brain. Acção: escalar imediatamente ao SRE.

### Check 5 · Audit device activo

```bash
vault audit list -format=json > "$TMP_AUDIT"
COUNT=$(jq 'keys | length' "$TMP_AUDIT")
```

- **OK** se ≥1 audit device activo
- **CRÍTICO** se nenhum → **toda a operação não fica auditada**. Acção imediata: `vault audit enable file file_path=/var/log/vault-audit.log` ou `socket address=wazuh:514 socket_type=udp`. Para conformidade Wire, audit é não-negociável.

### Check 6 · Backends esperados

```bash
vault secrets list -format=json > "$TMP_MOUNTS"
```

Verifica que estes paths estão montados:

| Path | Tipo | Razão |
|------|------|-------|
| `secret/` | kv-v2 | secrets versionados |
| `transit/` | transit | cifra como serviço |
| `ssh/` | ssh | SSH CA |
| `auth/approle/` | approle | login dos subagentes (em sys/auth) |

- **OK** se todos presentes
- **FAIL** com lista do que falta. Acção: comandos `vault secrets enable ...` da slide 12 da formação.

### Check 7 · AppRoles do plugin

```bash
vault list -format=json auth/approle/role | jq -r '.[]' > "$TMP_APPROLES"
```

Espera-se ver:
- `wire-monitor`
- `wire-ir`
- `wire-tenant`
- `wire-srv`
- `wire-deploy`
- `wire-compliance`
- `wire-cowork-reporting`

- **OK** se todos os 7 presentes
- **WARN** com lista do que falta. Acção: aplicar `vault-policies.hcl` + criar AppRoles (slide 12).

### Output estruturado

```
== Wire · Vault Doctor · 2026-05-13 23:00 ==

Endpoint:        http://127.0.0.1:8200        [✓ HTTP 200]
Seal status:     unsealed · initialized        [✓]
Token TTL:       28m12s · policies=root        [✓]
HA:              single-node (dev)             [INFO]
Audit devices:   1 (file)                      [✓]
Backends:        kv-v2 · transit · ssh         [✓]
AppRoles:        7/7 (wire-*)              [✓]

Verdicto: HEALTHY · broker operacional.

Action items:
  - Token expira em 28m — renova com `vault token renew` em <5m.
  - Em produção: validar HA Raft 3 nós + auto-unseal + TLS mútuo.
```

## Estados possíveis

- **HEALTHY** (verde) — broker funcional para operação normal
- **DEGRADED** (amarelo) — opera mas com gaps (single-node em prod, audit em ficheiro só, etc.)
- **BROKEN** (vermelho) — sealed, sem token, sem audit, ou backend faltoso. **Plugin bloqueia fail-closed.**

## Variáveis respeitadas

- `VAULT_ADDR` — endpoint
- `VAULT_TOKEN` — token actual da sessão
- `VAULT_CACERT` — CA cert para TLS (prod)
- `VAULT_NAMESPACE` — namespace Wire (se Vault Enterprise)

## Cadência sugerida

- **Início do turno** após re-login AppRole (ver secção acima)
- **Antes de exercício IR** (depende do Vault para SSH CA)
- **Em onboarding de novo engineer** (verifica que AppRoles estão ok antes de dar acesso)
- **Schedule diário** via cron, alerta para SRE se BROKEN >5 min

## Limites

- Read-only. Não inicia/sela Vault, não cria AppRoles.
- Não testa Transit keys per-tenant individualmente (seria too verbose).
- Não valida HCL policies — assume que aplicação foi feita correctamente pelo SRE.

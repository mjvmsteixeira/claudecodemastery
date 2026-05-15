---
description: Diagnóstico orquestrado de TODA a stack que o plugin depende — Vault, Wazuh, Fortigate, Zabbix, Ollama. Agrega verdictos individuais num único painel GREEN/YELLOW/RED.
---

Doctor "umbrella" que corre os diagnósticos individuais em sequência e produz um único painel agregado da saúde de toda a stack que o plugin precisa para operar em pleno.

## Quando usar

- **Manhã, antes de operar** — uma única invocação confirma que tudo está pronto.
- **Após mudança de rede / VPN reconnect** — valida que endpoints internos Wire são alcançáveis.
- **Antes de exercício IR ou release-gate** — preciso de garantir que Wazuh, Fortigate e Vault estão todos OK.
- **Pós-update do plugin** (`/plugin marketplace update`) — verifica que ambiente não regrediu.

## Workflow

Executa em sequência, **sem parar** entre checks (ao contrário dos doctors individuais que param no primeiro fail). Cada componente reporta o seu próprio verdicto, depois agrega.

### 1. Vault (crítico)

Chama internamente o playbook do `/wire-vault-doctor`. Resumo só com verdicto final + 1-3 issues críticas se existirem.

### 2. Ollama (crítico para ops destrutivas)

Chama internamente o playbook do `/wire-ollama-doctor`. Sem Ollama, hook `pre-tool-second-opinion.sh` bloqueia.

### 3. Wazuh quick-check (crítico para audit)

```bash
curl -sf -m 5 -k "https://${WAZUH_HOST}:${WAZUH_API_PORT:-55000}/" -o /dev/null -w "%{http_code}\n"
```

- **OK** se HTTP 200/401 (401 significa que o endpoint está vivo, só precisa de auth)
- **FAIL** se connection refused / timeout → audit não chega ao SIEM. Hook post-tool falha silenciosamente.

### 4. Fortigate quick-check (importante para correlação)

```bash
curl -sf -m 5 -k "https://${FORTIGATE_HOST}/api/v2/monitor/system/status" -o /dev/null -w "%{http_code}\n"
```

- **OK** se HTTP 200/401
- **WARN** se inacessível → correlação Wazuh↔Fortigate fica cega. Plugin opera mas com vista limitada.

### 5. Zabbix quick-check (importante para monitorização activa)

```bash
curl -sf -m 5 "${ZABBIX_URL}" -X POST -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"apiinfo.version","id":1}' | jq -r '.result // empty'
```

- **OK** se devolve versão
- **WARN** se inacessível → `wire-saas-monitoring` skill perde uma das 3 fontes.

### 6. Conectividade ao GitHub marketplace

```bash
curl -sf -m 5 https://github.com/mjvmsteixeira/claudecodemastery.git/info/refs?service=git-upload-pack -o /dev/null -w "%{http_code}\n"
```

- **OK** se HTTP 200 → `/plugin marketplace update` vai funcionar
- **WARN** se 401/404 → repo privado precisa de auth, ou perdeu visibility

### Output estruturado

```
== Wire · STACK DOCTOR · 2026-05-13 23:05 ==

[1] Vault             HEALTHY    broker OK · token TTL 28m · 7 AppRoles
[2] Ollama            HEALTHY    qwen3-coder · smoke 1.8s · fail-closed OK
[3] Wazuh API         OK         endpoint vivo (HTTP 401, requer auth) 
[4] Fortigate API     WARN       timeout · perde correlação perimeter
[5] Zabbix API        OK         v6.4.2 · API responde
[6] GitHub marketplace OK        repo público, update operacional

Verdicto global: DEGRADED (1 WARN, 5 OK)

[!] Fortigate inacessível → correlação Wazuh↔Fortigate fica cega.
    A skill 'wire-saas-monitoring' opera mas só com 2 das 3 fontes.
    Acção: verificar VPN Wire, firewall rules, ou variável FORTIGATE_HOST.

Critical path validation:
  - Operação read-only (saas-health, tenant-audit):     ✓ pode operar
  - Operação destrutiva (IR, release-gate, rollback):  ✓ second-opinion activo
  - Correlação cross-source (incident-spread):         ⚠ Fortigate em down
  - Audit trail (todos os commands):                    ✓ Wazuh OK

Próximos passos:
  1. /wire-vault-doctor    (detail completo Vault)
  2. /wire-ollama-doctor   (detail completo Ollama)
  3. Investigar Fortigate · ver Erro 3/5 do troubleshooting
```

## Verdictos globais

| Verdicto | Critério | Acção |
|----------|----------|-------|
| **HEALTHY** | Todos OK ou só INFO | Operar livremente |
| **DEGRADED** | 1+ WARN mas Vault+Ollama HEALTHY | Operar com cautela, evitar features afectadas |
| **CRITICAL** | Vault BROKEN OR Ollama BROKEN | Não operar · Reparar primeiro |
| **OFFLINE** | Sem rede Wire | Modo formação local · só comandos read-only que não dependem de SIEM |

## Decisão automática

O `wire-stack-doctor` ressalta no topo o que **podes** e o que **não podes** fazer no estado actual. Exemplo:

```
✓ podes correr: /wire-saas-health (local), /wire-tenant-audit (sem cross-tenant)
✗ não corras:   /wire-incident-spread (precisa Fortigate)
```

## Cadência sugerida

- **Início de cada turno** → uma chamada antes de operar
- **Após VPN reconnect** → confirma endpoints internos
- **Antes de exercício IR** → toda a stack precisa de estar verde
- **Schedule diário 08h** → email para SecOps lead se DEGRADED+

## Variáveis respeitadas

Todas as do `~/.wire/secops.conf`:
- `VAULT_ADDR` · `VAULT_TOKEN`
- `WAZUH_HOST` · `WAZUH_API_PORT`
- `FORTIGATE_HOST`
- `ZABBIX_URL`
- `OLLAMA_HOST` · `OLLAMA_MODEL`

## Limites

- Read-only. Não tenta reparar nada.
- **Não substitui** os doctors individuais — só agrega o veredicto final. Para detalhe, corre o doctor específico.
- Não testa conectividade plugin-to-MCP-servers (se existirem MCPs adicionais).

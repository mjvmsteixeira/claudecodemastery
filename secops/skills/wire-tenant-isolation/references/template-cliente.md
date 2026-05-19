# Template — Relatório de Auditoria de Isolamento por Cliente

**Skill:** `wire-tenant-isolation` · **Versão:** v0.4.0 · **Última actualização:** 2026-05-19

> Template referenciado pela skill `wire-tenant-isolation`. Baseado em controlos internos
> Wire (CTRL-W-T-*) + ISO/IEC 27017:2015 §CLD.6.3 (Customer separation) + CSA CAIQ DSP/IAM.
> Marca `[CONFIRMAR]` campos Wire-specific.

## Estrutura do relatório

O relatório de auditoria de isolamento por cliente é emitido por `/wire-tenant-audit <municipio>`
e percorre **16 controlos canónicos CTRL-W-T-001..016**. Cada controlo gera uma row com:

- Descrição.
- Método de validação (técnico).
- Evidência recolhida.
- Score 1-5.
- Estado (PASS / WARN / FAIL / N/A).

## Cabeçalho do relatório

```markdown
# Auditoria de Isolamento — Município de [NOME]

**Tenant:** [NOME_MUNICIPIO]
**NIPC:** [NIPC]
**Auditor:** wire-tenant-01 + revisão humana [NOME]
**Data:** [TIMESTAMP_UTC]
**Produtos contratados:** [LISTA_WIRE_PRODUCTS]
**Vault path metadata:** secret/data/tenants/metadata/[NIPC]
**Versão template:** v0.4.0
```

## Os 16 controlos CTRL-W-T-*

### CTRL-W-T-001 — RLS Policy aplicada em todas as tabelas multi-tenant

**Descrição:** Toda a tabela com coluna `tenant_id` tem RLS policy activa que força filtro
`tenant_id = current_setting('app.current_tenant')`.

**Método validação:** Query SQL contra `pg_policies` cross-referenced com `information_schema.columns`.
Ver `queries-evidencia.md` §1.

**Evidência esperada:** zero tabelas com `tenant_id` sem policy.

**Scoring:**
- 5: zero gaps, policies versionadas em git.
- 4: zero gaps mas policies não versionadas.
- 3: 1-2 tabelas sem policy (low-risk tables).
- 2: 3+ tabelas sem policy.
- 1: tabelas de alto risco (com PII) sem policy.

---

### CTRL-W-T-002 — Roles aplicacionais sem BYPASSRLS

**Descrição:** Roles PostgreSQL usados por Rails (`wire_app_*`) não têm atributo `BYPASSRLS`.
Apenas role administrativo (raramente usado) pode ter.

**Método validação:** `SELECT rolname, rolbypassrls FROM pg_roles WHERE rolname LIKE 'wire_app_%';`

**Evidência esperada:** todas as rows com `rolbypassrls = false`.

**Scoring:**
- 5: zero roles aplicacionais com BYPASSRLS.
- 1: qualquer role aplicacional com BYPASSRLS = falha crítica.

---

### CTRL-W-T-003 — Tenant key per-NIPC isolada em Vault transit

**Descrição:** Existe `transit/keys/tenant-<NIPC>` único e usado exclusivamente para o tenant.

**Método validação:** `vault list transit/keys | grep -c "tenant-<NIPC>"` deve devolver `1`.

**Evidência esperada:** key existe, foi rodada nos últimos 90 dias, audit log sem acessos
não-autorizados.

**Scoring:**
- 5: key dedicada + rotation em < 90 dias + audit clean.
- 3: key dedicada mas rotation atrasada.
- 1: key partilhada com outro tenant ou inexistente.

---

### CTRL-W-T-004 — Policies Vault restringem acesso por tenant

**Descrição:** Policy HCL `wire-tenant-<NIPC>` permite acesso APENAS aos paths do próprio tenant.

**Método validação:** `vault read sys/policies/acl/wire-tenant-<NIPC>` — inspeccionar paths.

**Evidência esperada:** policy só inclui `secret/data/tenants/data/<NIPC>/*` e `transit/encrypt/tenant-<NIPC>`.

**Scoring:**
- 5: policy minimal, sem wildcards perigosos.
- 3: policy com wildcards mas dentro do namespace tenant.
- 1: policy permite acesso cross-tenant.

---

### CTRL-W-T-005 — Cache (Redis) com namespace por tenant

**Descrição:** Chaves Redis prefixadas com `<NIPC>:` (ou similar). Sem colisão entre tenants.

**Método validação:** Inspeccionar Rails cache configuration; sampling de keys via `redis-cli SCAN`.

**Evidência esperada:** padrão de naming consistente, sem chaves "globais" que cruzem tenants.

**Scoring:**
- 5: namespace strict + audit verificado.
- 3: namespace presente mas inconsistente.
- 1: chaves globais existentes.

---

### CTRL-W-T-006 — Storage de ficheiros isolado per-tenant

**Descrição:** Active Storage / S3 prefixos por tenant: `s3://wire-prod/<product>/<NIPC>/*`.

**Método validação:** Listar buckets/prefixos; validar Rails config `config.active_storage.service`.

**Evidência esperada:** zero ficheiros fora do prefixo correcto do tenant.

**Scoring:**
- 5: prefixos strict + access policy IAM restringe.
- 3: prefixos presentes mas IAM não restringe.
- 1: bucket partilhado sem isolamento.

---

### CTRL-W-T-007 — Background jobs com tenant_id obrigatório

**Descrição:** Jobs assíncronos (Sidekiq/equivalent) carregam `tenant_id` no payload e fazem
`Tenant.scope_to(payload.tenant_id)` antes de executar.

**Método validação:** Code review estático + sampling de jobs em runtime.

**Scoring:**
- 5: middleware central impõe; sem jobs em runtime sem tenant_id.
- 1: jobs detectados sem scoping.

---

### CTRL-W-T-008 — Audit log per-tenant accessible

**Descrição:** Município pode aceder a audit log das suas operações via produto wire* ou export.

**Método validação:** Verificar export de audit log para sample de operações.

**Scoring:**
- 5: export self-service disponível.
- 3: export mediante pedido (mas existe).
- 1: audit log não-exportável ao cliente.

---

### CTRL-W-T-009 — Backup per-tenant restorable independentemente

**Descrição:** Backup permite restore de um tenant sem afectar outros.

**Método validação:** Restore drill em ambiente de teste.

**Scoring:**
- 5: restore drill bem-sucedido em últimos 90d.
- 3: restore não testado mas tecnicamente possível.
- 1: backup monolítico sem restore selectivo.

---

### CTRL-W-T-010 — Network policy isolam tenant traffic

**Descrição:** Tráfego HTTPS por tenant chega via Fortigate WAF com routing que aplica
WAF rules tenant-aware.

**Método validação:** Fortigate config review.

**Scoring:**
- 5: WAF rules per-tenant + dynamic.
- 3: WAF global mas com tenant context em logs.
- 1: WAF sem tenant context.

---

### CTRL-W-T-011 — IdP / authentication scope por tenant

**Descrição:** Login validates tenant scope; user de Município A não pode autenticar como
Município B.

**Método validação:** Auth flow review; tentativa de login cross-tenant em staging.

**Scoring:**
- 5: scope enforced no IdP + Rails session check.
- 1: cross-tenant login possível.

---

### CTRL-W-T-012 — Tenant key rotation calendário formal

**Descrição:** Transit key rotation a cada 90 dias automatizado.

**Método validação:** `vault read transit/keys/tenant-<NIPC>` mostra `latest_version` e timestamps.

**Scoring:**
- 5: cron + audit confirma rotation.
- 1: key não rodada em > 180d.

---

### CTRL-W-T-013 — Audit Vault por tenant visível em Wazuh

**Descrição:** Operações Vault sobre paths do tenant aparecem em dashboard Wazuh filtrável.

**Método validação:** Wazuh query test.

**Scoring:**
- 5: dashboard tenant-specific disponível.
- 3: log filtrável manualmente.
- 1: sem visibilidade per-tenant.

---

### CTRL-W-T-014 — Offboarding plan documentado

**Descrição:** Procedimento para cessação contrato: data export, retention, crypto-shredding.

**Método validação:** Documento revisto.

**Scoring:**
- 5: procedimento documentado + testado em sample.
- 3: documentado não-testado.
- 1: ad hoc.

---

### CTRL-W-T-015 — DPA assinado e actualizado

**Descrição:** Data Processing Agreement entre Wire e Município assinado.

**Método validação:** Verificar em `secret/data/compliance/dpa/<NIPC>/`.

**Scoring:**
- 5: DPA assinado, válido, revisão últimos 24m.
- 1: ausente ou expirado.

---

### CTRL-W-T-016 — Cross-tenant queries protegidas com audit obrigatório

**Descrição:** Quando IR ou audit precisam de cross-tenant query, há audit-trail + aprovação N2.

**Método validação:** Audit log `~/.wire/log/approvals.log` + Wazuh.

**Scoring:**
- 5: 100% cross-tenant queries têm audit + approval.
- 1: cross-tenant queries sem trail.

---

## Sumário do relatório

```markdown
## Sumário — Município de [NOME]

| CTRL | Designação | Score | Estado | Notas |
|------|------------|-------|--------|-------|
| 001  | RLS policies | 5 | PASS | — |
| 002  | Sem BYPASSRLS | 5 | PASS | — |
| 003  | Tenant key transit | 4 | PASS | Rotation atrasada 12d |
| 004  | Vault policy | 5 | PASS | — |
| 005  | Cache namespace | 5 | PASS | — |
| 006  | Storage isolado | 5 | PASS | — |
| 007  | Jobs tenant_id | 4 | PASS | 1 job legacy a refactorizar |
| 008  | Audit log export | 3 | WARN | Não self-service ainda |
| 009  | Backup restorable | 5 | PASS | Drill 2026-04 |
| 010  | Network policy | 3 | WARN | WAF não per-tenant |
| 011  | IdP scope | 5 | PASS | — |
| 012  | Key rotation | 4 | PASS | — |
| 013  | Audit Vault visível | 5 | PASS | — |
| 014  | Offboarding plan | 4 | PASS | Documentado, não testado |
| 015  | DPA assinado | 5 | PASS | Renovado 2026-02 |
| 016  | Cross-tenant audit | 5 | PASS | — |

**Score global:** 73/80 (91%) — POSTURA SÓLIDA
**Acções recomendadas:**
1. CTRL-W-T-008 — implementar self-service export audit log [Q3 2026]
2. CTRL-W-T-010 — WAF rules per-tenant [Q4 2026]
3. CTRL-W-T-014 — testar offboarding em sandbox [Q3 2026]
```

---

## Fontes

- **CTRL-W-T-*** — catálogo interno Wire (WIRE.MTZ.SEC.006).
- **ISO/IEC 27017:2015** §CLD.6.3 — Customer separation in virtualized environments.
- **ISO/IEC 27018:2019** — PII processor responsibilities.
- **CSA CCM v4** — DSP, IAM, IVS domínios.
- **PostgreSQL 16 documentation** — Row Security Policies.

## Como usar este template em sessão Claude Code

A skill `wire-tenant-isolation` invoca este template em `/wire-tenant-audit <municipio>` para gerar relatório consolidado. Esperar como output: tabela 16-row preenchida + sumário + acções priorizadas. O cliente pode receber sumário sanitizado (sem evidência técnica detalhada) sob NDA; a versão completa fica em `secret/data/compliance/audits/<NIPC>/<date>.md`.

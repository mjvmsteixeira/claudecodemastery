# Queries SQL — Evidência de Isolamento Multi-Tenant

**Skill:** `wire-tenant-isolation` · **Versão:** v0.4.0 · **Última actualização:** 2026-05-19

> Template referenciado pela skill `wire-tenant-isolation`. Queries SQL canónicas para validar
> RLS, BYPASSRLS, storage isolation, e cache namespacing. Compatível com PostgreSQL 13+.
> Marca `[CONFIRMAR]` campos Wire-specific. **Executar com `wire-tenant` AppRole** (mínimos
> privilégios necessários).

## §1 — Validar RLS policies (CTRL-W-T-001)

### 1.1 — Listar tabelas com coluna `tenant_id` mas sem RLS habilitado

```sql
SELECT
  c.table_schema,
  c.table_name
FROM information_schema.columns c
LEFT JOIN pg_tables t
  ON t.schemaname = c.table_schema AND t.tablename = c.table_name
LEFT JOIN pg_class pc
  ON pc.relname = c.table_name
  AND pc.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = c.table_schema)
WHERE c.column_name = 'tenant_id'
  AND c.table_schema NOT IN ('information_schema', 'pg_catalog')
  AND (pc.relrowsecurity IS NULL OR pc.relrowsecurity = false);
```

**Expected:** zero rows. Qualquer row = gap CTRL-W-T-001.

### 1.2 — Listar tabelas com RLS habilitado mas sem policies

```sql
SELECT
  n.nspname AS schema,
  c.relname AS table_name
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relrowsecurity = true
  AND c.relkind = 'r'
  AND n.nspname NOT IN ('information_schema', 'pg_catalog')
  AND NOT EXISTS (
    SELECT 1 FROM pg_policies p
    WHERE p.schemaname = n.nspname AND p.tablename = c.relname
  );
```

**Expected:** zero rows.

### 1.3 — Validar policy aplicada (sample tabela)

```sql
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE tablename = 'wirepaper_documents';  -- ou tabela a auditar
```

**Expected:** policy com `qual` da forma `(tenant_id = current_setting('app.current_tenant'))`
ou equivalente.

### 1.4 — Test runtime: RLS bloqueia cross-tenant query

```sql
BEGIN;
SET LOCAL app.current_tenant = '501234567';  -- NIPC município A
SELECT count(*) FROM wirepaper_documents WHERE tenant_id != '501234567';
-- Expected: 0  (RLS filtra antes do WHERE)
ROLLBACK;
```

**Expected:** count = 0. Qualquer valor != 0 = **falha crítica CTRL-W-T-001**.

### 1.5 — Test runtime: tentativa de SET tenant inválido

```sql
BEGIN;
SET LOCAL app.current_tenant = '';  -- empty
SELECT count(*) FROM wirepaper_documents;
-- Expected: 0 OU error consoante policy
SET LOCAL app.current_tenant = NULL;
SELECT count(*) FROM wirepaper_documents;
-- Expected: 0 OU error
ROLLBACK;
```

Verificar que policies não permitem fallback acidental (NULL → match-all).

## §2 — Validar ausência de BYPASSRLS (CTRL-W-T-002)

### 2.1 — Listar roles com BYPASSRLS

```sql
SELECT
  rolname,
  rolbypassrls,
  rolsuper,
  rolinherit
FROM pg_roles
WHERE rolbypassrls = true OR rolsuper = true
ORDER BY rolname;
```

**Expected:**
- `postgres` (superuser) — aceitável, raramente usado em runtime.
- Qualquer `wire_app_*` com BYPASSRLS = **falha crítica**.

### 2.2 — Validar que role corrente (em runtime) não tem BYPASSRLS

```sql
SELECT current_user, current_setting('row_security');
```

**Expected:** `current_user` é `wire_app_<product>`, `row_security` é `on`.

### 2.3 — Auditar grants de BYPASSRLS recentes

Cross-check com Vault audit log (rule Wazuh 100020):

```sql
-- Inspeccionar privileges granted via DDL
SELECT
  obj_description(c.oid),
  c.relname,
  c.relacl
FROM pg_class c
WHERE c.relkind = 'r'
  AND c.relacl IS NOT NULL;
```

## §3 — Validar storage e cache isolation (CTRL-W-T-005, T-006)

### 3.1 — Validar prefixos Active Storage

```sql
-- Active Storage attachments — verify name pattern
SELECT
  blob_id,
  name,
  record_type,
  record_id,
  -- tenant inferred via record join
  (SELECT tenant_id FROM wire_records WHERE id = record_id) AS inferred_tenant
FROM active_storage_attachments
LIMIT 100;
```

Validar que blob keys em S3 (consultando `active_storage_blobs.key`) seguem padrão
`<NIPC>/<random-key>` `[CONFIRMAR — padrão exacto Wire]`.

### 3.2 — Detectar attachments órfãos (sem tenant scoping claro)

```sql
SELECT count(*)
FROM active_storage_attachments asa
LEFT JOIN active_storage_blobs asb ON asb.id = asa.blob_id
WHERE asb.key NOT LIKE '5%/%';  -- assumindo todos NIPCs PT começam com 5
```

**Expected:** zero (todos os blobs têm prefixo de NIPC).

## §4 — Audit de queries sem tenant context

### 4.1 — Capturar queries sem SET app.current_tenant

Habilitar log temporariamente (apenas em staging, nunca em prod direto):

```sql
ALTER DATABASE wireprod SET log_statement = 'all';
-- recolher 1h de logs
-- inspeccionar:
```

```bash
grep -E "SELECT.*FROM (wirepaper|wiredesk|wirestudio)" /var/log/postgresql/*.log \
  | grep -v "SET app.current_tenant"
```

**Expected:** apenas connection-setup queries (psql metadata, schema introspection).
Qualquer SELECT em tabela tenant-aware sem `SET app.current_tenant` no mesmo session = bug.

### 4.2 — Detectar cross-tenant joins (auditoria estática)

```sql
-- Inspeccionar views materializadas e views regulares por joins cross-tenant
SELECT
  schemaname,
  viewname,
  definition
FROM pg_views
WHERE schemaname NOT IN ('information_schema', 'pg_catalog')
  AND definition ILIKE '%tenant_id%'
ORDER BY schemaname, viewname;
```

Inspeccionar manualmente views que mencionem tenant_id em condições não-obviamente filtradas.

## §5 — Vault audit cross-check

### 5.1 — Confirmar policy aplicada para tenant

Via Vault CLI (não SQL):

```bash
vault read sys/policies/acl/wire-tenant-501234567
```

**Expected output:** policy HCL com paths restritos a `secret/data/tenants/data/501234567/*`
e `transit/encrypt/tenant-501234567`.

### 5.2 — Listar últimas operações no tenant key

Via Wazuh query (proxy para Vault audit log):

```
index:wazuh-alerts AND rule.id:[100200 TO 100299]
  AND data.request.path:"transit/encrypt/tenant-501234567"
  AND @timestamp:[now-30d TO now]
```

**Expected:** acessos apenas via `wire-tenant` AppRole; sem acessos de outros AppRoles.

## §6 — Sentinel queries (canary)

Queries que devem **sempre** devolver os mesmos resultados se isolamento estiver intacto:

### 6.1 — Sentinel: count total acessível

```sql
BEGIN;
SET LOCAL app.current_tenant = '501234567';
SELECT
  'wirepaper_documents' AS tbl,
  count(*) AS visible_rows
FROM wirepaper_documents
UNION ALL
SELECT 'wiredesk_tickets', count(*) FROM wiredesk_tickets
UNION ALL
SELECT 'wireforms_submissions', count(*) FROM wireforms_submissions;
ROLLBACK;
```

Resultado snapshotted a cada audit; deviation = investigation flag.

### 6.2 — Sentinel: distinct tenants visíveis (deve ser 1)

```sql
BEGIN;
SET LOCAL app.current_tenant = '501234567';
SELECT count(DISTINCT tenant_id) FROM wirepaper_documents;
ROLLBACK;
```

**Expected:** exactly 1 (ou 0 se tabela vazia).

## §7 — Audit log SQL execução

Toda query executada em sessão de audit é logada em `${WIRE_FORENSICS_DIR}/<incident-id>/queries.sql`
com timestamp UTC + actor + output sanitizado. As próprias queries de validação NÃO devem ser
executáveis sem `WIRE_APPROVE=N1` (operação read-only é N1, mas continua audit-tracked).

---

## Fontes

- **PostgreSQL 16 documentation** — Row Security Policies, pg_policies, pg_roles.
- **OWASP Top 10 2021** A01 — Broken Access Control.
- **CSA CCM v4** — DSP-04 (data classification + access).
- **HashiCorp Vault** Audit Device + Policy reference.
- WIRE.PRC.AUD.004, WIRE.MTZ.SEC.006.

## Como usar este template em sessão Claude Code

A skill `wire-tenant-isolation` invoca este template em `/wire-tenant-audit <municipio>` para executar bateria de queries e gerar evidência. Esperar como output: tabela CTRL-W-T-* com PASS/WARN/FAIL por query + queries originais arquivadas + sentinel baselines actualizados. Em ambiente de produção a sessão exige `WIRE_APPROVE=N1` mesmo para queries read-only (audit por defeito).

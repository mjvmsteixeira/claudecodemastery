# Wazuh Rules — Canónicas Wire SaaS

**Skill:** `prumo-saas-monitoring` · **Versão:** v0.4.0 · **Última actualização:** 2026-05-19

> Template referenciado pela skill `prumo-saas-monitoring`. Baseado em Wazuh 4.7+ rule syntax,
> MITRE ATT&CK v15, OWASP categorias relevantes para Rails apps. Marca `[CONFIRMAR]` onde
> a postura Wire-specific ainda não é definitiva.

## Convenção de rule_id ranges (Wire-custom)

Wazuh reserva `< 100000` para rules de base e packs oficiais. Wire usa **100000-199999** para
rules custom organizadas por domínio:

| Range | Domínio | Notas |
|-------|---------|-------|
| 100010-100019 | PostgreSQL / DB auth + anomalies | Brute force, RLS bypass, suspicious queries |
| 100020-100029 | RLS / Tenant isolation specific | Tenant_id mismatches, BYPASSRLS attempts |
| 100030-100049 | Rails apps (wire*) — application-level | lograge anomalies, auth failures, IDOR, suspicious params |
| 100050-100059 | Reserved — `[CONFIRMAR]` futuro |
| 100100-100149 | Capistrano / Deploy events | cap deploy success/fail, rollback, unauthorized deploys |
| 100150-100199 | Filesystem / unauthorized changes | FIM anomalies, binary tampering |
| 100200-100299 | Vault audit events | auth/approle/login, secret read, transit ops |
| 100300-100349 | SSH CA events | cert sign, anomalous cert use |
| 100350-100399 | Fortigate forwarded events | (decoded em Wazuh, originados em Fortigate) |
| 100400-100499 | Zabbix integration cross-checks | Active monitor vs Wazuh discrepancy |
| 100500-100599 | OTel traces — anomaly detection | Latency spikes, error rate anomalies |
| 100600-100999 | Reserved — produtos wire* specific se necessário |

## Block 1 — PostgreSQL Auth & Anomalies (100010-100019)

```xml
<group name="postgresql,wire-multi-tenant,">

  <rule id="100010" level="5">
    <if_group>postgresql</if_group>
    <field name="message">authentication failed</field>
    <description>PostgreSQL auth failure (low frequency)</description>
    <group>authentication_failed,</group>
  </rule>

  <rule id="100012" level="10" frequency="5" timeframe="60">
    <if_matched_sid>100010</if_matched_sid>
    <same_field>dst_user</same_field>
    <description>PostgreSQL brute force — 5+ auth failures em 60s para mesmo user em $(dst_user)</description>
    <group>brute_force,multi_tenant,</group>
    <mitre>
      <id>T1110</id>
      <id>T1110.001</id>
    </mitre>
  </rule>

  <rule id="100013" level="12" frequency="3" timeframe="60">
    <if_matched_sid>100010</if_matched_sid>
    <same_field>tenant_id</same_field>
    <description>PostgreSQL brute force CROSS-TENANT — 3+ failures em 60s no mesmo tenant $(tenant_id) de utilizadores distintos</description>
    <group>brute_force,multi_tenant,cross_tenant_signal,</group>
    <mitre>
      <id>T1110</id>
      <id>T1078</id>
    </mitre>
  </rule>

  <rule id="100015" level="14">
    <if_group>postgresql</if_group>
    <field name="message">permission denied for table</field>
    <field name="role" type="pcre2">^wire_app_</field>
    <description>Role aplicacional wire_app_* tentou aceder a tabela sem permissão — possível tentativa de privilege escalation</description>
    <group>privilege_escalation,</group>
    <mitre>
      <id>T1068</id>
    </mitre>
  </rule>

  <rule id="100018" level="12">
    <if_group>postgresql</if_group>
    <field name="message" type="pcre2">(?i)pg_(read_server_files|write_server_files|execute_server_program)</field>
    <description>Tentativa de uso de função sensível PostgreSQL — possível exploração de dependência ou misuse</description>
    <group>suspicious_query,</group>
  </rule>

</group>
```

**Decoder snippet (excerto):**

```xml
<decoder name="postgresql-wire">
  <prematch>^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d+ UTC \[\d+\] </prematch>
</decoder>

<decoder name="postgresql-wire-tenant">
  <parent>postgresql-wire</parent>
  <regex offset="after_prematch">tenant_id=(\S+) user=(\S+) db=(\S+)</regex>
  <order>tenant_id,dst_user,db_name</order>
</decoder>
```

**Group-by hint:** Para correlation operacional, agregar por `tenant_id` quando presente, depois por `dst_user`. Wire-monitor-01 usa este pattern em `/prumo-saas-health`.

## Block 2 — RLS / Tenant Isolation (100020-100029)

```xml
<group name="prumo-tenant-isolation,multi_tenant,">

  <rule id="100020" level="14">
    <if_group>postgresql</if_group>
    <field name="message">role .* set with BYPASSRLS</field>
    <description>Role PostgreSQL com BYPASSRLS detectada — viola controlo CTRL-W-T-003</description>
    <group>privilege_escalation,critical_isolation,</group>
    <mitre>
      <id>T1078.003</id>
    </mitre>
  </rule>

  <rule id="100022" level="13">
    <if_group>postgresql</if_group>
    <field name="message" type="pcre2">SET app\.current_tenant.*=.*NULL</field>
    <description>Tentativa de unset de app.current_tenant em runtime — possível cross-tenant query attempt</description>
    <group>tenant_bypass_attempt,</group>
  </rule>

  <rule id="100024" level="14">
    <if_group>rails,wire-app</if_group>
    <field name="alert">tenant_mismatch</field>
    <description>Application-level tenant_mismatch alert em $(product) — current_user.tenant_id ≠ record.tenant_id</description>
    <group>cross_tenant_signal,critical_isolation,</group>
  </rule>

  <rule id="100026" level="10">
    <if_group>postgresql</if_group>
    <field name="message" type="pcre2">SELECT.*FROM.*WHERE.*tenant_id\s*!=</field>
    <description>Query com filtro `tenant_id !=` detectada — pode ser legítima (audit) ou anómala (data leak attempt)</description>
    <group>suspicious_query,manual_review_required,</group>
  </rule>

</group>
```

## Block 3 — Rails app (wire*) — Lograge (100030-100049)

```xml
<group name="rails,wire-app,">

  <rule id="100030" level="3">
    <decoded_as>lograge</decoded_as>
    <field name="status">200</field>
    <description>Rails request OK</description>
    <options>no_log</options>
  </rule>

  <rule id="100032" level="6" frequency="20" timeframe="60">
    <decoded_as>lograge</decoded_as>
    <field name="status">401</field>
    <same_source_ip />
    <description>Rails — 20+ 401 em 60s do mesmo IP — possível credential stuffing</description>
    <group>brute_force,</group>
    <mitre><id>T1110.003</id></mitre>
  </rule>

  <rule id="100034" level="10" frequency="10" timeframe="60">
    <decoded_as>lograge</decoded_as>
    <field name="status">403</field>
    <same_user />
    <description>Rails — 10+ 403 em 60s para o mesmo user — possible IDOR scanning</description>
    <group>idor_attempt,</group>
    <mitre><id>T1190</id></mitre>
  </rule>

  <rule id="100036" level="12">
    <decoded_as>lograge</decoded_as>
    <field name="params" type="pcre2">(?i)(?:UNION\s+SELECT|<script|\.\./\.\./|/etc/passwd)</field>
    <description>Payload suspeito em params Rails — SQL injection / XSS / path traversal attempt</description>
    <group>injection_attempt,</group>
    <mitre><id>T1190</id></mitre>
  </rule>

  <rule id="100038" level="14">
    <decoded_as>lograge</decoded_as>
    <field name="status">500</field>
    <field name="exception" type="pcre2">ActiveRecord::(StatementInvalid|ConnectionNotEstablished)</field>
    <frequency>10</frequency>
    <timeframe>300</timeframe>
    <description>10+ erros DB em 5min em $(product) — possível DB outage ou attack-induced exhaustion</description>
    <group>db_outage_signal,</group>
  </rule>

  <rule id="100040" level="8">
    <decoded_as>lograge</decoded_as>
    <field name="audit_action">privileged_action</field>
    <description>Privileged action executada em Rails app $(product) por $(user) — audit log</description>
    <group>audit_privileged,</group>
  </rule>

</group>
```

## Block 4 — Capistrano / Deploy (100100-100149)

```xml
<group name="capistrano,deploy,">

  <rule id="100100" level="5">
    <decoded_as>capistrano</decoded_as>
    <field name="action">deploy:started</field>
    <description>Capistrano deploy started — $(product) revision $(rev) by $(user)</description>
    <group>deploy_event,</group>
  </rule>

  <rule id="100102" level="3">
    <decoded_as>capistrano</decoded_as>
    <field name="action">deploy:finished</field>
    <field name="status">success</field>
    <description>Capistrano deploy success — $(product) revision $(rev)</description>
    <options>no_log</options>
  </rule>

  <rule id="100104" level="10">
    <decoded_as>capistrano</decoded_as>
    <field name="action">deploy:finished</field>
    <field name="status">failed</field>
    <description>Capistrano deploy FAILED — $(product) revision $(rev) — review immediately</description>
    <group>deploy_failure,</group>
  </rule>

  <rule id="100106" level="12">
    <decoded_as>capistrano</decoded_as>
    <field name="action">deploy:rollback</field>
    <description>Capistrano ROLLBACK executado em $(product) por $(user) — incidente provável</description>
    <group>deploy_rollback,</group>
  </rule>

  <rule id="100110" level="14">
    <if_group>syscheck</if_group>
    <field name="path" type="pcre2">^/var/www/wire[a-z]+/current</field>
    <description>Filesystem change em deploy path fora de janela Capistrano conhecida — possível unauthorized change</description>
    <group>unauthorized_change,</group>
    <mitre><id>T1565</id></mitre>
  </rule>

</group>
```

## Block 5 — Vault Audit Events (100200-100299)

```xml
<group name="vault,audit,">

  <rule id="100200" level="3">
    <decoded_as>vault-audit</decoded_as>
    <field name="type">request</field>
    <field name="auth.path" type="pcre2">^auth/approle/login</field>
    <description>Vault AppRole login — $(auth.metadata.role_name)</description>
    <options>no_log</options>
  </rule>

  <rule id="100202" level="10" frequency="3" timeframe="300">
    <decoded_as>vault-audit</decoded_as>
    <field name="type">request</field>
    <field name="response.status">forbidden</field>
    <same_field>auth.metadata.role_name</same_field>
    <description>3+ Vault permission denied em 5min para role $(auth.metadata.role_name) — possível policy violation attempt</description>
    <group>policy_violation,</group>
    <mitre><id>T1078</id></mitre>
  </rule>

  <rule id="100204" level="12">
    <decoded_as>vault-audit</decoded_as>
    <field name="request.path" type="pcre2">^sys/auth/.*delete$</field>
    <description>Vault auth backend deletion — possível tentativa de quebrar autenticação</description>
    <group>privileged_op,critical,</group>
    <mitre><id>T1098</id></mitre>
  </rule>

  <rule id="100206" level="8">
    <decoded_as>vault-audit</decoded_as>
    <field name="request.path" type="pcre2">^transit/(encrypt|decrypt)/forensics$</field>
    <description>Vault transit forensics op por $(auth.display_name) — IR-related</description>
    <group>ir_op,</group>
  </rule>

  <rule id="100208" level="14">
    <decoded_as>vault-audit</decoded_as>
    <field name="request.path" type="pcre2">^sys/policies/acl/.*$</field>
    <field name="request.operation">update</field>
    <description>Vault policy update detectada — alteração de ACL em $(request.path) por $(auth.display_name)</description>
    <group>privileged_op,critical,</group>
  </rule>

  <rule id="100210" level="13">
    <decoded_as>vault-audit</decoded_as>
    <field name="request.path" type="pcre2">^auth/approle/role/.*/secret-id$</field>
    <field name="request.operation">update</field>
    <description>AppRole secret-id rotation — $(request.path) — verificar se planeada</description>
    <group>approle_rotation,</group>
  </rule>

</group>
```

## Manutenção das rules

- **Naming convention:** rule descriptions em PT-PT ou EN consoante padronizar `[CONFIRMAR]`. Recomendação: EN para portabilidade com community rules.
- **Versionamento:** rules.xml versionado em git, code review obrigatório para alterações.
- **Test harness:** `wazuh-logtest` valida rules localmente antes de deploy.
- **False positive review:** rules nível ≥ 10 reviewed mensalmente em SecOps daily; nível ≥ 12 reviewed semanalmente.
- **Tuning ratio target:** false positive rate < 5% em rules level ≥ 12 (page-grade alerts).

---

## Fontes

- **Wazuh 4.7+** Ruleset Reference (`https://documentation.wazuh.com/`).
- **MITRE ATT&CK v15** — Enterprise Matrix.
- **OWASP Top 10 2021** — A01 Broken Access Control, A03 Injection, A07 Auth Failures.
- **PostgreSQL 16 documentation** — RLS, BYPASSRLS, server side functions.
- **Capistrano 3 documentation** — deploy lifecycle events.
- **HashiCorp Vault** Audit Device documentation.

## Como usar este template em sessão Claude Code

A skill `prumo-saas-monitoring` invoca este template quando se está a auditar a postura SIEM Wire, ao criar nova rule custom, ao investigar falsos positivos, ou ao mapear cobertura MITRE ATT&CK. Esperar como output: rule_id range adequado + XML rule pronta para revisar + decoder se necessário. O user revê em sessão e copia para `rules/wire-custom-rules.xml` do Wazuh manager — a sessão nunca aplica directamente em produção.

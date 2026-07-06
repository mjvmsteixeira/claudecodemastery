# Zabbix Templates Canónicos — Wire SaaS

**Skill:** `prumo-saas-monitoring` · **Versão:** v0.4.0 · **Última actualização:** 2026-05-19

> Template referenciado pela skill `prumo-saas-monitoring`. Baseado em Zabbix 6.4+ LTS template
> structure. Marca `[CONFIRMAR]` campos Wire-specific.

A Wire mantém **três templates canónicos próprios**, derivados dos oficiais Zabbix mas extendidos
para o contexto SaaS multi-tenant Rails. Hosts que não derivem destes templates aparecem em
`/prumo-saas-health` como "monitorização não-conforme".

## Template Wire-Rails-Puma

Aplicado a todos os hosts com serviço Puma (10 produtos wire*).

**Herda de:** `Template OS Linux by Zabbix agent` (oficial Zabbix).

### Items principais

| Item key | Tipo | Frequência | Descrição |
|----------|------|------------|-----------|
| `wire.puma.workers.busy[{$PRODUCT}]` | Zabbix trap / agent active | 30s | Nº workers Puma em uso |
| `wire.puma.workers.total[{$PRODUCT}]` | Zabbix agent active | 60s | Total workers configurados |
| `wire.puma.workers.utilization[{$PRODUCT}]` | Calculated | 30s | `last(busy) / last(total) * 100` |
| `wire.puma.backlog[{$PRODUCT}]` | Zabbix agent active | 30s | Backlog connections aguardando worker |
| `wire.puma.threads.busy[{$PRODUCT}]` | Zabbix agent active | 30s | Threads ocupadas |
| `wire.rails.requests.rate[{$PRODUCT}]` | Calculated | 60s | Requests/sec rolling 1min |
| `wire.rails.requests.5xx.rate[{$PRODUCT}]` | Trapper (from lograge) | 60s | Error rate 5xx |
| `wire.rails.requests.p95_ms[{$PRODUCT}]` | Trapper | 60s | P95 latência |
| `wire.rails.requests.p99_ms[{$PRODUCT}]` | Trapper | 60s | P99 latência |
| `wire.rails.db.pool.busy[{$PRODUCT}]` | Zabbix agent active | 60s | Connections pool DB activas |
| `wire.rails.cache.hit_ratio[{$PRODUCT}]` | Trapper | 300s | Cache hit ratio (Redis/Memcached) |
| `wire.rails.queue.size[{$PRODUCT}]` | Trapper | 60s | Background jobs queue size |
| `wire.rails.queue.oldest_age_s[{$PRODUCT}]` | Trapper | 60s | Job mais antigo em queue (s) |

### Triggers principais

| Trigger | Expressão | Severidade |
|---------|-----------|------------|
| Puma utilization saturated | `last(/{HOST}/wire.puma.workers.utilization) > 90` for 2 min | High |
| Puma utilization critical | `last(/{HOST}/wire.puma.workers.utilization) > 98` for 1 min | Disaster |
| Puma backlog growing | `last(/{HOST}/wire.puma.backlog) > 50` | Warning |
| Rails 5xx rate elevated | `last(/{HOST}/wire.rails.requests.5xx.rate) > 5` for 5 min | High |
| Rails P95 latency anomaly | `last(/{HOST}/wire.rails.requests.p95_ms) > 2000` for 5 min | High |
| Rails P99 latency anomaly | `last(/{HOST}/wire.rails.requests.p99_ms) > 5000` for 5 min | Average |
| DB pool exhausted | `last(/{HOST}/wire.rails.db.pool.busy) / last(/{HOST}/wire.rails.db.pool.size) > 0.95` for 2 min | High |
| Cache hit ratio dropped | `last(/{HOST}/wire.rails.cache.hit_ratio) < 80` for 10 min | Warning |
| Job queue not draining | `last(/{HOST}/wire.rails.queue.oldest_age_s) > 600` | Warning |
| Service down (Puma) | `last(/{HOST}/wire.puma.workers.total) = 0 or nodata(/{HOST}/wire.puma.workers.total, 3m) = 1` | Disaster |

### Macros (template-level)

```
{$PRODUCT}                 — wire-{paper|desk|studio|cityapp|recruit|docs|meet|forms|voice|connect}
{$PUMA_WORKERS_TARGET}     — número esperado de workers (default 4) [CONFIRMAR por produto]
{$PUMA_BACKLOG_THRESHOLD}  — 50
{$RAILS_P95_MS_THRESHOLD}  — 2000
{$RAILS_P99_MS_THRESHOLD}  — 5000
{$RAILS_5XX_RATE_PCT}      — 5
```

### LLD discovery

`wire.tenant.discovery[{$PRODUCT}]` — descobre tenants activos no produto a cada 1h. Cria items per-tenant:

- `wire.tenant.requests.rate[{$PRODUCT},{#TENANT_ID}]`
- `wire.tenant.requests.5xx.rate[{$PRODUCT},{#TENANT_ID}]`
- `wire.tenant.requests.p95_ms[{$PRODUCT},{#TENANT_ID}]`

Permite triggers per-tenant: degradação isolada num município é detectada cedo.

## Template Wire-OS-Linux-Hardening

Aplicado a todos os hosts Wire (Rails servers, DB, support).

**Herda de:** `Template OS Linux by Zabbix agent`.

### Items adicionais

| Item key | Tipo | Frequência | Descrição |
|----------|------|------------|-----------|
| `wire.os.clock.drift_ms` | Zabbix agent | 60s | NTP/Chrony drift vs reference |
| `wire.os.audit.events.rate` | Zabbix agent | 60s | Linux auditd events/sec |
| `wire.os.failed_logins.rate` | Zabbix agent | 60s | failed logins/sec |
| `wire.os.sshd.config.hash` | Zabbix agent | 1h | Hash de sshd_config — detecta alteração |
| `wire.os.systemd.failed_units` | Zabbix agent | 60s | Count de units em estado `failed` |
| `wire.os.firewall.rules.count` | Zabbix agent | 5min | iptables/nftables rules count |
| `wire.os.firewall.rules.hash` | Zabbix agent | 5min | Hash do ruleset — detecta alteração não-prevista |
| `wire.os.tls.cert.expiry_days[{$SERVICE}]` | Zabbix agent | 1h | Dias até expiry de cert TLS |
| `wire.os.disk.usage.root_pct` | Zabbix agent | 60s | % uso disco root |
| `wire.os.disk.usage.var_pct` | Zabbix agent | 60s | % uso /var |
| `wire.os.kernel.taint` | Zabbix agent | 5min | Kernel taint flags |

### Triggers principais

| Trigger | Expressão | Severidade |
|---------|-----------|------------|
| Clock drift critical | `abs(last(/{HOST}/wire.os.clock.drift_ms)) > 100` | High |
| Clock drift warning | `abs(last(/{HOST}/wire.os.clock.drift_ms)) > 30` | Warning |
| SSH config changed | `change(/{HOST}/wire.os.sshd.config.hash) <> 0` | High |
| Firewall rules changed | `change(/{HOST}/wire.os.firewall.rules.hash) <> 0` | High |
| Systemd units failed | `last(/{HOST}/wire.os.systemd.failed_units) > 0` | Warning |
| TLS cert expiry imminent | `last(/{HOST}/wire.os.tls.cert.expiry_days) < 14` | High |
| TLS cert expired | `last(/{HOST}/wire.os.tls.cert.expiry_days) < 0` | Disaster |
| Disk usage root critical | `last(/{HOST}/wire.os.disk.usage.root_pct) > 90` | High |

### Macros

```
{$NTP_DRIFT_WARN_MS}   — 30
{$NTP_DRIFT_HIGH_MS}   — 100
{$TLS_EXPIRY_WARN_D}   — 14
{$DISK_USAGE_WARN_PCT} — 80
{$DISK_USAGE_HIGH_PCT} — 90
```

### LLD discovery

`wire.tls.cert.discovery` — descobre certificados a monitorar via inspecção de Apache/nginx config + systemd units.

`wire.systemd.unit.discovery` — descobre units enabled e monitora estado.

## Template Wire-DB-PostgreSQL

Aplicado a hosts PostgreSQL Wire (DB plataforma + DB de tenant onde aplicável).

**Herda de:** `Template DB PostgreSQL` (oficial Zabbix) + `Wire-OS-Linux-Hardening`.

### Items adicionais (multi-tenant specific)

| Item key | Tipo | Frequência | Descrição |
|----------|------|------------|-----------|
| `wire.pg.rls.policies.count` | Zabbix agent | 5min | Total RLS policies activas (deve match expected) |
| `wire.pg.rls.bypass.attempts.rate` | Zabbix agent | 60s | Tentativas log de SET BYPASSRLS |
| `wire.pg.tenants.count` | Zabbix agent | 5min | Distinct tenant_ids em tabelas principais |
| `wire.pg.tenant.rows[{#TENANT_ID}]` | LLD-derived | 5min | Row count per tenant (sample tabela) |
| `wire.pg.backup.last_success_age_s` | Zabbix agent | 5min | Idade do último backup com sucesso |
| `wire.pg.wal.archive.lag_bytes` | Zabbix agent | 60s | Lag de archive WAL |
| `wire.pg.replication.lag_bytes` | Zabbix agent | 60s | Lag streaming replication |
| `wire.pg.replication.lag_seconds` | Zabbix agent | 60s | Lag em segundos |
| `wire.pg.tde.enabled` | Zabbix agent | 1h | 1 se TDE active, 0 caso contrário |
| `wire.pg.ssl.enabled` | Zabbix agent | 1h | 1 se ssl=on |
| `wire.pg.connections.byrole[{#ROLE}]` | LLD | 60s | Connections per role aplicacional |

### Triggers principais

| Trigger | Expressão | Severidade |
|---------|-----------|------------|
| RLS policies count anomaly | `last(/{HOST}/wire.pg.rls.policies.count) <> {$EXPECTED_RLS_COUNT}` | Disaster |
| RLS bypass attempt detected | `last(/{HOST}/wire.pg.rls.bypass.attempts.rate) > 0` | Disaster |
| Backup stale | `last(/{HOST}/wire.pg.backup.last_success_age_s) > 90000` (>25h) | High |
| Replication lag high | `last(/{HOST}/wire.pg.replication.lag_seconds) > 60` for 5 min | High |
| Replication broken | `nodata(/{HOST}/wire.pg.replication.lag_bytes, 5m) = 1` | Disaster |
| TDE disabled | `last(/{HOST}/wire.pg.tde.enabled) = 0` | Disaster |
| SSL disabled | `last(/{HOST}/wire.pg.ssl.enabled) = 0` | Disaster |

### Macros

```
{$EXPECTED_RLS_COUNT}     — 47 [CONFIRMAR — número exacto de policies em prod]
{$BACKUP_STALE_THRESHOLD_S} — 90000  (25h margem após daily backup)
{$REPL_LAG_WARN_S}         — 30
{$REPL_LAG_HIGH_S}         — 60
```

## Convenções operacionais

### Naming convention

- Host names: `wire-<product|role>-<seq>.<region>.wire.internal`
  Exemplo: `wire-paper-01.eu-west-1.wire.internal`, `wire-db-primary-01.eu-west-1.wire.internal`.
- Host groups: `Wire/Production`, `Wire/Staging`, `Wire/Product/wirePAPER`, `Wire/Role/DB`.
- Templates: prefixo `Wire-` para custom; templates oficiais Zabbix mantêm o nome canónico.

### Inventory population

Auto-inventory via agentd com fields:
- `name`, `os_full`, `hardware_full`, `software_app_a` (Rails version), `software_app_b` (Ruby version).
- `tag` Zabbix tags: `product:wireDESK`, `pool:A`, `region:eu-west-1`, `tier:web`.

### Alert routing

Severity → destination:
- Disaster: page 24x7 SecOps de plantão + Slack `#secops-incidents` + email.
- High: Slack `#secops-incidents` + email durante working hours; page de plantão se sustained > 30 min.
- Average: Slack `#secops-monitoring` + daily digest.
- Warning: daily digest only.

### Audit de hosts não-conformes

`/prumo-saas-health --audit-zabbix` reporta:
- Hosts sem agent active.
- Hosts sem template Wire-* aplicado.
- Hosts com triggers OK mas sem items reportados em 24h (silent failure).
- Templates desactualizados (versão local < versão central).

Alvo: zero hosts não-conformes em produção. SLA de remediação: 7 dias.

---

## Fontes

- **Zabbix 6.4 LTS** template documentation.
- **Zabbix Official Templates** — `Template OS Linux by Zabbix agent`, `Template DB PostgreSQL`.
- **PostgreSQL 16** monitoring functions (`pg_stat_*`, `pg_settings`).
- **Puma 6.x** stats API.
- **Lograge** structured logging output.

## Como usar este template em sessão Claude Code

A skill `prumo-saas-monitoring` invoca este template em `/prumo-saas-health`, ao auditar hosts não-conformes, ou ao desenhar novos triggers para detecção mais cedo de regressões operacionais. Esperar como output: comparação host-actual vs template-canónico + lista de items/triggers em falta + macros a definir. O user aprova alterações antes de aplicar no Zabbix server; a sessão produz YAML/XML import-ready.

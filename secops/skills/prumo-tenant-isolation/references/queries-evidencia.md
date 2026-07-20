# Queries de evidência — CTRL-W-T-001..016

> **Estado: queries canónicas, a validar contra o schema real.** Ao contrário dos mappings do
> `prumo-compliance-provider`, aqui **os controlos estão definidos** — a matriz CTRL-W-T-001..016
> vive no `SKILL.md` desta skill. As queries derivam dessa matriz e da stack conhecida (PostgreSQL
> com RLS, Vault Transit, Redis, buckets com prefixo). **Nomes de tabelas, colunas e roles são
> ilustrativos** e têm de ser ajustados ao schema em vigor antes de servirem de evidência formal.

## Regras de execução

1. **Read-only, sempre.** Esta skill não corrige; evidencia. Nenhuma query aqui escreve.
2. **Acesso a dados de tenant exige ticket de auditoria + autorização do DPO Wire** — limite do `SKILL.md`. As queries devolvem contagens e metadados, nunca payload.
3. **A própria auditoria é cross-tenant** e cai no CTRL-W-T-016: cada execução tem de aparecer no audit log com justificação e ticket.
4. **Resultado inesperado que indicie vazamento real dispara IR**, não continua em modo auditoria. Ver `prumo-ir-multitenant`.
5. **Guardar o resultado com a query**, não só a conclusão. "Conforme" sem output não é evidência.

## Formato de cada entrada

```
Controlo:   CTRL-W-T-0NN
Verifica:   <o que se está a provar>
Query:      <SQL / comando>
Esperado:   <resultado que significa conforme>
Não-conf.:  <resultado que significa desvio>
Limitação:  <o que esta query NÃO prova>
```

O campo **Limitação** é o mais importante e o mais omitido. Uma query que devolve `0` prova que não há registos naquele momento e naquela tabela — não prova que o controlo esteja implementado. Confundir as duas coisas é como se produz um relatório de conformidade falso de boa-fé.

---

## Críticos

### CTRL-W-T-001 — `tenant_id` obrigatório nas tabelas relevantes

```sql
-- tabelas de dados de cliente sem coluna tenant_id
SELECT t.table_name
FROM information_schema.tables t
WHERE t.table_schema = 'public'
  AND t.table_type = 'BASE TABLE'
  AND t.table_name NOT IN (<allowlist de tabelas globais>)
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = t.table_schema
      AND c.table_name  = t.table_name
      AND c.column_name = 'tenant_id');

-- tenant_id existente mas nullable (permite órfãos)
SELECT table_name, column_name FROM information_schema.columns
WHERE column_name = 'tenant_id' AND is_nullable = 'YES';
```

**Esperado:** ambas vazias. **Limitação:** a allowlist de tabelas globais tem de ser mantida à mão; uma tabela nova de dados de cliente que lá entre por engano fica isenta em silêncio.

### CTRL-W-T-002 — RLS activo

```sql
-- tabelas com tenant_id mas sem RLS
SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
  AND EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_name = c.relname AND column_name = 'tenant_id')
  AND (c.relrowsecurity = false OR c.relforcerowsecurity = false);

-- policies existentes
SELECT schemaname, tablename, policyname, qual FROM pg_policies WHERE schemaname='public';
```

**Esperado:** primeira vazia; cada tabela com policy que filtra por `tenant_id`.

**`relforcerowsecurity` importa tanto como `relrowsecurity`**: sem `FORCE`, o dono da tabela contorna a RLS. Se a aplicação ligar com o role dono, a RLS está activa e não protege nada. **Verificar sempre com que role a aplicação liga.**

### CTRL-W-T-003 — tenant-key validado antes da query

Não se prova por SQL — prova-se por teste de comportamento:

```bash
# pedido sem tenant-key deve ser rejeitado, não assumir default
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $TOKEN" \
  "https://<produto>.wire.internal/api/v1/<recurso>"          # esperado: 4xx

# tenant-key de outro município com token do primeiro
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $TOKEN" \
  -H "X-Tenant-Id: <UUID-de-outro>" \
  "https://<produto>.wire.internal/api/v1/<recurso>"           # esperado: 403
```

**Não-conformidade grave:** `200` no segundo caso. **Limitação:** cobre os endpoints testados. A cobertura completa exige a lista de endpoints, e essa lista é o que costuma faltar.

### CTRL-W-T-004 — storage com prefixo `tenant=<UUID>/`

```bash
# objectos fora do padrão de prefixo
aws s3 ls "s3://<bucket>/" --recursive | grep -v '^.*tenant=[0-9a-f-]\{36\}/' | head -20
```

**Esperado:** vazio. **Limitação:** prova a convenção de nomes, não a policy IAM. O controlo exige *enforcement*, não só arrumação — testar acesso com credenciais de um tenant a um prefixo de outro.

### CTRL-W-T-009 — sessões isolam tenant

```bash
# sessão de um município usada contra recurso de outro
curl -s -o /dev/null -w '%{http_code}\n' -b "session=<cookie-do-A>" \
  "https://<produto>.wire.internal/<recurso-do-B>"             # esperado: 403
```

Verificar ainda que o `tenant_id` está **no lado do servidor**, não em cookie ou JWT alterável pelo cliente.

### CTRL-W-T-010 — endpoints administrativos com MFA + audit

```bash
# acesso admin sem MFA
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $TOKEN_SEM_MFA" \
  "https://<produto>.wire.internal/admin/<recurso>"            # esperado: 401/403
```

Cruzar com Wazuh: todo o acesso admin bem-sucedido deve ter entrada correspondente.

### CTRL-W-T-016 — audit log de acesso cross-tenant

```sql
-- acessos cross-tenant nos últimos 30 dias
SELECT actor, tenant_origem, tenant_alvo, justificacao, ticket, occurred_at
FROM audit_cross_tenant
WHERE occurred_at > now() - interval '30 days'
ORDER BY occurred_at DESC;

-- os que não têm justificação ou ticket
SELECT count(*) FROM audit_cross_tenant
WHERE occurred_at > now() - interval '30 days'
  AND (justificacao IS NULL OR ticket IS NULL);
```

**Esperado:** segunda devolve `0`. **Limitação — e é a mais séria de todas:** esta query lê o log de quem *registou* o acesso. Um acesso que contorne o mecanismo de registo não aparece aqui. Zero linhas não prova ausência de acesso cross-tenant; prova ausência de acesso *registado*. Para o resto, cruzar com os logs do PostgreSQL e do Vault.

---

## Altos

### CTRL-W-T-005 — chaves Transit por tenant

```bash
V list -format=json transit/keys | jq -r '.[]' | grep -c '^tenant-'
# comparar com o número de tenants que têm dados sensíveis (denunciantes, RH)
```

### CTRL-W-T-006 — cache com keyspace separado

```bash
redis-cli --scan --pattern '*' --count 1000 | head -1000 \
  | grep -vE '^tenant:[0-9a-f-]{36}:' | head -20
```

**Esperado:** só chaves globais conhecidas. Uma chave de dados de cliente sem prefixo de tenant é vazamento potencial por colisão.

### CTRL-W-T-007 — jobs com `tenant_id`

```sql
SELECT queue, count(*) FROM background_jobs
WHERE created_at > now() - interval '7 days' AND (args->>'tenant_id') IS NULL
GROUP BY queue;
```

### CTRL-W-T-008 — logs com `tenant_id`

```bash
# entradas de lograge sem tenant_id em 24h
curl -s -k -H "Authorization: Bearer $WAZUH_TOKEN" \
  "${PRUMO_WAZUH_HOST}/security/alerts?since_hours=24&q=decoder.name=lograge" \
| jq '[.data.affected_items[] | select(.data.tenant_id == null)] | length'
```

### CTRL-W-T-011 — queries cross-tenant só em código admin

Análise estática ao repositório: procurar acessos ao modelo sem escopo de tenant fora dos caminhos de admin e reporting. **Limitação:** não detecta SQL construído dinamicamente.

### CTRL-W-T-012 — backups isolados ou cifrados por chave de tenant

Verificar o manifesto do backup: ou os dados estão separados por tenant, ou estão cifrados com a chave Transit do tenant. Um backup global cifrado com chave única falha o controlo, por muito bem protegida que a chave esteja.

### CTRL-W-T-015 — notificações validam tenant antes de enviar

```sql
-- destinatários fora do tenant de origem, 30 dias
SELECT count(*) FROM notification_log n
WHERE n.sent_at > now() - interval '30 days'
  AND NOT EXISTS (SELECT 1 FROM users u
                  WHERE u.email = n.recipient AND u.tenant_id = n.tenant_id);
```

**Esperado:** `0`. É o controlo com falha mais visível para o cliente — um email do município A para um munícipe do B é imediatamente reportado.

---

## Médios

### CTRL-W-T-013 — restauro testado por tenant

Evidência documental, não query: data do último restauro de teste, tenant usado, e confirmação de que não contaminou outros. **Sem teste de restauro documentado nos últimos 12 meses, o controlo é não-conforme** — um backup que nunca foi restaurado é uma hipótese.

### CTRL-W-T-014 — dashboards não expõem outros tenants

Revisão manual de cada dashboard partilhado. Verificar em particular *drill-downs* e filtros que aceitem `tenant_id` por parâmetro de URL.

---

## Nota sobre agregação

Um relatório de auditoria que diga "16/16 conformes" sem as limitações de cada query é enganador. Vários destes controlos provam-se apenas por amostragem ou por ausência de registo, e a ausência de registo não é ausência de facto.

O relatório ao cliente (`template-relatorio.md`) deve reproduzir as limitações materiais, não só os resultados.

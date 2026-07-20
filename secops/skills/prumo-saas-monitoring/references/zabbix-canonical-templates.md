# Mapping host-tipo → template Zabbix canónico

> **Estado: convenção definida; o inventário real por preencher.**
>
> Os nomes de template `Template-Wire-*` são os que o `SKILL.md` já assume. Os templates oficiais do
> Zabbix (PostgreSQL, FortiGate) variam de nome com a versão — **confirmar contra os templates
> efectivamente importados** antes de usar como baseline. O inventário de hosts é facto do ambiente
> e lê-se via API.

## Para que serve

A auditoria de cobertura responde a "que host não tem o template que devia ter". Sem uma tabela do que *devia* ter, a pergunta não é respondível — só se consegue listar o que existe, que é precisamente o que não interessa.

Este ficheiro é essa tabela.

## Mapping

| Tipo de host | Templates obrigatórios | Adicionais | Severidade se faltar |
|---|---|---|---|
| **Nó Rails (`wire*`)** | `Template-Wire-Rails-Puma` · `Template OS Linux by Zabbix agent` | Template específico do produto | **Alto** |
| **PostgreSQL** | `Template DB PostgreSQL by Zabbix agent 2` · items custom `pg_stat` | Replicação, se réplica | **Alto** |
| **Fortigate** | `Template Fortinet FortiGate SNMP` · triggers de HA, throughput, sessões | — | **Crítico** |
| **Vault** | Template custom: seal status, HA leader, audit lag | — | **Crítico** |
| **Wazuh manager** | `Template OS Linux` · items de EPS, tamanho de fila, estado de agentes | — | Alto |
| **Bastion** | `Template-OS-Linux-Hardening` | Auditoria de sessões SSH | Alto |
| **Load balancer / proxy** | `Template OS Linux` · items de conexões, upstreams, taxa 5xx | — | Alto |
| **Host de backup** | `Template OS Linux` · sucesso do último job, idade do backup | — | **Crítico** |

Fortigate, Vault e backup são **críticos** pela mesma razão: são pontos únicos cuja falha só se descobre quando são precisos. Um Vault selado sem alerta descobre-se quando o próximo AppRole falhar; um backup a falhar há três semanas descobre-se no restauro.

## Items mínimos por template Wire

### `Template-Wire-Rails-Puma`

```
puma.workers.running        — contagem vs esperado para o pool
puma.backlog                — pedidos em fila; >0 sustentado indica saturação
puma.restarts               — reinício não planeado
rails.error_rate.5xx        — por produto, janela de 5 min
rails.response_time.p95     — comparado com baseline do produto
lograge.tail.errors         — exceptions não tratadas
systemd.unit.state          — estado da unit do produto
disk.var.pct                — /var enche com logs; alerta aos 70%
```

O `p95` **tem de ser comparado com o baseline do produto**, não com um limite fixo. O `SKILL.md` define P2 como `p95 > 2× baseline` — com produtos entre 95 ms e 310 ms de normal, um limiar absoluto ou não dispara nunca, ou dispara sempre.

### Template de Vault

```
vault.sealed                — booleano; true não planeado é crítico
vault.ha.leader             — mudança de leader não planeada
vault.audit.lag             — atraso do audit device; >1s degrada o SIEM
vault.token.count           — tokens activos; crescimento anómalo
vault.nodes.healthy         — n/3
```

Nota apanhada nesta sessão: um check de `sealed` mal escrito pode reportar sempre o mesmo valor. Ao implementar, **validar com o Vault destrancado e selado** — um item que devolve sempre "selado" gera ruído que se aprende a ignorar; um que devolve sempre "destrancado" nunca alerta.

### Template de PostgreSQL — items custom

```
pg.connections.pct          — face a max_connections
pg.locks.waiting            — locks à espera
pg.replication.lag          — em réplicas
pg.slow_queries.count       — acima do limiar definido
pg.tenant.query_no_filter   — queries sem filtro de tenant, se instrumentável
```

O último é o mais valioso da lista: liga a monitorização activa ao controlo crítico de isolamento. Se for instrumentável no ambiente, deve ser.

## Verificação via API

```bash
ZBX="${ZABBIX_URL:-https://zabbix.wire.internal/api_jsonrpc.php}"
TOKEN=$(V kv get -field=api_token secret/data/observability/zabbix)

# hosts e templates aplicados
curl -s -H "Content-Type: application/json-rpc" -d '{
  "jsonrpc":"2.0","method":"host.get",
  "params":{"output":["host"],"selectParentTemplates":["name"],"selectGroups":["name"]},
  "auth":"'"$TOKEN"'","id":1}' "$ZBX" \
| jq -r '.result[] | "\(.host)\t\([.parentTemplates[].name] | join(","))"'
```

Cruzar a saída com a tabela acima dá directamente a lista de desvios. Hosts que existem no inventário (CMDB ou Ansible) e não aparecem aqui são o caso mais grave — **não estão monitorizados e não geram alerta nenhum a dizê-lo**.

## Regras de manutenção

- **Template desactualizado**: aplicado há mais de 12 meses sem revisão. Não é falha por si; é sinal de que a stack pode ter evoluído sem a monitorização acompanhar. Cada versão de Rails nova em produção obriga a rever o template do produto.
- **Trigger sem acção de notificação** é crítico e não médio: um trigger que dispara e não notifica ninguém dá cobertura aparente, que é pior do que ausência assumida.
- **Trigger silencioso** (>90 dias sem hit) exige verificação, não remoção automática. Pode estar obsoleto, ou mal escrito e nunca corresponder. A segunda hipótese é a perigosa.
- **Novo produto `wire*`** implica template dedicado antes de entrar em produção, não depois.

## Limite

Read-only. Esta skill **não altera configuração Zabbix** — identifica desvios e propõe. Aplicação é manual, por SecOps/SRE.

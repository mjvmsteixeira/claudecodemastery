# Runbook de correlação multi-fonte

> **Estado: procedimento operacional.** Os padrões de query seguem o do `SKILL.md` (curl directo,
> auth via Vault). **Endpoints e formatos de resposta devem ser confirmados contra as versões em
> uso** — a estrutura JSON das APIs Wazuh e Zabbix muda entre versões maiores.

Guia passo a passo para partir de um alerta e chegar a uma hipótese sustentada. Aplica-se à triagem corrente; para incidente confirmado, transita para `prumo-ir-multitenant`.

## Antes de começar — sincronização de relógios

**Verificar o desvio entre fontes antes de qualquer correlação temporal.** Toda a correlação assenta em janelas de ±5 a ±30 minutos; com deriva de NTP, emparelham-se eventos que não têm relação e perdem-se os que têm.

Se houver mais do que alguns segundos de desvio, corrigir primeiro. Uma correlação feita sobre relógios dessincronizados não é imprecisa — é aleatória.

Todas as janelas deste runbook são em **UTC**.

## Passo 1 — Fixar o evento âncora

```bash
WAZUH_TOKEN=$(V kv get -field=api_token secret/data/observability/wazuh)
WAZUH="${PRUMO_WAZUH_HOST:-${WAZUH_HOST:-wazuh-manager.wire.internal}}"

curl -s -k -H "Authorization: Bearer $WAZUH_TOKEN" \
  "${WAZUH}/security/alerts?rule_id=<ID>&since_minutes=60" \
| jq -r '.data.affected_items[]
         | "\(.timestamp) | \(.agent.name) | \(.rule.level) | \(.rule.description) | \(.data.srcip // "-")"'
```

Extrair e anotar: **timestamp**, **agente/host**, **IP de origem**, **level**, **rule_id**. São os eixos de tudo o que se segue.

Se o `rule_id` não estiver no catálogo (`wazuh-rules.md`), assinalar — está-se a triar sem runbook.

## Passo 2 — Blast radius

Antes de aprofundar a técnica, medir a extensão. Determina a severidade mais do que o nível da regra.

```bash
# municípios afectados na janela, a partir dos logs lograge
curl -s -k -H "Authorization: Bearer $WAZUH_TOKEN" \
  "${WAZUH}/security/alerts?since_minutes=60&q=rule.id=<ID>" \
| jq -r '.data.affected_items[].data.tenant_id // empty' | sort -u | wc -l
```

- **1 município, 1 produto** → provável causa aplicacional
- **Vários municípios, 1 produto** → camada do produto (deploy, migração, código)
- **Vários produtos** → infraestrutura partilhada: BD, rede, Vault, Fortigate

O terceiro caso muda a investigação toda: deixa de se procurar no produto e passa a procurar-se no que ele partilha.

## Passo 3 — Correlação com o Fortigate

Consultar `wazuh-fortigate-pairs.md` para saber **qual o par esperado**. Sem isso, o passo não conclui nada.

```bash
FG_TOKEN=$(V kv get -field=api_token secret/data/observability/fortigate)
FG="${PRUMO_FORTIGATE_HOST:-fortigate.wire.internal}"

curl -s -k -H "Authorization: Bearer $FG_TOKEN" \
  "https://${FG}/api/v2/log/memory/ips?filter=srcip==<IP>&start=<epoch-900>&end=<epoch+900>" \
| jq -r '.results[] | "\(.date) \(.time) | \(.action) | \(.attack) | \(.srcip) → \(.dstip)"'
```

Aplicar a semântica da tabela de pares. Em particular: **par esperado e ausente sobe a P2 no mínimo**, independentemente do impacto observado.

Se o IP de origem for o de um proxy ou CDN, correlacionar pelo `X-Forwarded-For` do lograge — o IP que o Rails vê não é o do cliente.

## Passo 4 — Estado activo no Zabbix

Responde a "isto é ataque ou avaria?". Um pico de 5xx com CPU saturado e sem tráfego anómalo raramente é ataque.

```bash
ZBX="${ZABBIX_URL:-https://zabbix.wire.internal/api_jsonrpc.php}"
ZBX_TOKEN=$(V kv get -field=api_token secret/data/observability/zabbix)

curl -s -H "Content-Type: application/json-rpc" -d '{
  "jsonrpc":"2.0","method":"problem.get",
  "params":{"output":"extend","recent":true,"sortfield":["eventid"],"sortorder":"DESC"},
  "auth":"'"$ZBX_TOKEN"'","id":1}' "$ZBX" \
| jq -r '.result[] | "\(.clock) | \(.severity) | \(.name)"'
```

Cruzar com o host âncora: problemas activos, e se o agente **está sequer a responder**. Um host sem heartbeat não está saudável — está invisível, o que é diferente e pior.

## Passo 5 — Vault

Se o evento tocar em autenticação, credenciais ou acesso privilegiado:

```bash
V status -format=json | jq '{sealed, ha_mode}'
# audit → Wazuh; procurar eventos do AppRole na janela
```

Sinais: falhas de auth em série, token com TTL anómalo, acesso a path fora do padrão do role, `sealed=true` não planeado.

Para correlacionar um token suspeito **sem o expor**, usar `sys/audit-hash/file` — o HMAC entra nas notas, o token nunca. Procedimento no `SKILL.md` do `prumo-ir-multitenant`.

## Passo 6 — Hipóteses

Mínimo **duas**, com ranking explícito. Uma hipótese única é uma conclusão disfarçada, e fecha a investigação antes de tempo.

```
H1 (Alta):   <hipótese>
  Evidência:        <IDs de evento concretos>
  Contra-evidência: <o que se esperaria ver e não se vê>
  Confirma-se com:  <query ou verificação específica>

H2 (Média):  <hipótese alternativa>
  …
```

O campo **contra-evidência** é o que impede a confirmação enviesada. Se uma hipótese não tiver nada que a possa desmentir, não é hipótese — é suposição.

## Passo 7 — Severidade e escalada

Aplicar os critérios do `SKILL.md`, por esta ordem:

1. Blast radius (passo 2) — quantos municípios, quantos produtos
2. Semântica da correlação (passo 3) — par ausente sobe a P2 no mínimo
3. Level da regra — o menos determinante dos três

Encaminhamento: **P1** → escalada imediata ao IR (`prumo-ir-saas-01`), e a partir daí a timeline passa a ser a do `prumo-ir-multitenant`. **P2** → engenharia do produto, em horário. **P3/P4** → ticket.

## Passo 8 — Registo

Mesmo em P3/P4, registar: evento âncora, resultado da correlação, hipóteses, decisão. Duas razões, e a segunda é a que costuma escapar:

- Se escalar mais tarde, o histórico já existe e não se reconstrói de memória.
- Um `rule_id` que apareça repetidamente em P4 durante semanas é sinal de regra ruidosa a calibrar — e isso só se vê no acumulado, não no alerta individual.

## Erros comuns

- **Correlacionar só por tempo.** Num ambiente com tráfego constante, dois eventos na mesma janela não têm relação nenhuma. Tempo **e** origem **e** destino.
- **Assumir que ausência de par é benigna** por não se encontrar a assinatura. Se o par estava previsto e não está lá, é sinal — não falha de pesquisa.
- **Parar na primeira hipótese plausível.** Duas, sempre.
- **Confundir "host sem alertas" com "host saudável".** Verificar se o agente responde.
- **Correlacionar sobre relógios dessincronizados.** É o erro que invalida tudo o resto sem dar sinal de si.

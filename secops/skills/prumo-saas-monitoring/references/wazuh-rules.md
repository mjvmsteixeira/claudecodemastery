# Regras Wazuh relevantes por produto `wire*`

> **Estado: convenção e estrutura definidas — o catálogo de IDs custom está por preencher.**
>
> As gamas de IDs do Wazuh e o comportamento do `level` são documentação do produto, verificável.
> **Os `rule_id` custom da Wire (≥100000) não constam aqui**: são facto do ambiente, lêem-se do
> manager, e inventá-los produziria queries que devolvem vazio e passam por "sem alertas". Preencher
> a partir do `rules/local_rules.xml` do manager — instrução no fim.

## Gamas de ID

| Gama | Origem | Alterável |
|---|---|---|
| `0`–`99999` | Regras nativas do Wazuh (ruleset oficial) | Não. Sobrepor com regra custom que herde via `<if_sid>` |
| `100000`+ | Regras locais da organização | Sim — é aqui que vivem as regras Wire |

Regra prática: **nunca editar uma regra nativa**. Um upgrade do ruleset reverte a alteração em silêncio, e o alerta que se esperava deixa de existir sem que nada falhe visivelmente.

## Níveis e o que fazer com eles

O `level` do Wazuh vai de 0 a 16. O mapeamento para as severidades desta skill (P1–P4) **não é directo** — depende do que a regra significa no contexto Wire, não só do número.

| Level | Significado no Wazuh | Tradução habitual |
|---|---|---|
| 0 | Ignorado (usado para suprimir) | — |
| 1–3 | Baixa relevância | P4 |
| 4–7 | Relevante | P3 |
| 8–11 | Importante, com contexto de ataque | P2 |
| 12–16 | Crítico / alta probabilidade de ataque | P1 ou P2 |

**Level 12+ não é automaticamente P1.** P1 nesta skill exige indisponibilidade de produto, taxa de erro sustentada ou suspeita de vazamento cross-tenant. Um level 12 num host isolado sem impacto é P2.

E o inverso importa mais: **um level 5 que atinja vários municípios em simultâneo é P1**, porque o critério é o blast radius, não a pontuação da regra.

## Estrutura do catálogo a preencher

Uma entrada por regra custom que a triagem use:

```
rule_id:        <≥100000>
Nome:           <descrição da regra>
Level:          <0-16>
Produto:        <wire* aplicável | transversal>
Origem do log:  <lograge | systemd | postgres | vault audit | fortigate>
Significa:      <o que aconteceu, em português>
Par Fortigate:  <ver wazuh-fortigate-pairs.md · ou "nenhum esperado">
P inicial:      <P1-P4 antes de avaliar blast radius>
Falso positivo: <padrões conhecidos que disparam sem serem incidente>
Runbook:        <o que fazer>
```

O campo **"Falso positivo"** é o que evita a erosão da triagem. Uma regra sem falsos positivos documentados vai gerar desconfiança na primeira vez que dispare por engano, e a desconfiança contamina as outras.

## Famílias que a Wire deve ter cobertas

Sem antecipar IDs, é o que uma stack Rails multi-tenant precisa de ter em regras locais:

- **Isolamento de tenant** — query sem `tenant_key`, export não rastreado, acesso a `tenant_id` diferente do da sessão. É o controlo crítico nº 1; se houver uma família de regras a merecer atenção, é esta.
- **Autenticação** — brute force, credential stuffing, escalada de privilégio, sessão anómala.
- **Vault** — falha de auth AppRole, token com TTL anómalo, acesso a path fora do padrão do role, `sealed=true` inesperado.
- **Rails / lograge** — pico de 5xx por produto, exceptions não tratadas, tempo de resposta fora de banda, parâmetros suspeitos (SQLi, path traversal).
- **Puma / systemd** — reinício não planeado, worker count fora do esperado, OOM.
- **PostgreSQL** — slow queries, locks, replication lag, conexões esgotadas.
- **Integridade de ficheiros** (FIM) — alteração em `/var/www/<produto>/current/` fora de janela de deploy. Cruza com `CTRL-W-R-*`.
- **Deploy** — Capistrano fora de janela, ou sem release gate aprovado.

## Como preencher a partir do manager

```bash
# regras locais definidas
grep -oE 'rule id="[0-9]{6,}"' /var/ossec/etc/rules/local_rules.xml | sort -u

# quais dispararam nos últimos 30 dias, e quantas vezes
WAZUH_TOKEN=$(V kv get -field=api_token secret/data/observability/wazuh)
curl -s -k -H "Authorization: Bearer $WAZUH_TOKEN" \
  "${PRUMO_WAZUH_HOST:-wazuh-manager.wire.internal}/security/alerts?since_days=30" \
  | jq -r '.data.affected_items[].rule.id' | sort | uniq -c | sort -rn
```

Cruzar as duas listas dá material directo para a auditoria de monitorização:

- **Definida e nunca disparou em 90 dias** → candidata a alerta silencioso. Pode estar obsoleta, ou mal escrita e nunca corresponder. As duas hipóteses exigem verificação — uma regra que nunca dispara por estar mal escrita é pior do que não existir, porque dá cobertura aparente.
- **Dispara mais de 10×/dia de forma consistente** → alerta ruidoso. Calibrar, não silenciar.
- **Dispara e não está no catálogo** → triagem sem runbook.

## Limite

Esta skill é read-only e **não altera o ruleset**. Regra a criar, corrigir ou calibrar é proposta em relatório, aplicada manualmente por SecOps/SRE.

# Painel `/prumo-saas-health` — template e origem dos dados

> **Estado: template operacional.** O formato segue o exemplo do `SKILL.md`. Os valores são
> ilustrativos; a coluna de origem indica de onde cada campo se lê.

## Template

```
== Wire · SaaS Health · YYYY-MM-DD HH:MM TZ ==
Produto       Up%(24h)  p95(ms)  Err%(24h)  Alertas-P1  Notas
wirePAPER     --.--%    ---      -.--%      -           Rails 6.1 · Pool A
wireDESK      --.--%    ---      -.--%      -           Rails 7.1 · Pool A
wireSTUDIO    --.--%    ---      -.--%      -           Rails 7.2 · Pool A
wireCITYapp   --.--%    ---      -.--%      -           Rails 7.0 · Pool A
wireRECRUIT   --.--%    ---      -.--%      -           Rails 7.2 · Pool A
wireDOCS      --.--%    ---      -.--%      -           Rails 7.0 · Pool B
wireMEET      --.--%    ---      -.--%      -           Rails 7.1 · Pool B
wireFORMS     --.--%    ---      -.--%      -           Rails 6.1 · Pool B
wireVOICE     --.--%    ---      -.--%      -           Rails 7.1 · Pool B
wireCONNECT   --.--%    ---      -.--%      -           Rails 7.0 · Pool B

Infra:        CPU avg --%, mem --%, disk(/var) --%
Fortigate:    HA <estado>, -- IPS hits/h (média), -- WAF blocks 24h
Vault:        <estado> (-/3 nós, leader: <nó>, audit lag <->)
Wazuh:        <estado> (eps ---, queue --), -- alertas P3 abertos
Zabbix:       <estado> · -- triggers silenciosos · COVERAGE --%

Correlação Wazuh ↔ Fortigate (24h):
  - -- pares correlacionados (1:1)
  - -- alertas Wazuh SEM correspondência Fortigate → INVESTIGAR

Backups:      Último PG <estado> --:--, último S3 <estado> --:--
Top tenants afectados em 24h:  [-]
Action items:                  [-]
```

**Os 10 produtos aparecem sempre**, mesmo saudáveis. Um painel que só mostra o que está mal não distingue "tudo bem" de "a recolha falhou".

## Origem de cada campo

| Campo | Fonte | Nota |
|---|---|---|
| `Up%(24h)` | Zabbix — disponibilidade do serviço | Não é o uptime do host. Host UP com Puma em baixo é 0% |
| `p95(ms)` | OpenTelemetry | Comparar com o baseline do produto, não entre produtos |
| `Err%(24h)` | lograge via Wazuh | Rácio 5xx sobre total |
| `Alertas-P1` | Wazuh, triados | Após aplicar blast radius, não pelo level da regra |
| `Infra` | Zabbix, agregado | `/var` enche com logs; assinalar a partir de 70% |
| `Fortigate` | FortiAPI | HA em passivo não planeado é P2 |
| `Vault` | `V status` + audit | `sealed` inesperado é P1 |
| `Wazuh` | API do manager | Fila a crescer significa perda de eventos iminente |
| `Zabbix` | API + auditoria | `COVERAGE` = hosts com template canónico / hosts inventariados |
| `Correlação` | Cruzamento 24h | Ver `wazuh-fortigate-pairs.md` |
| `Backups` | Zabbix / job de backup | Idade do último êxito, não se o job correu |

Duas distinções que o painel existe para tornar visíveis: **`Up%` é do serviço, não do host**, e **backup é o último êxito, não a última execução**. Um job que corre e falha há três semanas mostra "executado" em quase todos os painéis mal desenhados.

## Regras de preenchimento

1. **Nunca inventar um valor.** Fonte indisponível escreve-se `n/d` com nota. Um número plausível num painel de saúde é pior do que um buraco assumido — ninguém verifica o que parece normal.
2. **`n/d` é um action item.** Se o Zabbix não responde, isso é o alerta.
3. **Notas curtas e factuais.** "Pico 14:32, recuperado" diz o que interessa; "algumas lentidões" não diz nada.
4. **Action items ordenados por severidade**, com o que fazer, não só o que está mal.
5. **Timestamp com fuso.** O painel circula entre pessoas em contextos diferentes.

## Degradação

Se uma fonte estiver indisponível, o painel sai na mesma, com a lacuna marcada:

```
Zabbix:       n/d — API sem resposta desde 09:14 (ver action items)
```

E `COVERAGE` fica `n/d`, não `0%`. Zero é uma medição; `n/d` é a ausência dela.

Se **duas ou mais** fontes estiverem em baixo, dizê-lo no topo do painel: com metade da telemetria ausente, a leitura global não é fiável e quem lê tem de saber disso antes de decidir.

## Variantes

- **Diário** — o painel completo acima.
- **Por município** — mesma estrutura filtrada por `tenant_id`; para dossier de cliente, remeter para `prumo-cliente-dossier`.
- **Por produto** — expansão de uma linha, com detalhe por nó do pool.
- **Pós-incidente** — janela do incidente em vez de 24h, para anexar à timeline.

---
name: wiremaze-saas-monitoring
description: Monitorização contínua e triagem de alertas da stack SaaS Wiremaze (wirePAPER, wireDESK, wireSTUDIO, wireCITYapp, wireVOICE, wireDOCS, wireMEET, wireFORMS, wireRECRUIT, wireCONNECT) sobre servidores nativos Ruby on Rails. Combina três fontes — **Wazuh** (SIEM/auditor), **Fortigate** (firewall perímetro) e **Zabbix** (monitorização activa de hosts/serviços). Inclui auditoria da própria monitorização: hosts sem agente Zabbix, equipamentos sem template adequado, alertas silenciosos, triggers obsoletos, correcções e melhorias propostas. Usa esta skill para "/wiremaze-saas-health", status da plataforma, triagem de alerta, correlação Wazuh ↔ Fortigate, auditoria de cobertura Zabbix, e diagnóstico inicial de degradação por produto wire* ou município. Dispara em "como está a stack", "audita o Zabbix", "que hosts ficaram fora de monitorização", "este alerta Wazuh bate com o que viu o Fortigate", "qual produto está degradado", "SLA do município X", "porque está lenta a API".
---

# Wiremaze · Monitorização e Auditoria de Monitorização

A skill central de SecOps operacional. Tem três responsabilidades distintas, todas igualmente importantes:

1. **Health checking** — saúde dos produtos wire* e da infraestrutura subjacente.
2. **Correlação Wazuh ↔ Fortigate** — qualquer alerta de segurança é confrontado com o que o perímetro viu.
3. **Auditoria da monitorização** — Zabbix não pode ter pontos cegos. Hosts sem agente, sem template, alertas silenciosos ou ruidosos são dívida operacional a tratar.

## Fontes de telemetria

| Fonte | Papel | Forma |
|-------|-------|-------|
| **Wazuh** | SIEM mestre, auditor | Alertas correlacionados, regras agregadas, audit Vault |
| **Fortigate** | Perímetro (anti-DDoS, IPS, WAF) | Syslog/CEF para Wazuh, hit/miss IPS, sessões, throughput |
| **Zabbix** | Monitorização activa (host/serviço) | Agentes Zabbix nos VMs, triggers, items, templates, dashboards |
| **OpenTelemetry** | Traces e métricas custom dos serviços Rails | Endpoint p50/p95/p99, error rate, por tenant |
| **lograge** | Logs estruturados Rails | JSON enviado para Wazuh |
| **systemd journal** | Estado dos serviços Puma por produto | journalctl |
| **PostgreSQL pg_stat** | Performance DBs por tenant | Conexões, locks, slow queries, replication lag |
| **Vault audit** | Operações sobre o broker | Eventos para Wazuh |

O subagente `wiremaze-monitor-01` opera sobre estas fontes em modo read-only (AppRole `wiremaze-monitor`, TTL=30m).

## Severidades

| Sev | Critério | Janela alvo de triagem |
|-----|----------|------------------------|
| **P1** | Produto wire* indisponível para ≥1 município OR taxa de erro >5% sustentada por 5min OR vazamento cross-tenant suspeito | Imediata |
| **P2** | Degradação visível (p95 > 2× baseline) OR alerta seg. alto OR ataque com hit IPS sustentado | 15 min |
| **P3** | Anomalia técnica sem impacto visível (drift, métrica fora de banda) | 1 hora |
| **P4** | Informativo, ruído, falso-positivo provável | 4 horas |

## Workflow padrão

### 1. Carga de contexto

- Pergunta de saúde geral → executa o painel ASCII (ver "Painel `/wiremaze-saas-health`").
- Alerta específico → puxa evento Wazuh por `rule_id` + janela ±15min.
- Correlação seg. → pares Wazuh ↔ Fortigate na mesma janela e mesma fonte IP.

### 2. Identifica blast radius

- Quantos municípios afectados? (cruzar `tenant_id` nos logs lograge).
- Que produtos wire*? Mais do que um aponta para camada infra (BD, rede, Vault, Fortigate).

### 3. Correlação Wazuh ↔ Fortigate

Esta é uma capacidade central da skill. Para qualquer evento de segurança no Wazuh, valida se há correspondência no Fortigate:

| Evento Wazuh | Correspondência esperada no Fortigate | Acção se desalinhado |
|--------------|---------------------------------------|----------------------|
| Brute force admin | Hits IPS na mesma origem | Investigar evasão IDS |
| SQL injection nos logs Rails | WAF Fortigate signature `00100*` | Regra WAF a rever |
| Spike 5xx num produto | Aumento de sessões legítimas? Ou anormais? | Mitigação DDoS L7 |
| Tentativa SSH a port 22 público | Hits IPS Brute-Force-Login | Validar fail2ban + IP block |
| Reconnaissance scan | Hits IPS Port-Scan-Detected | Confirmar block automático |

**Sinal forte de problema:** evento Wazuh sem correspondência Fortigate → tráfego provavelmente entrou *contornando* o perímetro (lateral movement, supply chain).

### 4. Hipóteses com confiança

Mínimo duas hipóteses, ranking explícito (Alta / Média / Baixa). Cada uma com evidência (ID de evento) e contra-evidência (o que falta para confirmar).

### 5. Recomendação de escalada

- P1 → escalada imediata ao IR (`wiremaze-ir-saas-01`).
- P2 → engenharia do produto wire* afectado, dentro do horário.
- P3/P4 → ticket no rastreador.

### 6. Output estruturado

Template em `references/painel-template.md`.

---

## Auditoria de monitorização (Zabbix self-check)

Esta secção é a terceira responsabilidade da skill. **A monitorização activa não pode ter pontos cegos.**

### Verificações obrigatórias

| Verificação | Critério de falha | Severidade |
|-------------|--------------------|------------|
| **Cobertura de agente** | Host no inventário sem agente Zabbix activo | Alto |
| **Templates aplicados** | Host de tipo X sem template canónico esperado (ex: nó Rails sem `Template-Wire-Rails-Puma`) | Alto |
| **Templates desactualizados** | Template aplicado >12m sem revisão | Médio |
| **Alertas silenciosos** | Trigger sem hit há >90 dias (potencialmente obsoleto ou nunca dispara) | Médio |
| **Alertas ruidosos** | Trigger com >10 disparos/dia consistentes (taxa de falso-positivo provável) | Médio |
| **Hosts sem grupo** | Host não pertence a nenhum grupo de inventário (escapa a dashboards) | Médio |
| **Items desactivados** | Item em "Disabled" há >30d sem justificação | Baixo |
| **Triggers sem dependências** | Triggers críticos que disparam em cascata por não terem `dependsOn` | Médio |
| **Acções sem notificação** | Trigger crítico sem acção de notificação associada | Crítico |
| **Macros desactualizadas** | Macros globais referenciadas por hosts que já não existem | Baixo |
| **Templates por produto** | Cada produto wire* deve ter template dedicado com items específicos (Puma worker count, Rails error rate, lograge tail) | Alto |
| **Cobertura DBs** | Toda DB PostgreSQL com `Template DB PostgreSQL by Zabbix agent 2` + items custom de pg_stat | Alto |
| **Cobertura Fortigate** | Fortigate com `Template Fortinet FortiGate SNMP` + triggers de saúde HA, throughput, sessões | Crítico |
| **Cobertura Vault** | Vault com template custom monitorizando seal status, HA leader, audit lag | Crítico |

### Workflow da auditoria

1. **Inventário Zabbix.** `host.get` via API com todos os hosts e respectivos templates.
2. **Inventário esperado.** Cruza com a CMDB Wiremaze (ou inventário Ansible) para identificar hosts que existem mas não estão em Zabbix.
3. **Mapping host-tipo → template-canónico.** Cada tipo de host deve ter templates conhecidos. Lista os desvios.
4. **Análise de triggers.** Para cada trigger crítico, conta hits últimos 90 dias.
5. **Análise de items.** Identifica items disabled há >30 dias sem comentário.
6. **Output:** relatório de cobertura Zabbix com propostas concretas:

   ```
   == Wiremaze · Zabbix Coverage Audit · YYYY-MM-DD ==
   
   Hosts inventariados (CMDB):      214
   Hosts em Zabbix:                 207
   Hosts sem agent activo:          3
     - wire-paper-04 (Pool A) — última heartbeat há 14h
     - wire-docs-02 (Pool B) — Zabbix agent não responde, host UP
     - db-tenant-cm-XX-01      — host não inventariado em Zabbix
   
   Hosts sem template canónico:     7
     - wire-cityapp-03 — falta Template-Wire-Rails-Puma
     - bastion-02      — falta Template-OS-Linux-Hardening
     - ...
   
   Templates desactualizados:       4
   Alertas silenciosos >90d:        18 triggers (lista anexa)
   Alertas ruidosos >10/d:          5 triggers (lista anexa)
   Triggers críticos sem acção:     2 (CRÍTICO)
   
   Propostas de melhoria:
     1. Reinstalar agent em wire-paper-04 (firewall a bloquear porta 10050?)
     2. Aplicar Template-Wire-Rails-Puma aos 7 hosts identificados
     3. Marcar triggers silenciosos para review do dono do serviço
     4. Calibrar baseline dos 5 triggers ruidosos (sensitivity ajustável)
     5. Criar acções de notificação faltantes (CRÍTICO)
   ```

### Cadência

- **Diária leve:** verificação rápida de hosts sem heartbeat há >30min.
- **Semanal:** auditoria completa de cobertura (templates, grupos).
- **Mensal:** review de triggers (silenciosos, ruidosos, sem acção).
- **Trimestral:** revisão de templates contra evolução da stack (versões Rails, novos produtos wire*).

---

## Painel diário (`/wiremaze-saas-health`)

Painel ASCII compacto:

```
== Wiremaze · SaaS Health · YYYY-MM-DD HH:MM TZ ==
Produto       Up%(24h)  p95(ms)  Err%(24h)  Alertas-P1  Notas
wirePAPER     99.95%    180      0.04%      0           Rails 6.1 · Pool A
wireDESK      99.99%    140      0.01%      0           Rails 7.1 · Pool A
wireSTUDIO    99.92%    220      0.08%      0           Rails 7.2 · Pico 14:32, recuperado
wireCITYapp   99.80%    310      0.21%      1           Rails 7.0 · Em análise
wireVOICE     100.00%   95       0.00%      0           Rails 7.1 · Pool B
wireDOCS      99.97%    270      0.03%      0           Rails 7.0 · Pool B
wireMEET      99.95%    180      0.05%      0           Rails 7.1 · Pool B
wireFORMS     99.98%    160      0.02%      0           Rails 6.1 · Pool B

Infra:        CPU avg 42%, mem 61%, disk(/var) 73% (>70% em 2 nós, monitorizar)
Fortigate:    HA OK (active/passive), 12 IPS hits/h (média), 0 WAF blocks 24h
Vault:        OK (3/3 nós healthy, leader: node-02, audit lag <1s)
Wazuh:        OK (eps 1.4k, queue 0), 4 alertas P3 abertos
Zabbix:       AGENT-DOWN: 3 hosts (ver auditoria) · 18 triggers silenciosos · COVERAGE 96.7%

Correlação Wazuh ↔ Fortigate (24h):
  - 14 pares correlacionados (1:1)
  - 2 alertas Wazuh SEM correspondência Fortigate → INVESTIGAR (lateral?)

Backups:      Último PG OK 06:00, último S3 OK 06:30
Top tenants afectados em 24h:  [município-X 14 alertas, município-Y 8]
Action items:                  Disk node-03 a 78% · 3 hosts Zabbix down · 2 Wazuh sem correlação FG
```

## Limites desta skill

- **Read-only.** Nunca executa correcções. Identifica e escala.
- **Não toca em dados de tenant.** Vê metadados (contagens, IDs, latências), nunca payload.
- **Não cria silenciamento de alerta** sem aprovação humana N1.
- **Não modifica configuração Zabbix.** Identifica gaps e propõe — alteração é manual por SecOps/SRE.

## Referências

- `references/painel-template.md` — template completo do `/wiremaze-saas-health`.
- `references/wazuh-rules.md` — IDs de regras Wazuh relevantes por produto wire*.
- `references/wazuh-fortigate-pairs.md` — pares de eventos para correlação.
- `references/zabbix-canonical-templates.md` — mapping host-tipo → template esperado.
- `references/runbook-correlacao.md` — guia step-by-step para correlação multi-fonte.
- WMZ.ARQ.SEC.002 — Arquitectura técnica.

---
name: prumo-saas-health
description: Painel ASCII de saúde da plataforma Wire por produto wire*, com SLA 24h, p95, error rate, alertas P1, correlação Wazuh ↔ Fortigate, estado da monitorização Zabbix.
---

Produz o painel `/prumo-saas-health` actual da plataforma Wire.

Usa o subagent `prumo-monitor-01` para puxar contexto de **Wazuh** (SIEM), **Fortigate** (perímetro) e **Zabbix** (monitorização activa) em modo read-only (AppRole `wire-monitor`).

A skill `prumo-saas-monitoring` define o formato exacto do painel. Não improvises layout — segue o template.

Estrutura obrigatória:

1. Cabeçalho com timestamp.
2. Tabela por produto wire* (wirePAPER, wireDESK, wireSTUDIO, wireCITYapp, wireVOICE, wireDOCS, wireMEET, wireFORMS): Up%(24h), p95 ms, Err%(24h), Alertas P1, Notas (versão Rails + pool).
3. Linha de infra: CPU médio, mem, disco crítico.
4. Linha **Fortigate**: estado HA (active/passive), hits IPS últimas 24h, WAF blocks.
5. Linha **Vault**: estado HA, leader, lag audit.
6. Linha **Wazuh**: eps, queue, alertas P3+ abertos.
7. Linha **Zabbix**: agentes em down, coverage %, triggers silenciosos > 90d.
8. **Correlação Wazuh ↔ Fortigate (24h)**: pares 1:1 vs alertas Wazuh sem correspondência Fortigate (red flag).
9. Linha backups: última PG, última S3.
10. Top tenants afectados 24h.
11. Action items destacados.

Se algum produto estiver em P1, se houver alerta Wazuh sem correspondência Fortigate (potencial lateral movement), ou se a cobertura Zabbix descer abaixo de 95%, ressalta no topo com `[!] ATENÇÃO:` e propõe escalada.

Saída em pt-PT, registo técnico, ASCII compacto.

# Template — Painel de Saúde SaaS (`/prumo-saas-health`)

**Skill:** `prumo-saas-monitoring` · **Versão:** v0.4.0 · **Última actualização:** 2026-07-07

> Template referenciado pela skill `prumo-saas-monitoring`. É o painel consolidado emitido por
> `/prumo-saas-health`, que correlaciona **sempre as três fontes**: Wazuh (SIEM — alertas/eventos),
> Fortigate (perímetro — anti-DDoS/IPS/WAF) e Zabbix (saúde activa — agentes/triggers/templates).
> A regra da skill: não reportar só o que a monitorização vê, mas também o que ela **não** está a
> observar (hosts sem agente, templates desactualizados, triggers obsoletos).
> Marca `[CONFIRMAR]` os campos que dependem do estado real da sessão.

## Cabeçalho

```markdown
# Painel de Saúde SaaS Wire — [DATA_UTC]

**Janela analisada:** [INICIO_UTC] → [FIM_UTC]
**Produtos monitorizados:** [LISTA_WIRE_PRODUCTS]
**Estado global:** [CONFIRMAR: 🟢 OK / 🟡 Degradado / 🔴 Crítico]
```

## 1. Correlação das três fontes

```markdown
| Dimensão | Wazuh (SIEM) | Fortigate (perímetro) | Zabbix (activa) | Veredicto |
|----------|--------------|-----------------------|-----------------|-----------|
| Disponibilidade | [N alertas] | [estado WAF/IPS] | [triggers activos] | [OK/ALERTA] |
| Integridade     | [eventos]    | [bloqueios]           | [checks]          | [OK/ALERTA] |
| Perímetro       | [correlação] | [anti-DDoS]           | [—]               | [OK/ALERTA] |
```

## 2. Alertas activos (Wazuh)

```markdown
| Timestamp UTC | Regra | Nível | Host/Serviço | Estado |
|---------------|-------|-------|--------------|--------|
| [TS] | [REGRA] | [NIVEL] | [HOST] | [aberto/em análise] |
```

## 3. Perímetro (Fortigate)

- Eventos IPS/WAF relevantes: `[RESUMO]`
- Indícios de DDoS/scan: `[CONFIRMAR]`
- Sessões/políticas anómalas: `[RESUMO]`

## 4. Saúde activa (Zabbix)

```markdown
| Host | Agente | Template | Último check | Triggers em alarme |
|------|--------|----------|--------------|--------------------|
| [HOST] | [ON/OFF] | [TEMPLATE/versão] | [TS] | [N] |
```

## 5. Dívida de monitorização (o que NÃO está a ser observado)

Secção obrigatória — a ausência de sinal é, ela própria, um sinal.

- **Hosts sem agente Zabbix:** `[LISTA]`
- **Templates desactualizados:** `[LISTA]`
- **Triggers/alertas silenciosos > 90d:** `[LISTA]`
- **Produtos sem cobertura em alguma das 3 fontes:** `[LISTA]`

## 6. Recomendações

Priorizadas (crítico → baixo), cada uma com fonte, impacto e acção. `[RECOMENDACOES]`

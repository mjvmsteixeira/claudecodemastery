# Wazuh ↔ Fortigate — Pares de Correlação

**Skill:** `wire-saas-monitoring` · **Versão:** v0.4.0 · **Última actualização:** 2026-05-19

> Template referenciado pela skill `wire-saas-monitoring`. Baseado em Fortinet FortiGate
> 7.4+ event categories e Wazuh correlation engine. Marca `[CONFIRMAR]` campos Wire-specific.

A premissa: **um alerta Wazuh interno sem correspondência Fortigate é red flag** — indica
potencial supply-chain, lateral movement, ou evasão IDS. E vice-versa: actividade Fortigate
sem signal Wazuh interno pode indicar dropping bem-sucedido OU falha de visibilidade.

A skill `wire-saas-monitoring` aplica estes 4 pares canónicos.

## Convenções de janela temporal

- **Janela default:** ±15 minutos. Razão: cobre clock drift residual (NTP target ≤ 100ms),
  delays de syslog forward, agregação de eventos do mesmo flow.
- **Janela apertada:** ±2 minutos para correlação de eventos atómicos (ex: WAF block ↔ Rails 403).
- **Janela larga:** ±60 minutos para correlação de campanhas (ex: scan campaign ↔ exploit attempt).

## Par 1 — DDoS perímetro ↔ Service degradation interno

### Signal Fortigate

- Categoria: `traffic/anomaly` (Fortigate event categories oficiais).
- Subtype: `syn_flood`, `udp_flood`, `icmp_flood`, `dns_amp`.
- Volume threshold: `[CONFIRMAR — baseline por região, target = ≥ 10x média horária]`.
- Source: típicamente múltiplos IPs distribuídos (botnet) — usar `srcip` agregado por `/24` ou `ASN`.

### Signal Wazuh esperado (correlato)

- Rule 100038 (`10+ ActiveRecord errors em 5min`).
- Rule 100032 / 100034 (auth failures elevadas em Rails).
- Eventual: rules de OS-level — load average, OOM kills, connection exhaustion.
- Zabbix triggers de saturação de Puma workers.

### Runbook de correlação

| Estado | Interpretação | Acção |
|--------|---------------|-------|
| Fortigate signal **+** Wazuh signal correlato | DDoS está a passar mitigação Fortigate parcialmente | Activar rate-limit reforçado; escalar a Fortigate vendor support se sustained |
| Fortigate signal **sem** Wazuh signal | Mitigação Fortigate efectiva — sem impacto interno | Monitor; documentar como sample de defesa funcional |
| Wazuh signal **sem** Fortigate signal | **Red flag** — degradação interna sem causa externa visível. Possível: ataque interno, bug, supply chain | Investigar imediatamente; assumir comprometimento até prova contrária |
| Nenhum signal | Baseline | — |

### Sample timeline

```
T+0      Fortigate: syn_flood 80k pps from 47 srcips (ASN distintos) → eu-west-1 LB
T+0:30   Fortigate: rate-limit aplicado, 60% dropped
T+1:00   Wazuh rule 100038: 12 AR::StatementInvalid em wirePAPER em 60s
T+1:00   Wazuh rule 100032: 24 401 em 60s
T+2:00   Zabbix trigger: Puma workers saturados (>90%) em pool A
T+5:00   Fortigate: amplification declining, 95% dropped
T+7:00   Wazuh: AR errors a normalizar
```

Correlação confirmada — DDoS está a vazar parcialmente. Acção: escalar.

## Par 2 — WAF block (Fortigate) ↔ Rails 403/500 (Wazuh)

### Signal Fortigate

- Categoria: `utm/webfilter` ou `utm/waf`.
- Action: `blocked`, `denied`.
- Signature: typically OWASP-aligned (SQL injection, XSS, path traversal, command injection).
- Useful fields: `srcip`, `dstip`, `url`, `signature_id`, `severity`.

### Signal Wazuh esperado

- Rule 100036 (payload suspeito em params Rails) — payload chegou apesar do WAF? **Concerning.**
- Rule 100034 (10+ 403 em 60s) — pode ser sequência scan que WAF está a bloquear cedo.
- Rule 100038 (DB errors) — se payload conseguiu provocar exception.

### Runbook

| Padrão | Interpretação | Acção |
|--------|---------------|-------|
| WAF block + zero hits no Rails | WAF eficaz — request never reached app | Verificar regra do WAF; arquivar |
| WAF block + Rails 403/404 esporádicos | Normal — WAF complementa mas app tem fallback | Monitor |
| WAF block + Rails 500 ActiveRecord exception com payload signature | **Critical** — bypass do WAF parcial; payload chegou e provocou erro | IR triage immediate; tune WAF rule |
| Nenhum block WAF + Rails 100036 (payload suspeito) | **Critical** — WAF não detectou payload conhecido | Tune WAF signature; assumir possível bypass |

### Sample timeline (ataque SQL injection bem-sucedido)

```
T+0      Fortigate WAF: sig 70021 (SQL injection) — denied — srcip 5.6.7.8
T+0:15   Fortigate WAF: sig 70021 — denied — srcip 5.6.7.8 (2nd attempt)
T+0:32   Wazuh 100036: params=" ' OR 1=1 -- " em wireFORMS — STATUS 500
T+0:33   Wazuh 100038: 1x AR::StatementInvalid em wireFORMS
```

→ srcip 5.6.7.8 tentou via path A (bloqueado WAF), depois via path B (não coberto pelo WAF rule). **Critical.** Acção: bloquear srcip em Fortigate, criar WAF rule para path B, audit DB para verificar exfiltração.

## Par 3 — IPS hit (Fortigate) ↔ Endpoint signal (Wazuh)

### Signal Fortigate

- Categoria: `utm/ips`.
- Severity Fortigate: `critical`, `high`, `medium`, `low`.
- Common signatures Wire-relevant: CVE-specific (ex: Apache, nginx, Rails CVEs).

### Signal Wazuh esperado

- Rule 100200-100299 (Vault audit) — se IPS sig é Vault-related.
- Rule 100020-100029 (tenant isolation) — se IPS sig é PostgreSQL CVE.
- FIM rules (100150+) — se IPS sig é file-tampering related.
- OS-level rules (Wazuh built-ins 5500-5599) — sudo, su, login.

### Runbook

Para cada IPS critical/high signature, Wazuh **deve** ter algo correlato em ±15min. Ausência = investigation flag.

Exemplo: Fortigate IPS sig "Apache Struts2 RCE attempt" → Wazuh deve mostrar:
- Tentativa de exec em endpoint suspeito (lograge unusual path).
- OU rejeição early (Rails routing 404).

Se nem 200 nem 404 — endpoint não existe ou está protegido upstream. OK. Documentar.

## Par 4 — Geo anomaly ↔ Auth events

### Signal Fortigate

- Categoria: `traffic` com `geoip` enrichment.
- Anomaly: source geography incomum (não-PT, não-EU típico) para auth endpoints.
- Tor exit nodes flagged via geo feed.

### Signal Wazuh esperado

- Wazuh rule 5710-5712 (built-in) — SSH failed login.
- Rule 100032 — 401 elevados Rails.
- Vault rule 100202 — permission denied.

### Runbook

| Padrão | Interpretação | Acção |
|--------|---------------|-------|
| Geo anomaly + auth failures | Brute force from anomalous geo | Auto-block via Fortigate dynamic blocklist |
| Geo anomaly + auth success | **Critical** — credential compromised + geo unusual | IR triage; force re-auth + MFA verify user |
| Geo PT/EU normal + auth failures | Standard brute force (ainda preocupante mas baseline) | Rate-limit, monitor |

### Sample (account takeover detectado)

```
T-1d     Last login user X: srcip 88.91.x.x (Lisboa, PT) — normal
T+0      Wazuh built-in 5712: SSH failed login user X — srcip 198.244.x.x
T+0      Fortigate geo: srcip 198.244.x.x → CA, Toronto — UNUSUAL para Wire staff
T+0:15   Wazuh built-in: 4x failed em 15min
T+0:20   Wazuh built-in 5715: SSH login SUCCESS user X — srcip 198.244.x.x
```

→ **Critical** — possível account takeover. Acção: revogar sessão, MFA challenge, audit access user X últimas 24h.

## Anti-patterns na correlação

1. **Não correlacionar tudo a tudo.** Janela ±15min com 50k events Wazuh + 30k Fortigate gera ruído. Filtrar por severity ≥ 8 antes de correlacionar.
2. **Não assumir que IP igual = mesma origem.** Atacantes usam shared proxies; mesma srcip pode aparecer em Fortigate e Wazuh sem estar relacionada.
3. **Não ignorar Wazuh-only signals.** São o mais preocupante (vector interno ou supply chain).
4. **Não confundir blocking com prevention.** Fortigate WAF block significa que regra apanhou — não significa que outras formas do mesmo ataque também são bloqueadas.

## Métricas de saúde da correlação

A monitorizar mensalmente:

- **Pair detection rate:** % de S1/S2 incidents onde ambos os signals estavam presentes pre-detection. Target ≥ 80% `[CONFIRMAR baseline]`.
- **Wazuh-only ratio:** % de Wazuh critical alerts sem Fortigate context em ±15min. Target < 10% (acima = visibilidade perímetro insuficiente OU lateral movement frequente).
- **Fortigate-only ratio:** % de Fortigate critical sem Wazuh context. Target < 5% (acima = lacunas em Wazuh coverage).

---

## Fontes

- **Fortinet FortiGate 7.4+** Log and Report documentation.
- **Wazuh 4.7+** Correlation engine + rule frequency/timeframe options.
- **MITRE ATT&CK v15** — Lateral Movement, Initial Access tactics.
- **CSIRT.PT advisories 2024-2025** — geo-anomaly patterns relevantes para infra PT.

## Como usar este template em sessão Claude Code

A skill `wire-saas-monitoring` invoca este template em `/wire-saas-health` quando há alerta Wazuh sem contexto Fortigate (ou vice-versa), durante triage de IR para validar correlação cruzada, ou em audit periódico das métricas de saúde. Esperar como output: classificação do par (confirmado / red-flag / informativo) + runbook específico aplicável. O user mantém o último julgamento — a sessão sinaliza, humano decide escalation.

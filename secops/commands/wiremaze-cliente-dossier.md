---
description: Gera dossier consolidado de segurança e operação por município cliente — produtos activos, SLA realizado, incidentes 12m, DPIA, configurações específicas, riscos.
argument-hint: <nome-municipio>
---

Dossier consolidado para o município: **$ARGUMENTS**

Activa a skill `wiremaze-cliente-dossier` e os subagentes `wiremaze-tenant-01`, `wiremaze-monitor-01`, `wiremaze-compliance-01`.

Sequência:
1. Resolve `$ARGUMENTS` para `tenant_id` UUID.
2. Recolhe automaticamente (em paralelo):
   - **Produtos e versões** (de `wiremaze-tenant-01`).
   - **SLA realizado 12m + histórico de incidentes** (de `wiremaze-monitor-01`).
   - **Compliance específica** — DPIA, Anexo II, sub-subcontratantes, residência de dados (de `wiremaze-compliance-01`).
3. Aplica template das 10 secções (ver skill):
   1. Identificação.
   2. Produtos activos.
   3. SLA realizado 12m.
   4. Histórico de incidentes 12m.
   5. Configurações específicas do tenant.
   6. Compliance específica (Art. 28, DPIA, sub-subcontratantes, residência).
   7. Aspectos NIS2 do cliente (entidade essencial, CSIRT, contactos).
   8. Pedidos pendentes.
   9. Riscos identificados.
   10. Recomendações Wiremaze para o cliente.
4. **Limpa para distribuição:** remove referências a outros tenants; classifica como "Confidencial — Wiremaze + Município $ARGUMENTS".
5. Gera DOCX via Cowork `ai-rep-01` em `/shared/reports/output/dossier-<municipio>-<YYYY-MM-DD>.docx`.
6. Regista a emissão no audit trail (quem pediu, quando, destinatário).

Output: caminho para o DOCX gerado + resumo executivo no chat.

**Importante:** nunca compara este cliente com outros no mesmo dossier. Um dossier = um cliente. Watermark do destinatário incluído.

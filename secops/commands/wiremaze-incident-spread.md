---
description: Analisa propagação de incidente entre municípios clientes Wiremaze, identifica blast radius, prepara comunicação coordenada.
argument-hint: <incident-id>
---

Analisa o blast radius do incidente: **$ARGUMENTS**

Activa a skill `wiremaze-ir-multitenant` e o subagent `wiremaze-ir-saas-01`.

Sequência:
1. Carrega o incidente `$ARGUMENTS` do Wazuh + ticket interno.
2. Cruza janela temporal com painel `/wiremaze-saas-health` para confirmar produtos wire* afectados.
3. Identifica:
   - Lista de tenants afectados (UUID + nome do município).
   - Produtos wire* afectados.
   - Tipo de impacto (disponibilidade / integridade / confidencialidade).
   - Cadeia de dependência potencialmente exposta.
4. Classifica severidade (S1–S4) usando `references/severity-matrix.md`.
5. Se há vazamento confirmado de dados pessoais OU >5 municípios afectados → escala automaticamente para N3 e abre ponte CSIRT permanente.
6. Produz:
   - Timeline cruzada multi-tenant.
   - Plano de contenção com aprovação humana N2/N3 explícita.
   - Templates de comunicação por município (parametrizados por tenant_id e impacto específico).
   - Mapping para CNCS-form (T+24h alerta inicial).
   - Lista de evidência preservada (SHA-256, localização).

Output: dossier de incidente em MD; comunicações finais via Cowork `ai-rep-01` em DOCX.

**Importante:** nunca executa contenção sem aprovação humana explícita. Esta skill apoia o IR lead, não substitui.

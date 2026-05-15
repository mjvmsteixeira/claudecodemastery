---
name: wire-tenant-audit
description: Audita o isolamento multi-tenant de um cliente Wire específico. Aplica CTRL-W-T-001..016 e produz relatório formal.
argument-hint: <nome-municipio-ou-tenant-uuid>
---

Auditoria de isolamento multi-tenant para o cliente: **$ARGUMENTS**

Activa a skill `wire-tenant-isolation` e o subagent `wire-tenant-01`.

Sequência:
1. Resolve `$ARGUMENTS` para `tenant_id` UUID se vier o nome do município.
2. Define o âmbito (todos os produtos wire* activos para esse cliente ou um específico, conforme contexto).
3. Recolhe artefactos: schemas, policies Vault, IAM, configuração da app, últimos 30 dias de audit log relevantes.
4. Aplica CTRL-W-T-001..016 — para cada controlo, regista conforme/parcial/não-conforme com evidência.
5. Cruza com sinais de vazamento real (queries sem WHERE tenant_id, exports não-rastreados, logs cross-tenant).
6. Produz relatório estruturado conforme template em `references/template-relatorio.md` da skill.
7. Se houver não-conformidade crítica, marca-a no topo do relatório com escalada automática ao Coordenador SecOps Wire.
8. Não inicia remediação — só recomenda.

Output: relatório em MD para revisão; DOCX final via Cowork `ai-rep-01` se o utilizador pedir entregável formal.

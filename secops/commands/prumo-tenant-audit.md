---
name: prumo-tenant-audit
description: Audita o isolamento multi-tenant de um cliente Wire específico. Aplica CTRL-W-T-001..016 e produz relatório formal.
argument-hint: <nome-municipio-ou-tenant-uuid>
---

Auditoria de isolamento multi-tenant para o cliente: **$ARGUMENTS**

Activa a skill `prumo-tenant-isolation` e o subagent `prumo-tenant-01`.

Sequência:
1. Resolve `$ARGUMENTS` para `tenant_id` UUID se vier o nome do município.
2. Define o âmbito (todos os produtos wire* activos para esse cliente ou um específico, conforme contexto).
3. Recolhe artefactos: schemas, policies Vault, IAM, configuração da app, últimos 30 dias de audit log relevantes.
4. Aplica os controlos `CTRL-W-T-*` — para cada um, regista conforme/parcial/não-conforme com evidência.

   **Ler as definições primeiro:** `${CLAUDE_PLUGIN_ROOT}/ctrl-w-inventario.md`, secção `CTRL-W-T-*`. São 16 controlos com severidade (6 Críticos, 8 Altos, 2 Médios). Até 2026-08-02 este passo citava o intervalo `001..016` sem apontar para definição nenhuma — um mandato que o agente não podia cumprir, e cujo incumprimento não aparecia no output. **Se o inventário não for legível, dizê-lo e parar**; não inferir os controlos pelo número.

   As queries de evidência por controlo, com as respectivas limitações, estão em `skills/prumo-tenant-isolation/references/queries-evidencia.md`.
5. Cruza com sinais de vazamento real (queries sem WHERE tenant_id, exports não-rastreados, logs cross-tenant).
6. Produz relatório estruturado conforme template em `references/template-relatorio.md` da skill.
7. Se houver não-conformidade crítica, marca-a no topo do relatório com escalada automática ao Coordenador SecOps Wire.
8. Não inicia remediação — só recomenda.

Output: relatório em MD para revisão; DOCX final via Cowork `ai-rep-01` se o utilizador pedir entregável formal.

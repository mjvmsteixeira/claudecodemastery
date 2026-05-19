---
name: wire-tenant-isolation
description: Auditar e validar o isolamento multi-tenant entre municípios clientes na plataforma SaaS Wire (wirePAPER, wireDESK, wireSTUDIO e restante família wire*). Usa esta skill sempre que o pedido envolva cruzamento de dados entre clientes, due-diligence de novo cliente, validação de chaves de cifra por tenant, auditoria de queries que toquem múltiplos schemas/databases, revisão de logs por suspeita de vazamento cross-tenant, ou preparação de relatório Art. 28 RGPD para um cliente específico. Dispara em pedidos como "audita isolamento", "verifica se há cross-tenant", "Município X consegue ver dados do Município Y", "valida tenant separation", "evidência de isolamento para auditoria".
---

# Wire · Auditoria de Isolamento Multi-Tenant

## Pré-requisitos

- AppRole Vault `wire-tenant` (read em `secret/data/db/schemas/tenant-*`).
- Env vars: `${WIRE_PG_HOST}` (default `postgres-wire.internal`).
- Referências:
  - `references/template-cliente.md` — relatório Art. 28 RGPD por cliente.
  - `references/queries-evidencia.md` — queries SQL canónicas para os 16 CTRL-W-T-*.
  - `references/painel-template.md` — painel consolidado de isolamento.

## Padrão de query RLS (sem wrappers)

```bash
# Validação RLS para tenant X
TENANT_DB_USER=$(V kv get -field=audit_user secret/data/db/schemas/tenant-X)
TENANT_DB_PASS=$(V kv get -field=audit_pass secret/data/db/schemas/tenant-X)

PGPASSWORD="$TENANT_DB_PASS" psql \
  -h "${WIRE_PG_HOST:-postgres-wire.internal}" \
  -U "$TENANT_DB_USER" \
  -d "wire_main" \
  -c "SET app.current_tenant = 'tenant-X'; SELECT count(*) FROM wirepaper_docs WHERE tenant_id != 'tenant-X';"
# Expected: 0 (RLS bloqueia leakage)
```

`references/queries-evidencia.md` tem a lista completa para os 16 CTRL-W-T-*.

A Wire hospeda dados de 170+ municípios na mesma plataforma. O isolamento entre tenants é o controlo crítico mais importante: uma falha aqui produz simultaneamente um incidente NIS2 (fornecedor crítico) **e** uma violação RGPD (subcontratante a expor dados pessoais de munícipes). Esta skill formaliza a auditoria.

## Quando aplicar

- Pedido explícito de auditoria de isolamento (rotina semestral ou em resposta a alerta).
- Antes da activação de um novo cliente, para verificar que a tenancy foi correctamente provisionada.
- Após incidente envolvendo aplicação wire* — para excluir comprometimento de outros municípios.
- Preparação de evidência para due-diligence de cliente ou auditor.
- Dúvida operacional concreta ("o cliente X reportou que viu uma referência ao cliente Y").

## Princípios

- **Tenant-key obrigatório.** Todo o acesso a dados de cliente requer o tenant-key explícito (UUID do município) na query, no header, no path do storage. Não há "default tenant".
- **Não-listável.** Nenhum endpoint pode devolver a lista de clientes sem permissão administrativa. Enumerar tenant IDs é um vector de ataque.
- **Storage segregado.** Ficheiros de munícipes vão para buckets/pastas com prefix obrigatório `tenant=<UUID>/`. Acesso enforce via policy IAM/Vault, não só na aplicação.
- **Cifra por tenant onde aplicável.** Para dados especialmente sensíveis (denunciantes, RH), chave de cifra dedicada por tenant (Vault Transit).
- **Auditoria 100%.** Toda a query cross-tenant (administrativa, suporte) tem que aparecer no audit log da Wire com justificação e ticket.

## Matriz de controlos (CTRL-W-T-001..016)

| ID | Controlo | Severidade |
|----|----------|------------|
| CTRL-W-T-001 | Schemas/DBs com tenant_id obrigatório em todas as tabelas relevantes | Crítico |
| CTRL-W-T-002 | Row-Level Security (RLS) activo em PostgreSQL, ou equivalente | Crítico |
| CTRL-W-T-003 | Tenant-key validado em todos os middlewares antes de query | Crítico |
| CTRL-W-T-004 | Bucket storage com prefix `tenant=<UUID>/` e IAM policy de scope | Crítico |
| CTRL-W-T-005 | Chaves Vault Transit por tenant para dados sensíveis (denunciantes, RH) | Alto |
| CTRL-W-T-006 | Cache (Redis) com keyspace separado ou key prefix por tenant | Alto |
| CTRL-W-T-007 | Filas/jobs com tag tenant_id, workers respeitam o tag | Alto |
| CTRL-W-T-008 | Logs aplicacionais com tenant_id em todas as entradas | Alto |
| CTRL-W-T-009 | Sessões/cookies isolam tenant; impossível "saltar" sessão | Crítico |
| CTRL-W-T-010 | Endpoints administrativos exigem MFA + audit | Crítico |
| CTRL-W-T-011 | Queries cross-tenant existem apenas em código de admin/reporting | Alto |
| CTRL-W-T-012 | Backups isolam dados por tenant (ou cifrados com keys por tenant) | Alto |
| CTRL-W-T-013 | Restore testado por tenant (sem contaminar outros) | Médio |
| CTRL-W-T-014 | Métricas/dashboards não expõem dados de outros tenants | Médio |
| CTRL-W-T-015 | Endpoints de notificação (webhooks, email) validam tenant antes de enviar | Alto |
| CTRL-W-T-016 | Audit log dedicado de qualquer acesso cross-tenant (rare-event) | Crítico |

## Workflow padrão

1. **Scope.** Define o âmbito: um cliente específico, um produto wire*, ou auditoria geral.
2. **Snapshot.** Recolhe os artefactos: schema das DBs, policies Vault, IAM, configuração da app, últimos 30 dias de audit log relevantes.
3. **Aplicação dos controlos.** Para cada CTRL-W-T-001..016, evidencia conformidade ou desvio. Usa o sub-agente `wire-tenant-01` quando o pedido envolver acesso técnico a DB ou Vault.
4. **Cross-check.** Procura sinais de vazamento real: logs com tenant_id inconsistente, queries sem WHERE tenant_id, exports não-rastreados.
5. **Relatório.** Output estruturado:

   ```
   Cliente / Âmbito: <nome>
   Período auditado: <YYYY-MM-DD> a <YYYY-MM-DD>
   
   Controlos críticos:     X/Y conformes
   Controlos altos:        X/Y conformes
   Controlos médios:       X/Y conformes
   
   Não-conformidades:      <id> <descrição> <severidade> <evidência>
   Riscos residuais:       <descrição> <plano>
   
   Conclusão:              {Aprovado | Aprovado com reservas | Reprovado}
   ```

6. **Próximas acções.** Se houver não-conformidade crítica, escala imediatamente ao Coordenador SecOps e propõe contenção (suspender feature, bloquear endpoint, accionar IR).

## Limites

- Esta skill **não** executa fix automático. Identifica e recomenda; correcção passa por desenvolvimento + release com gate.
- Evidência de vazamento real **dispara IR** (`wire-ir-multitenant`), não fica em modo de auditoria.
- Acesso a dados de tenant para validação requer ticket de auditoria + autorização DPO Wire.

## Referências

- `references/queries-evidencia.md` — queries SQL/Vault padrão para evidenciar cada controlo (a criar conforme adopção).
- `references/template-relatorio.md` — template DOCX para o relatório Art. 28 enviado ao cliente.
- WIRE.MTZ.SEC.006 — controlos numerados completos.
- RGPD Art. 28 — obrigações do subcontratante.
- ISO/IEC 27001:2022, A.5.34 (privacidade e PII).

# Inventário de controlos `CTRL-W-*`

Fonte única dos controlos citados pelos comandos, agents e skills deste plugin.

**Porque existe.** Até 2026-08-02, os identificadores eram citados como intervalos — `/prumo-tenant-audit` dizia *"aplica CTRL-W-T-001..016"* e `/prumo-release-gate` *"aplica CTRL-W-R-001..018"* — a um agente que **não tinha acesso a nenhuma definição**. As matrizes existiam, mas dentro de dois `SKILL.md` que os comandos não lêem. O resultado era um mandato impossível de cumprir: o agente ou inventava os controlos ou ignorava a instrução, e nenhuma das duas coisas é visível no output.

**Estatuto.** O registo canónico é o `WIRE.MTZ.SEC.006` (RACI + CTRL-W-*), externo a este repositório. Este ficheiro é a **cópia operacional** do que o plugin precisa de aplicar — não o substitui e não decide âmbito. Em divergência, manda o documento externo.

**Proveniência de cada família está declarada abaixo.** Uma família sem matriz aparece como lacuna, nunca preenchida por inferência.

---

## `CTRL-W-T-*` — Isolamento multi-tenant

**Proveniência:** transcrito do `skills/prumo-tenant-isolation/SKILL.md`. 16 controlos, completo.
**Consumidores:** `/prumo-tenant-audit`, agent `prumo-tenant-01`, skill `prumo-tenant-isolation`.

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

**Distribuição:** 6 Críticos · 8 Altos · 2 Médios.

As queries de evidência por controlo vivem em [`skills/prumo-tenant-isolation/references/queries-evidencia.md`](skills/prumo-tenant-isolation/references/queries-evidencia.md), cada uma com o campo de **limitação** — o que a query prova e o que não prova.

---

## `CTRL-W-R-*` — Release gate

**Proveniência:** transcrito do `skills/prumo-release-safety/SKILL.md`. 18 controlos, completo.
**Consumidores:** `/prumo-release-gate`, agent `prumo-deploy-01`, skill `prumo-release-safety`.

Bloqueante = se falha, NO-GO automático. Avaliativo = depende do contexto.

| ID | Item | Tipo | Verificação |
|----|------|------|-------------|
| CTRL-W-R-001 | Build reprodutível, SHA registado | Bloqueante | CI log |
| CTRL-W-R-002 | Testes unitários verdes (>= baseline cobertura) | Bloqueante | CI log |
| CTRL-W-R-003 | Testes de integração verdes | Bloqueante | CI log |
| CTRL-W-R-004 | Testes E2E em tenant de staging | Bloqueante | CI log |
| CTRL-W-R-005 | SCA: dependências sem CVE Crítica conhecida | Bloqueante | SBOM |
| CTRL-W-R-006 | SAST sem findings críticos não-justificados | Bloqueante | Relatório |
| CTRL-W-R-007 | Secrets scanner (gitleaks/trufflehog) limpo | Bloqueante | CI log |
| CTRL-W-R-008 | Imagem container assinada (cosign) | Bloqueante | Verificação |
| CTRL-W-R-009 | Migration tem rollback testado em pré-prod | Bloqueante se aplicável | Evidência |
| CTRL-W-R-010 | Feature flag definida para features que tocam dados de tenant | Bloqueante se aplicável | Config |
| CTRL-W-R-011 | Documentação de breaking changes para clientes | Bloqueante se aplicável | Changelog |
| CTRL-W-R-012 | Plano de canary definido (% e tenants) | Bloqueante | Plano |
| CTRL-W-R-013 | Plano de rollback definido (tempo alvo, RPO/RTO) | Bloqueante | Plano |
| CTRL-W-R-014 | Aprovação dev lead | Bloqueante | Aprovação |
| CTRL-W-R-015 | Aprovação SRE | Bloqueante | Aprovação |
| CTRL-W-R-016 | Aprovação SecOps | Bloqueante | Aprovação |
| CTRL-W-R-017 | Janela de manutenção comunicada se aplicável | Avaliativo | Aviso a clientes |
| CTRL-W-R-018 | DPIA actualizada se nova feature processa dados pessoais | Bloqueante se aplicável | DPIA |

**Distribuição:** 12 Bloqueantes · 5 Bloqueantes-se-aplicável · 1 Avaliativo.

Os templates de canary, rollback e changelog vivem em [`skills/prumo-release-safety/references/`](skills/prumo-release-safety/references/).

---

## `CTRL-W-IR-*` — Resposta a Incidentes · **LACUNA**

**Proveniência: nenhuma. Não existe matriz para esta família em lado nenhum do repositório.**

O único identificador citado é o **`CTRL-W-IR-007`**, no `skills/prumo-ir-multitenant/SKILL.md`, associado ao *Vault audit hash para correlation evidence*:

```
path "sys/audit-hash/*"   # CTRL-W-IR-007
```

O que isto implica:

- Existem presumivelmente `CTRL-W-IR-001` a `006` (e possivelmente mais) que **este repositório nunca viu**
- O `007` é conhecido pelo *efeito* (dá ao `wire-ir` a capacidade de assinar evidência sem expor o input), não pelo enunciado
- Qualquer relatório de IR que afirme cobertura desta família está a afirmar o que não pode verificar

**Não preenchi por inferência.** Deduzir os controlos de IR a partir do que a skill faz produziria uma matriz plausível e não-oficial — exactamente o modo de falha que os mappings do `prumo-compliance-provider` evitaram ao deixar a coluna de cobertura vazia.

**Para fechar:** extrair a família IR do `WIRE.MTZ.SEC.006` e transcrevê-la aqui, com a mesma declaração de proveniência.

---

## Como usar este ficheiro

**Comandos e agents citam este inventário, não intervalos.** Um `"aplica CTRL-W-T-001..016"` sem ponteiro para as definições é um mandato que o agente não pode cumprir — e o incumprimento não aparece no output.

**Ao acrescentar um controlo:** actualizar aqui **e** no `SKILL.md` de origem, ou eliminar a duplicação apontando o `SKILL.md` para este ficheiro. Duas cópias que divergem são piores que uma cópia desactualizada, porque não se sabe qual manda.

**Verificação de coerência** — as contagens têm de bater com as origens:

```bash
# T: 16 esperados · R: 18 esperados
grep -c '^| CTRL-W-T-' secops/ctrl-w-inventario.md
grep -c '^| CTRL-W-T-' secops/skills/prumo-tenant-isolation/SKILL.md
grep -c '^| CTRL-W-R-' secops/ctrl-w-inventario.md
grep -c '^| CTRL-W-R-' secops/skills/prumo-release-safety/SKILL.md
```

Divergência entre as duas contagens de uma família = alguém editou um lado só.

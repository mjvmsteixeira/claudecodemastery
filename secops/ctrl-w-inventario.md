# Inventário de controlos `CTRL-W-*`

Fonte única dos controlos citados pelos comandos, agents e skills deste plugin.

**Porque existe.** Até 2026-08-02, os identificadores eram citados como intervalos — `/prumo-tenant-audit` dizia *"aplica CTRL-W-T-001..016"* e `/prumo-release-gate` *"aplica CTRL-W-R-001..018"* — a um agente que **não tinha acesso a nenhuma definição**. As matrizes existiam, mas dentro de dois `SKILL.md` que os comandos não lêem. O resultado era um mandato impossível de cumprir: o agente ou inventava os controlos ou ignorava a instrução, e nenhuma das duas coisas é visível no output.

**Estatuto.** O registo canónico é o `<ORG>.MTZ.SEC.006` (RACI + CTRL-W-*), externo a este repositório. Este ficheiro é a **cópia operacional** do que o plugin precisa de aplicar — não o substitui e não decide âmbito. Em divergência, manda o documento externo.

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
- O `007` é conhecido pelo *efeito* (dá ao `<prefixo>-ir` a capacidade de assinar evidência sem expor o input), não pelo enunciado
- Qualquer relatório de IR que afirme cobertura desta família está a afirmar o que não pode verificar

**Não preenchi por inferência.** Deduzir os controlos de IR a partir do que a skill faz produziria uma matriz plausível e não-oficial — exactamente o modo de falha que os mappings do `prumo-compliance-provider` evitaram ao deixar a coluna de cobertura vazia.

**Para fechar:** extrair a família IR do `<ORG>.MTZ.SEC.006` e transcrevê-la aqui, com a mesma declaração de proveniência.

---

## O que pedir ao `<ORG>.MTZ.SEC.006`

Três pedidos. Nenhum é resolúvel de dentro deste repositório — a tentativa já foi feita e falhou de forma instrutiva (ver "Precedente" no fim).

### 1 · A matriz `CTRL-W-IR-*` completa

Sabe-se que a família existe: o `CTRL-W-IR-007` é citado pelo efeito. Não se sabe a extensão nem o enunciado de nenhum, incluindo o `007`.

O que é preciso, por controlo: **ID · enunciado · severidade ou tipo · fonte de verificação**. É o mesmo formato das famílias `T` e `R` acima, e é o mínimo para transcrever com proveniência em vez de parafrasear.

Confirmar em particular o enunciado do **`007`** — o repositório conhece-o pela capacidade que concede (`sys/audit-hash/*`, assinar evidência sem expor o input), não pelo que o controlo exige.

**Destrancar:** a medida **(b)** do Art. 21(2) do NIS2, tratamento de incidentes, em `skills/prumo-compliance-provider/references/mapping-nis2.md`. E levanta a proibição, hoje activa no `prumo-ir-multitenant`, de afirmar cobertura desta família.

### 2 · Existem famílias de governança?

**Esta é a pergunta que muda o diagnóstico**, e é a mais barata de responder — sim ou não, seguido da lista.

Os 34 controlos conhecidos concentram-se no técnico e no release. Quatro medidas do Art. 21(2) não têm **um único candidato**: (a) políticas de análise de risco, (f) avaliação da eficácia das medidas, (g) ciber-higiene e formação, e a parte de RH e gestão de activos da (i).

Duas leituras, indistinguíveis de dentro do repositório:

| Se… | Então é |
|---|---|
| existem famílias de governança no `<ORG>.MTZ.SEC.006` que nunca chegaram aqui | problema de **documentação** — transcreve-se e fecha |
| não existem | **lacuna real de conformidade** — precisa de plano, responsável e prazo |

Pergunta concreta a fazer a quem detém o documento: **o `<ORG>.MTZ.SEC.006` tem famílias com os prefixos `C`, `S`, `O` ou `P`?** Estes quatro prefixos apareceram numa proposta de taxonomia interna (`docs/wire-defaults-aprovacao/01-catalogo-controlos.md`, 2026-05-20) que **nunca foi confirmada contra o documento externo** — podem ser reais, podem ter sido inventados aqui. Ver o precedente abaixo antes de assumir qualquer das hipóteses.

### 3 · ISO 27001 — bloqueio diferente, não depende deste inventário

O `mapping-iso27001.md` continua por preencher **por direitos de autor**, não por falta de controlos: os títulos dos 93 controlos do Anexo A:2022 são texto protegido e não podem ser reproduzidos neste repositório.

Não é um pedido ao `<ORG>.MTZ.SEC.006`. Quem tiver o exemplar licenciado da norma preenche a tabela de trabalho sem depender de mais nada — o inventário já dá a coluna de controlos da organização.

### O formato em que a resposta é utilizável

Uma tabela por família, uma linha por controlo, com **ID, enunciado e severidade/tipo**. Se vier em prosa ou em PDF sem estrutura, transcreve-se à mesma — mas transcreve-se **literalmente**, e a proveniência diz de onde e de que versão do documento.

**O que não é aceitável como resposta:** *"os controlos de IR são os habituais de NIST 800-61"*, ou uma lista derivada do que as skills já fazem. Um controlo inferido do comportamento do plugin é circular — valida o plugin contra si próprio.

### Precedente — porque esta regra existe

A 2026-05-19 (`aecabaf`, pré-rebranding) as tabelas de mapping ISO e NIS2 estavam **preenchidas**, com 24 identificadores das famílias `C`, `S`, `O` e `P` a cobrir exactamente as medidas de governança hoje sem candidato. Eram inventados. Davam `OK` a controlos sem matriz, com evidência fabricada:

```
| A.6.1 | Screening | Y | CTRL-W-P-001 | Background check pré-contratação | OK |
| A.6.3 | Awareness | Y | CTRL-W-C-018 | LMS completion >95% staff        | OK |
```

Nenhuma dessas evidências existe. A tabela era **indistinguível de uma conforme** para quem a lesse sem verificar, e teria ido para auditor externo nesse estado. Não sobreviveram ao rebranding, e não devem ser recuperados.

É por isso que a família `IR` fica declarada como lacuna em vez de preenchida por inferência: uma lacuna assumida é recuperável, uma declaração de conformidade sem lastro não é.

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

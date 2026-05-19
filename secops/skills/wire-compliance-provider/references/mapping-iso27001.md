# Mapping ISO/IEC 27001:2022 — Wire SoA + Annex A

**Skill:** `wire-compliance-provider` · **Versão:** v0.4.0 · **Última actualização:** 2026-05-19

> Template referenciado pela skill `wire-compliance-provider`. Baseado em ISO/IEC 27001:2022
> (cláusulas 4-10) e Annex A (93 controlos), com leitura complementar de ISO/IEC 27002:2022.
> Marca `[CONFIRMAR]` onde a postura Wire-specific ainda não é definitiva.

## ISO 27001:2022 — visão geral

A edição 2022 substituiu a estrutura tradicional de 14 domínios A.5-A.18 por **4 grupos** de controlos no Annex A (total 93 controlos, reduzido dos 114 da edição 2013):

| Grupo | Designação | Nº controlos | Foco |
|-------|------------|--------------|------|
| **A.5** | Organizacionais | 37 | Políticas, papéis, gestão, fornecedores, IR, BC |
| **A.6** | Pessoas | 8 | Recrutamento, formação, NDAs, disciplina, offboarding |
| **A.7** | Físicos | 14 | Perímetro, acessos físicos, equipamento, datacenter, mídia |
| **A.8** | Tecnológicos | 34 | Acesso lógico, cripto, dev seguro, redes, malware, backup, log, vulnerability |

Cláusulas obrigatórias (4 a 10) definem o SGSI e exigem evidência de PDCA (Plan-Do-Check-Act). Em concursos públicos PT é referencial recorrentemente exigido `[CONFIRMAR — peso em concursos municipais 2025-2026]`.

## SoA — Statement of Applicability (template)

Por controlo Annex A, a Wire mantém uma row:

| Annex A | Designação curta | Aplicável? | Justificação (se N) | Controlo Wire que satisfaz | Evidência | Estado |
|---------|------------------|------------|----------------------|----------------------------|-----------|--------|
| A.5.1 | Policies for information security | Y | — | WIRE.POL.SEC.001 | Documento publicado, sign-off CTO 2026-01 | OK |
| A.5.7 | Threat intelligence | Y | — | CTRL-W-C-031 | Subscrição CSIRT.PT + feeds OSINT em Wazuh | OK |
| A.5.16 | Identity management | Y | — | CTRL-W-S-007 | Vault AppRole + audit log | OK |
| A.5.23 | Information security for cloud services | Y | — | CTRL-W-C-040 + 27017 | DPIA cloud (interno), SLA AWS reviewed | OK |
| A.5.25 | Assessment and decision on incidents | Y | — | Severity matrix | `wire-ir-multitenant/references/severity-matrix.md` | OK |
| A.5.30 | ICT readiness for business continuity | Y | — | CTRL-W-C-009 | Restore drill log, DR site `[CONFIRMAR]` | Parcial |
| A.6.1 | Screening | Y | — | CTRL-W-P-001 | Background check pré-contratação | OK |
| A.6.3 | Information security awareness, education and training | Y | — | CTRL-W-C-018 | LMS completion >95% staff | OK |
| A.7.4 | Physical security monitoring | N/A | Datacenter delegado a AWS (controlo do provider via ISO 27001 AWS) | — | Cert AWS arquivado | OK |
| A.8.5 | Secure authentication | Y | — | CTRL-W-S-007 + MFA SSO | Audit Vault + IdP logs | OK |
| A.8.9 | Configuration management | Y | — | CTRL-W-O-005 | Ansible + git versioning | OK |
| A.8.16 | Monitoring activities | Y | — | CTRL-W-O-010 | Wazuh + Zabbix dashboards | OK |
| A.8.24 | Use of cryptography | Y | — | CTRL-W-C-012 | Vault transit, TLS 1.2+, TDE | OK |
| A.8.25 | Secure development life cycle | Y | — | CTRL-W-C-014 | Pipeline SAST/DAST, code review | OK |
| A.8.28 | Secure coding | Y | — | CTRL-W-C-014 | Brakeman + RuboCop security cops | OK |
| A.8.29 | Security testing in development and acceptance | Y | — | CTRL-W-C-016 | DAST staging + penetration test anual `[CONFIRMAR]` | Parcial |

Lista acima é amostra — SoA completo tem 93 rows e fica em `secret/data/compliance/iso27001-soa.json` versionado.

## Mapping CTRL-W-* → Annex A controls

| Controlo Wire | Annex A coberto | Tipo cobertura |
|---------------|------------------|-----------------|
| CTRL-W-S-001 (perímetro Fortigate) | A.8.20, A.8.21, A.8.22 | Directa |
| CTRL-W-S-007 (Vault AppRole TTL ≤30min) | A.5.15, A.5.16, A.5.17, A.8.5 | Directa |
| CTRL-W-S-012 (SSH CA TTL ≤15min) | A.5.17, A.8.5 | Directa |
| CTRL-W-S-015 (Audit Vault → Wazuh) | A.8.15, A.8.16 | Directa |
| CTRL-W-T-003 (PostgreSQL RLS per-tenant) | A.5.12, A.8.3, A.8.4 | Directa |
| CTRL-W-T-007 (Tenant key per-NIPC via Vault transit) | A.8.24 | Directa |
| CTRL-W-O-005 (Capistrano deploy com gate) | A.8.32 (change management) | Directa |
| CTRL-W-O-010 (Wazuh+Fortigate+Zabbix correlation) | A.8.15, A.8.16, A.5.7 | Directa |
| CTRL-W-C-007 (Procedimento IR documentado) | A.5.24, A.5.25, A.5.26, A.5.27 | Directa |
| CTRL-W-C-009 (BC plan testado) | A.5.29, A.5.30, A.8.13, A.8.14 | Parcial — DR drill ainda incompleto |
| CTRL-W-C-018 (Formação anual obrigatória) | A.6.3 | Directa |
| CTRL-W-C-020 (MFA obrigatório staff) | A.8.5 | Directa |

### Sample mapping detalhado

**CTRL-W-S-007 (Vault AppRole token TTL ≤30min) ↔ ISO Annex A 5.16 (Identity management) + A 8.5 (Secure authentication).**

A.5.16 exige "ciclo de vida completo de identidades" (provisioning, periodic review, deprovisioning). A.8.5 exige "secure authentication procedures with strong factors". Implementação Wire: AppRole com TTL curto (15-30 min consoante subagent) força re-autenticação periódica (provisioning periódico implícito); secret-id rotation invalida tokens activos (deprovisioning imediato); audit log Vault `auth/approle/login` regista todas as autenticações com `entity_id`, `role_id`, IP origem, em socket file device → Wazuh.

Evidência disponível:
- `vault-policies.hcl` (HCL policies versionadas em git, code review obrigatório).
- Wazuh dashboard "Vault Auth Events" (rule_id 100200-100299 Wire-custom).
- `~/.wire/log/approvals.log` (operator-initiated approvals N1/N2/N3).
- Saída de `vault list auth/approle/role/` mostrando 7 AppRoles activos.

**Gap identificado:** formal periodic access review process ainda não documentado (controlo A.5.18 — Access rights). Proposta: revisão trimestral via `/wire-tenant-audit --access-review` + sign-off CISO. `[CONFIRMAR — calendarização 2026 Q3]`

**CTRL-W-T-003 (PostgreSQL RLS per-tenant) ↔ A.5.12 (Classification of information) + A.8.3 (Information access restriction) + A.8.4 (Access to source code).**

A.8.3 exige "restrição de acesso a informação de acordo com a política de controlo de acesso temática". Wire implementa RLS PostgreSQL: cada query inclui `SET app.current_tenant = '<NIPC>'`; políticas RLS em todas as tabelas multi-tenant filtram por `tenant_id = current_setting('app.current_tenant')`. Tentativa de bypass (`SET app.current_tenant = NULL` ou role com `BYPASSRLS`) gera alerta Wazuh rule_id 100020-100029.

Evidência:
- Queries SQL de validação em `wire-tenant-isolation/references/queries-evidencia.md`.
- DDL das policies versionado em `db/policies/*.sql`.
- Alertas Wazuh em últimos 12m: 0 bypasses confirmados, X falsos positivos `[CONFIRMAR]`.

## Gaps identificados — postura Wire vs requisitos ISO

| Annex A | Gap | Plano remediação | Prazo |
|---------|-----|-------------------|-------|
| A.5.18 | Periodic access review formalizado | Implementar revisão trimestral | 2026 Q3 `[CONFIRMAR]` |
| A.5.30 | DR drill multi-region completo | Drill end-to-end com restore em DR site | 2026 Q4 `[CONFIRMAR]` |
| A.8.29 | Penetration testing externo anual | Contratar pentest 2026 | 2026 Q3 |
| A.6.7 | Remote working policy formalizada | Política WFH documentada + sign-off | 2026 Q3 |
| A.5.20 | Information security in supplier agreements | Anexo segurança standard em contratos parceiros | 2026 Q2 |
| A.8.32 | Change management — emergency changes documented separately | Procedimento emergency change formalizado | 2026 Q2 |
| A.5.7 | Threat intelligence — feeds estruturados além do CSIRT.PT | Subscrição feed MISP comunidade SaaS PT | 2026 Q4 |

## Cláusulas 4-10 (SGSI obrigatório)

| Cláusula | Requisito | Evidência Wire |
|----------|-----------|----------------|
| 4. Contexto da organização | Stakeholders, escopo SGSI | Documento WIRE.SGSI.001 §1 |
| 5. Liderança | Política assinada, papéis, comunicação | WIRE.POL.SEC.001 + RACI WIRE.MTZ.SEC.006 |
| 6. Planeamento | Risco, oportunidades, objectivos SGSI | Risk register `secret/data/compliance/risk-register.json` |
| 7. Suporte | Recursos, competência, comunicação, documentação | LMS, CMDB documento controlado |
| 8. Operação | Planeamento operacional, gestão risco operacional, controlos | Operação 24x7 documentada |
| 9. Avaliação desempenho | Monitorização, auditoria interna, revisão direcção | Auditoria interna anual + revisão direcção semestral |
| 10. Melhoria | Não-conformidades, melhoria contínua | Ticket tracker de NC + plano CAPA |

## Próximos passos (visão SGSI)

1. **Auditoria interna 2026** — `[CONFIRMAR — calendarização Q3]`. Output esperado: ≥ 92% conformidade.
2. **Pre-audit externa** — coaching pré-certificação, recomendado Q3 2026.
3. **Auditoria de certificação** — `[CONFIRMAR — fornecedor seleccionado]`, target Q4 2026.
4. **Manutenção (3 anos):** vigilância anual + recertificação tri-anual.

---

## Fontes

- **ISO/IEC 27001:2022** — Information security management systems — Requirements.
- **ISO/IEC 27002:2022** — Information security controls (guidance complementar).
- **ISO/IEC 27017:2015** — Code of practice for information security controls based on ISO/IEC 27002 for cloud services.
- **ISO/IEC 27018:2019** — Code of practice for protection of PII in public clouds acting as PII processors.
- WIRE.POL.SEC.001, WIRE.SGSI.001, WIRE.MTZ.SEC.006 (referências internas).

## Como usar este template em sessão Claude Code

A skill `wire-compliance-provider` invoca este template em prep de auditoria ISO, em resposta a questionário de cliente que peça mapping ISO 27001, ou em gap analysis. Esperar como output: SoA delta com controlos novos/alterados + lista de evidência a actualizar + gaps priorizados. O user revê e aprova; auditoria externa é sempre humana.

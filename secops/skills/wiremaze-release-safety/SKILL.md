---
name: wiremaze-release-safety
description: Gate de segurança e qualidade antes de qualquer deployment em produção dos produtos SaaS Wiremaze (wirePAPER, wireDESK, wireSTUDIO, wireCITYapp, wireVOICE, wireDOCS, wireMEET, wireFORMS, wireRECRUIT, wireCONNECT). Usa esta skill sempre que se pede um "release gate", validação pré-deploy, checklist de release, decisão go/no-go, revisão de impacto multi-tenant de uma alteração, ou avaliação de risco de uma migração de DB/schema. Dispara em "/wiremaze-release-gate", "vamos fazer deploy", "release v2.3 está pronto?", "validar release", "go/no-go", "migration safety", "rollback plan", "canary".
---

# Wiremaze · Release Safety Gate

A Wiremaze hospeda dados de >170 municípios — um deployment defeituoso degrada simultaneamente todos. Esta skill formaliza o gate que antecede qualquer entrega em produção.

## Quando aplicar

- Antes de qualquer release em produção (mesmo hotfix).
- Antes de migração de schema de DB ou rotação de dados.
- Antes de mudança de versão major de dependência (base image, runtime, framework).
- Quando se introduz nova feature com tocco em dados de tenant.
- Antes de promover canary 5% → 25% → 100%.

## Princípios

- **Nenhum release a 100% sem canary multi-tenant prévio.** Mínimo 24h em canary com 5–10% do tráfego cobrindo tenants representativos.
- **Migrations destrutivas têm que ter rollback testado.** Não basta script de up; tem que existir script de down validado em pré-prod.
- **Toda a feature que toca em dados de tenant entra atrás de feature flag.** Permite "deligar" rapidamente sem rollback de código.
- **A engenharia não aprova o seu próprio release.** Aprovação cruzada: dev + SRE + SecOps.

## Checklist (CTRL-W-R-001..018)

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

## Workflow

1. **Inputs.** Recebe release ID, link ao MR/PR, lista de changes resumida.
2. **Recolha automatizada.** Subagent `wiremaze-deploy-01` puxa do GitLab/GitHub: CI status, SBOM, SAST, secrets scan, cosign.
3. **Análise de impacto.** Para cada change, classifica:
   - Toca em dados de tenant? (sim → flag obrigatória)
   - Schema migration? (sim → rollback obrigatório)
   - API breaking? (sim → comunicação obrigatória + notice ao cliente)
   - Toca em endpoint de autenticação ou cifra? (sim → revisão SecOps + DPO)
4. **Aplicação dos controlos.** CTRL-W-R-001..018; produz checklist completo.
5. **Decisão.**
   - Todos os bloqueantes OK → **GO** para canary 5%.
   - Algum bloqueante falha → **NO-GO**, identifica acção correctiva.
   - Avaliativo falha → **GO com condições**, regista ressalvas.
6. **Plano de promoção.**
   - 5% canary × 24h.
   - Se métricas dentro de baseline (latência, error rate, tickets de suporte) → 25% × 24h.
   - Repetir → 50% × 12h → 100%.
   - Promoção exige verificação humana em cada degrau (não-automatizada).
7. **Output estruturado**:

   ```
   Release: <id> @ <SHA>
   Produto: <wire*>
   Tipo: <feature | bugfix | hotfix | migration>
   
   Checklist: X/Y bloqueantes OK, X/Y avaliativos OK
   Decisão: {GO | GO_COM_CONDICOES | NO-GO}
   
   Plano de promoção: canary <%> em <tenants> por <tempo>
   Plano de rollback: <tempo alvo>, <procedimento>
   
   Riscos identificados: <lista>
   Acções pendentes (se NO-GO): <lista>
   ```

## Falhas comuns que esta skill apanha

- Migration sem rollback.
- Nova feature sem feature flag.
- Update de dependência com CVE no path crítico.
- Container sem assinatura ou com base image desactualizada.
- Mudança em endpoint de auth sem revisão SecOps.
- Promoção directa 0→100% sem canary.

## Limites

- Não substitui o code review. Assume que MR/PR já foi revisto.
- Não corre os testes; valida o **resultado** dos testes.
- Não decide go/no-go autonomamente em casos com bloqueante por justificar — escala para humano.

## Referências

- `references/canary-plan-template.md` — template para definir tenants representativos.
- `references/rollback-template.md` — template de plano de rollback.
- `references/changelog-template.md` — formato de changelog para clientes.
- WMZ.PRC.IRT.005 — entrada para incidentes pós-release.

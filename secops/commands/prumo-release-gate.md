---
name: prumo-release-gate
description: Release gate Wire — aplica CTRL-W-R-001..018 a um release e produz decisão GO / GO_COM_CONDICOES / NO-GO com plano de canary.
argument-hint: <release-id-ou-tag>
---

Release gate para: **$ARGUMENTS**

Activa a skill `prumo-release-safety` e o subagent `prumo-deploy-01`.

Sequência:
1. Resolve `$ARGUMENTS` para o release/tag concreto no GitLab/GitHub.
2. Puxa do CI/CD: SBOM, SAST, SCA, secrets scanner, cosign signature, status de testes.
3. Analisa as changes:
   - Toca em dados de tenant? → exige feature flag (CTRL-W-R-010).
   - Tem schema migration? → exige rollback testado em pré-prod (CTRL-W-R-009).
   - Tem API breaking? → exige changelog e notice ao cliente (CTRL-W-R-011).
   - Toca em auth/cifra? → exige revisão SecOps + DPO antes de prosseguir.
4. Aplica os controlos `CTRL-W-R-*` — para cada um, evidencia OK / falha.

   **Ler as definições primeiro:** `${CLAUDE_PLUGIN_ROOT}/ctrl-w-inventario.md`, secção `CTRL-W-R-*`. São 18 controlos com tipo e fonte de verificação (12 Bloqueantes, 5 Bloqueantes-se-aplicável, 1 Avaliativo) — e o tipo decide o veredicto, por isso não pode ser adivinhado. Até 2026-08-02 este passo citava o intervalo `001..018` sem apontar para definição nenhuma. **Se o inventário não for legível, dizê-lo e parar**; um release gate que inventa os seus próprios critérios é pior do que gate nenhum.
5. Calcula tenants representativos para canary (mix por tamanho, produto, geografia) — proposta de 5–10% inicial.
6. Define plano de promoção (5% × 24h → 25% × 24h → 50% × 12h → 100%).
7. Define plano de rollback (RPO/RTO, procedimento, responsável).
8. Decisão:
   - Todos bloqueantes OK → **GO** para canary 5%.
   - Bloqueante falha → **NO-GO** com acção correctiva específica.
   - Avaliativo falha → **GO_COM_CONDICOES** com ressalvas.

Output estruturado em MD com decisão clara no topo. Aprovação humana cruzada (dev + SRE + SecOps) é registada antes de qualquer execução.

**Importante:** este command nunca executa o deployment. Produz o gate; a execução é manual ou via CD pipeline disparado por humano.

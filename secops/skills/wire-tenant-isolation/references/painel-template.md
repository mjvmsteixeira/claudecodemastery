# Painel — Vista Tabular Multi-Tenant × Controlos

**Skill:** `wire-tenant-isolation` · **Versão:** v0.4.0 · **Última actualização:** 2026-05-19

> Template referenciado pela skill `wire-tenant-isolation`. Vista consolidada de todos os
> munícipios contra os 16 controlos CTRL-W-T-*. Pensado para output ASCII compacto navegável em
> terminal. Marca `[CONFIRMAR]` campos Wire-specific.

## Estrutura do painel

Linha header com IDs de controlo + uma linha por tenant + footer com agregados.

Colour-coding (ANSI):
- **Verde (5):** ✓ PASS — controlo cumprido sem reservas.
- **Amarelo (3-4):** ⚠ WARN — gap reduzido, plano formal.
- **Vermelho (1-2):** ✗ FAIL — acção urgente.
- **Cinzento (N/A):** controlo não-aplicável (ex: produto não contratado).

## Exemplo de painel

```
=== Wire · Painel de Isolamento Multi-Tenant · 2026-05-19T09:00:00Z ===

NIPC        Município           T001 T002 T003 T004 T005 T006 T007 T008 T009 T010 T011 T012 T013 T014 T015 T016 Score
─────────── ──────────────────  ──── ──── ──── ──── ──── ──── ──── ──── ──── ──── ──── ──── ──── ──── ──── ──── ─────
501234567   Caminha             5    5    4    5    5    5    4    3    5    3    5    4    5    4    5    5    72/80 91%
502345678   Almada              5    5    5    5    5    5    5    4    5    3    5    5    5    5    5    5    77/80 96%
503456789   Cantanhede          5    5    3    5    4    5    4    3    5    3    5    3    5    3    5    5    68/80 85%
504567890   Esposende           5    5    4    5    5    5    4    3    5    3    5    4    5    4    5    5    72/80 91%
505678901   Coimbra             4    5    5    4    5    5    5    4    5    3    5    5    4    5    5    5    74/80 93%
...

─────────── ──────────────────  ──── ──── ──── ──── ──── ──── ──── ──── ──── ──── ──── ──── ──── ──── ──── ──── ─────
Total                            4.92 5.00 4.20 4.95 4.80 5.00 4.40 3.40 5.00 3.00 5.00 4.20 4.80 4.20 5.00 5.00 71.8/80 90%
Min                              3    5    1    3    3    5    2    2    3    3    5    1    3    2    5    5    63/80 79%
Max                              5    5    5    5    5    5    5    5    5    5    5    5    5    5    5    5    79/80 99%

Tenants total: 174   PASS (≥90%): 142   WARN (75-89%): 28   FAIL (<75%): 4
```

## Drill-down — vista por controlo

Para qualquer controlo individual, painel detalhado mostra distribuição:

```
=== CTRL-W-T-010 — Network policy isolam tenant traffic — 2026-05-19 ===

Score 5 (PASS):    18 tenants  ████░░░░░░░░░░░░░░░░  10.3%
Score 4 (PASS):    32 tenants  ████████░░░░░░░░░░░░  18.4%
Score 3 (WARN):    98 tenants  ████████████████████  56.3%
Score 2 (FAIL):    21 tenants  █████░░░░░░░░░░░░░░░  12.1%
Score 1 (FAIL):     5 tenants  █░░░░░░░░░░░░░░░░░░░   2.9%

Mediana: 3 — gap sistémico em WAF per-tenant rules.
Acção: roadmap Q4 2026 — WAF Fortigate per-tenant ruleset.
```

## Drill-down — vista por tenant

```
=== Município de Caminha (NIPC 501234567) — Auditoria isolamento — 2026-05-19 ===

Score global: 72/80 (91%) — POSTURA SÓLIDA

Detalhe:
  CTRL-W-T-001 RLS policies               5 ✓  Última verificação: 2026-05-18
  CTRL-W-T-002 Sem BYPASSRLS              5 ✓  —
  CTRL-W-T-003 Tenant key transit         4 ⚠  Rotation atrasada 12d (próxima janela: 2026-05-25)
  CTRL-W-T-004 Vault policy               5 ✓  —
  CTRL-W-T-005 Cache namespace            5 ✓  —
  CTRL-W-T-006 Storage isolado            5 ✓  —
  CTRL-W-T-007 Jobs tenant_id             4 ⚠  1 legacy job a refactorizar (TICKET-WIRE-XXX)
  CTRL-W-T-008 Audit log export           3 ⚠  Não self-service ainda — pedido manual
  CTRL-W-T-009 Backup restorable          5 ✓  Drill 2026-04 OK
  CTRL-W-T-010 Network policy             3 ⚠  WAF não per-tenant — gap sistémico
  CTRL-W-T-011 IdP scope                  5 ✓  —
  CTRL-W-T-012 Key rotation               4 ⚠  Calendar atrasado 5d em CI
  CTRL-W-T-013 Audit Vault visível        5 ✓  Wazuh dashboard active
  CTRL-W-T-014 Offboarding plan           4 ⚠  Documentado, não testado em sandbox
  CTRL-W-T-015 DPA assinado               5 ✓  Renovado 2026-02
  CTRL-W-T-016 Cross-tenant audit         5 ✓  —

Top 3 acções:
  1. CTRL-W-T-008 — implementar self-service export    [Q3 2026, OWNER product]
  2. CTRL-W-T-010 — WAF rules per-tenant               [Q4 2026, OWNER SecOps]
  3. CTRL-W-T-014 — testar offboarding em sandbox     [Q3 2026, OWNER SecOps]
```

## Vista de tendência (histórica)

```
=== Score global Wire — Tendência 12 meses ===

100 ┤
 95 ┤                                                  ●─────●
 90 ┤                              ●─────●─────●─────●
 85 ┤              ●─────●─────●
 80 ┤   ●─────●
 75 ┤
 70 ┤
    └────────────────────────────────────────────────────────
    2025-06  -09  -12  2026-03  -05

Notas:
- Set 2025 (jump +5pts): introdução de RLS systematic audit (CTRL-W-T-001).
- Mar 2026 (jump +3pts): roll-out de tenant keys Vault transit (CTRL-W-T-003, T-012).
- Próximo alvo (Q4 2026): 95% via CTRL-W-T-010 WAF per-tenant.
```

## Exportação

O painel é exportável em:
- **ASCII** (default — terminal).
- **CSV** (`--export=csv`) — para análise em planilha.
- **Markdown** (`--export=md`) — para colar em comunicação interna.
- **JSON** (`--export=json`) — para integração com tickets / dashboards externos.

Cada export é arquivado em `secret/data/compliance/audits/<YYYY-MM>/painel.<ext>` e referenciado
em `~/.wire/log/audit-runs.log`.

## Frequência recomendada

- **Diária:** automated check de regressions (compare to baseline). Triggers alerta se algum
  controlo cai 2+ pontos em qualquer tenant.
- **Semanal:** revisão SecOps (top 10 piores tenants por score).
- **Mensal:** comité direcção (vista trend + acções planeadas vs realizadas).
- **Trimestral:** publicação para clientes em sumário sanitizado (sem NIPCs detalhados de
  outros munícipios).

## Anti-patterns

- **Não usar média sem mediana.** Um tenant com score 1 (outlier) puxa média mas mediana revela
  postura típica. Reportar ambos.
- **Não esconder FAILs.** Comunicação a leadership inclui top 5 piores tenants nomeados.
- **Não confundir score 5 com "sem risco".** 5 = controlo verificado cumprido; risco residual
  existe sempre (ex: regressão futura).
- **Não esquecer N/A.** Tenants que não contratam produto X têm N/A para controlos específicos
  desse produto — N/A ≠ 5 para efeitos de score.

---

## Fontes

- **WIRE.PRC.AUD.004** — Procedimento de Auditoria.
- **WIRE.MTZ.SEC.006** — Matriz RACI + CTRL-W-*.
- **ISO/IEC 27017:2015** §CLD.6.3 — Customer separation.
- **CSA CCM v4** — domain DSP, IAM, IVS.

## Como usar este template em sessão Claude Code

A skill `wire-tenant-isolation` invoca este template em `/wire-tenant-audit --painel` (vista global) ou `/wire-tenant-audit <municipio>` (drill-down individual). Esperar como output: ASCII formatado pronto para revisão em terminal ou export. O user escolhe granularidade — global, per-control, per-tenant, ou tendência. Histórico arquivado automaticamente para diffs entre runs.

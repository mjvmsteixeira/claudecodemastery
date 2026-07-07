---
name: prumo-compliance-snapshot
description: Snapshot trimestral de conformidade Wire cross-framework (NIS2, RGPD, ISO 27001/27017/27018, ENS, AI Act). KPIs, lacunas, próximas auditorias.
---

Snapshot de conformidade Wire para o trimestre actual.

Activa a skill `prumo-compliance-provider` e o subagent `prumo-compliance-01`.

Sequência:
1. Determina trimestre actual (YYYY-Qn).
2. Para cada framework abaixo, calcula cobertura % com base em CTRL-W-* mapeados:
   - NIS2 / DL 20/2025 (Wire fornecedor crítico)
   - RGPD Art. 28 (Wire subcontratante)
   - ISO/IEC 27001:2022
   - ISO/IEC 27017:2015
   - ISO/IEC 27018:2019
   - ENS (Espanha)
   - AI Act (UE 2024/1689)
3. Identifica lacunas por severidade (Crítica / Alta / Média / Baixa).
4. Lista próximas auditorias internas e externas com prazos.
5. Produz painel ASCII compacto (template em skill).
6. Gera DOCX formal via Cowork `ai-rep-01` em `/shared/reports/output/prumo-compliance-snapshot-<YYYY-Qn>.docx`.

Output: painel ASCII no chat + ligação para o DOCX final.

Se existirem lacunas críticas, ressalta no topo com `[!] ACÇÃO IMEDIATA:` e propõe responsável + prazo.

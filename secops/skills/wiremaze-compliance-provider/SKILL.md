---
name: wiremaze-compliance-provider
description: Conformidade regulamentar da Wiremaze enquanto fornecedora SaaS de eGovernment local — perspectiva de fornecedor crítico NIS2 (DL 20/2025) e subcontratante RGPD (Art. 28). Usa esta skill para auditoria de conformidade, mapping de controlos a frameworks, preparação de evidência para auditor externo, resposta a questionário de cliente, snapshot anual de compliance, gap analysis face a ISO 27001 ou ENS, ou redacção de Anexo II do contrato de subcontratação. Dispara em "compliance snapshot", "Art. 28", "questionário do cliente", "evidência ISO", "NIS2 fornecedor", "DPIA", "subcontratante", "mapeamento ENS".
---

# Wiremaze · Conformidade enquanto Fornecedor SaaS

A Wiremaze opera num ponto regulatório triplo: **(a)** ela própria como fornecedor crítico de entidades essenciais NIS2, **(b)** subcontratante de dados pessoais por conta dos municípios (RGPD Art. 28), **(c)** sujeita a referenciais técnicos de mercado (ISO 27001, ENS, CSA STAR) frequentemente exigidos em concursos públicos.

## Frameworks de referência

| Framework | Aplicação à Wiremaze | Evidência típica |
|-----------|----------------------|------------------|
| **NIS2 / DL 20/2025** | Fornecedor crítico de entidades essenciais (municípios). Cooperação obrigatória, notificação em 24h | Política IR, runbooks, registo de notificações |
| **RGPD Art. 28** | Subcontratante por conta de cada município | Contratos de subcontratação, registo de tratamentos, DPIA, Anexo II |
| **Lei n.º 58/2019** | Execução nacional RGPD | Documentação DPO Wiremaze, formação, registo |
| **RJSC (DL 65/2021)** | Quadro geral cibersegurança | Inventário, gestão de risco, formação |
| **AI Act (UE 2024/1689)** | Aplicável se houver IA no produto (ex: "Maria" assistente virtual) | Classificação de risco, transparência, registo |
| **ISO/IEC 27001:2022** | Referencial preferido em concursos | Manual SGSI, declaração aplicabilidade, auditoria externa |
| **ISO/IEC 27017:2015** | Controlos específicos cloud (provider) | Declaração de aplicabilidade |
| **ISO/IEC 27018:2019** | PII em cloud (processor) | Declaração de aplicabilidade |
| **ENS (Esquema Nacional Seguridad, Espanha)** | Se exportarem para Espanha | Categorização, mapeamento |
| **CSA STAR** | Self-assessment ou Level 1/2 | CAIQ preenchido |

## O que esta skill produz

### 1. Mapping cross-framework

Dada uma lista de controlos internos Wiremaze (CTRL-W-*), produz tabela cruzada para cada framework, evidenciando:

- Cobertura directa (controlo X cobre cláusula Y).
- Cobertura parcial (com plano).
- Lacuna (descrita + plano).

### 2. Snapshot trimestral de conformidade

Output ASCII compacto:

```
== Wiremaze · Compliance Snapshot · YYYY-Qn ==
Framework          Cobertura  Última auditoria   Próxima  Estado
NIS2 (DL 20/2025)  92%        2026-02 (interna)  2026-08  OK
RGPD Art. 28       98%        2026-03 (DPO)      2026-09  OK
ISO 27001:2022     85%        2025-11 (externa)  2026-11  Em plano
ISO 27017:2015     78%        N/A                2026-09  Em desenvolvimento
ENS (ES)           45%        N/A                2027-Q1  Roadmap
AI Act             62%        2026-04 (interno)  2026-10  Em análise

Lacunas críticas:    0
Lacunas altas:       3 (ver detalhe em /shared/reports/compliance-2026-Qn.md)
Lacunas médias:      11
Próximos marcos:     Auditoria externa ISO 27001 (Nov 2026)
```

### 3. Resposta a questionários de cliente

Quando o município X envia questionário (típico em concursos), esta skill produz a primeira versão de resposta, mapeada às respostas oficiais já validadas, com identificação clara de questões que exigem revisão humana (DPO Wiremaze, jurídico).

### 4. Evidência Art. 28 para inclusão no contrato

Produz Anexo II / "Termos do subcontratante" com:

- Categorias de dados pessoais tratados.
- Finalidades.
- Categorias de titulares (munícipes, funcionários, candidatos).
- Medidas técnicas e organizativas concretas.
- Localização do tratamento (residência de dados).
- Sub-subcontratantes autorizados (lista de fornecedores Wiremaze: cloud provider, CDN, email transactional, etc.).
- Procedimentos de notificação de violação.

### 5. DPIA (Avaliação de Impacto sobre Protecção de Dados)

Por produto wire*, a DPIA documenta:

- Necessidade e proporcionalidade do tratamento.
- Riscos para direitos e liberdades.
- Medidas de mitigação.
- Consulta ao DPO Wiremaze e, quando aplicável, ao DPO do município.

## Workflow

1. **Determina escopo.** Framework alvo, produto wire*, cliente, prazo.
2. **Reúne evidência.** Pull do registo de tratamentos, política, logs Wazuh agregados, certificados, contratos.
3. **Aplica framework.** Cláusula a cláusula, regista cobertura.
4. **Identifica gaps.** Severidade + acção + responsável + prazo.
5. **Output formal.** DOCX (via Cowork `ai-rep-01`) para entrega externa, MD/JSON para uso interno.

## Princípios

- **Mapping é vivo.** Cada novo controlo ou alteração de framework actualiza a matriz.
- **Não inventa cobertura.** Lacuna identificada é lacuna registada, com plano.
- **Subcontratantes secundários documentados** com mesma exigência (cloud, CDN, antivírus, email).
- **Mudança de jurisdição (sub-subcontratante fora EU) requer salvaguardas** documentadas (SCC, decisão de adequação).

## Limites

- Não substitui auditor externo certificado.
- Resposta a questionário cliente requer revisão humana antes de envio.
- DPIA final é responsabilidade conjunta com DPO Wiremaze + DPO do município.

## Referências

- `references/mapping-nis2.md` — controlos Wiremaze ↔ NIS2 (a criar).
- `references/mapping-iso27001.md` — controlos Wiremaze ↔ ISO 27001 Anexo A (a criar).
- `references/anexoII-template.md` — template de Anexo II do contrato.
- `references/dpia-template.md` — template de DPIA por produto.
- `references/caiq-pre-filled.md` — CAIQ pré-preenchido para entrega rápida.
- DL 20/2025, RGPD, ISO 27001:2022.

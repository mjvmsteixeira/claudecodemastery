# Template — Notificação de Incidente ao CNCS

**Skill:** `prumo-ir-multitenant` · **Versão:** v0.4.0 · **Última actualização:** 2026-07-07

> Template referenciado pela skill `prumo-ir-multitenant`. Notificação ao CNCS (Centro
> Nacional de Cibersegurança) enquanto Wire é fornecedor de serviço crítico ao abrigo da
> NIS2 (transposta pelo DL 20/2025). Mapeia os campos do incidente para o formulário CNCS.
> Prazos NIS2: **alerta inicial ≤ 24h**, **notificação completa ≤ 72h**, **relatório final ≤ 1 mês**.
> Marca `[CONFIRMAR]` os campos que dependem de decisões Wire-specific ainda não tomadas.

## Faseamento NIS2 (Art. 23)

| Fase | Prazo | Conteúdo mínimo |
|------|-------|-----------------|
| Alerta inicial | T+24h | Suspeita de incidente, indícios de acto ilícito/transfronteiriço |
| Notificação | T+72h | Avaliação inicial de severidade, impacto, indicadores de compromisso |
| Relatório final | T+1 mês | Causa-raiz, medidas aplicadas, impacto transfronteiriço (se aplicável) |

## Mapping campo-a-campo (incidente → formulário CNCS)

```markdown
# Notificação CNCS — [INCIDENT_ID]

## Identificação da entidade
- **Entidade notificante:** Wire [CONFIRMAR: razão social completa]
- **NIF:** [NIF_WIRE]
- **Sector:** Prestador de serviços digitais / fornecedor crítico
- **Ponto de contacto:** [NOME] · [EMAIL] · [TELEFONE]

## Identificação do incidente
- **Referência interna:** [INCIDENT_ID]
- **Data/hora de detecção (UTC):** [DETECTED_AT]
- **Data/hora de início estimado (UTC):** [STARTED_AT]
- **Estado actual:** [CONFIRMAR: Em curso / Contido / Resolvido]
- **Fase da notificação:** [Alerta inicial / Notificação / Relatório final]

## Caracterização
- **Tipo de incidente:** [CONFIRMAR: intrusão / indisponibilidade / fuga de dados / supply-chain / ...]
- **Vector (suspeito):** [VECTOR]
- **Sistemas/serviços afectados:** [LISTA_WIRE_PRODUCTS]
- **Empresas cliente afectadas:** [N_EMPRESAS] (NIFs: [LISTA_NIFS])
- **Indícios de acto ilícito:** [CONFIRMAR: Sim / Não / Indeterminado]
- **Impacto transfronteiriço:** [CONFIRMAR: Sim / Não]

## Avaliação de impacto
- **Severidade:** [SEVERITY]
- **Titulares/utilizadores afectados (estimativa):** [N_AFECTADOS]
- **Duração da indisponibilidade (se aplicável):** [DURACAO]

## Medidas
- **Contenção:** [MEDIDAS_CONTENCAO]
- **Remediação:** [MEDIDAS_REMEDIACAO]
- **Indicadores de compromisso (IoC):** [IOCS]
```

## Notas
- Derivar TODOS os campos factuais da timeline (`${PRUMO_FORENSICS_DIR}/[INCIDENT_ID]/timeline.md`).
- Não incluir dados pessoais de titulares na notificação CNCS além do estritamente necessário.
- Preservar cópia submetida + comprovativo no case file (`.../comms/cncs/`).

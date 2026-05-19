# Distribuição e Classificação de Informação de Incidente

**Skill:** `wire-ir-multitenant` · **Versão:** v0.4.0 · **Última actualização:** 2026-05-19

> Template referenciado pela skill `wire-ir-multitenant`. Baseado em FIRST TLP v2.0 (Traffic
> Light Protocol), RGPD Art. 33-34, NIS2 DL 20/2025 Art. 23 e 26. Adapta-se ao contexto da
> sessão; marca `[CONFIRMAR]` campos que dependem de decisões Wire-specific ainda não tomadas.

Um mesmo incidente origina **múltiplos artefactos de comunicação** com classificações distintas
e audiências distintas. O risco é desalinhar — comunicar a média antes do CNCS, ou partilhar
detalhe técnico com uma audiência que não tem need-to-know. Esta referência define a matriz.

## TLP-style classification

Wire adopta TLP v2.0 com refinamentos para o contexto multi-tenant:

| Etiqueta | Significado | Wire usage |
|----------|-------------|------------|
| **TLP:RED** | Não shareable fora do receptor original. | Bridge CSIRT internal, evidência forense bruta, hipóteses não-confirmadas. |
| **TLP:AMBER+STRICT** | Share dentro da organização only, need-to-know. | Detalhe técnico do vector, IoCs em forma cruamente exploitable, post-mortem interno. |
| **TLP:AMBER** | Share dentro da organização + supplier chain limited. | Sumário factual partilhado com parceiros relevantes (CDN, IdP, hosting). |
| **TLP:GREEN** | Community share — peers da mesma indústria, audiências de confiança. | IoCs sanitizados, lessons learned em comunidade SecOps PT (CNCS-CERT.PT shared). |
| **TLP:CLEAR** | Público. | Comunicado de imprensa, status page, post-mortem público. |

A etiqueta vai **no nome do ficheiro** e **no header do documento**:

```
ir-2026-0519-001-postmortem-AMBER+STRICT.md
```

## Audiências Wire-specific

| Audiência | Definição | Canal típico |
|-----------|-----------|--------------|
| **interno-secops** | Equipa SecOps Wire (4-6 pessoas) `[CONFIRMAR — composição actual]` | Bridge CSIRT, Slack `#secops-incidents` |
| **interno-wire** | Toda a Wire (eng, sales, leadership) | Email all-hands, leadership briefing |
| **cliente-afectado** | Munícipios com impacto directo confirmado | Email DPO ↔ DPO + canal contratado por município |
| **clientes-nao-afectados** | Restantes 170+ munícipios sem impacto detectado | Newsletter SecOps trimestral; ad-hoc se relevante |
| **CNCS** | Centro Nacional de Cibersegurança (autoridade competente NIS2 PT) | Plataforma CNCS-CERT.PT (formulário electrónico) |
| **CNPD** | Comissão Nacional de Protecção de Dados (autoridade RGPD PT) | Formulário CNPD via portal + via DPO de cada município responsável |
| **parceiros** | Fornecedores críticos (Microsoft 365, AWS, telecom, CDN) | Account managers + suporte enterprise |
| **media** | Imprensa generalista e especializada | Sempre via Comms Wire; nunca directo de SecOps |

## Matriz severity × audience × autorização-de-divulgação

| Audiência | S1 prazo / obrigatório? | S2 prazo / obrigatório? | S3 | S4 |
|-----------|--------------------------|--------------------------|-----|-----|
| **interno-secops** | T+0 — sim | T+0 — sim | T+15 min — sim | Daily triage |
| **interno-wire** | T+30 min leadership; T+2 h all-hands se SaaS-wide | T+2 h leadership | Daily digest | — |
| **cliente-afectado** | ≤ 4 h — sim (RGPD Art. 33 §2) | ≤ 24 h — sim | ≤ 72 h se risco residual | — |
| **clientes-não-afectados** | T+24 h sumário (se SaaS-wide) | Opcional, próxima newsletter | — | — |
| **CNCS** | ≤ 24 h — **obrigatório** (DL 20/2025 Art. 23 §1) | Opcional; obrigatório se cross-border ou ≥ 1M utilizadores | Não-aplicável | — |
| **CNPD** | ≤ 72 h se PII envolvida — via DPO município (Wire apoia) | ≤ 72 h se PII envolvida | Opcional | — |
| **parceiros** | Conforme contrato — tipicamente T+2 h | Conforme contrato | Caso a caso | — |
| **media** | Sempre via Comms; **proibido** SecOps falar directo | Idem | Não-aplicável | — |

## Templates de comunicação por audiência

### 1. Cliente afectado — S1 (PT-PT formal)

`TLP:AMBER` — partilhar dentro da organização cliente, need-to-know.

```
Assunto: [URGENTE] Comunicação de incidente de segurança — [PRODUTO_WIRE]

Exmos. Senhores,

Na qualidade de subcontratante de tratamento de dados (RGPD Art. 28) e fornecedor
crítico da plataforma [PRODUTO_WIRE], a Wire comunica formalmente o seguinte incidente
de segurança que afecta os serviços contratados ao Município de [NOME_MUNICIPIO]
(NIPC [NIPC]):

DETECÇÃO:        [TIMESTAMP_UTC_DETECCAO]
NATUREZA:        [BREVE_DESCRICAO — disponibilidade / integridade / confidencialidade]
IMPACTO ACTUAL:  [DESCRICAO_IMPACTO_NO_CLIENTE]
DADOS PESSOAIS:  [SIM/NÃO — se sim, indicar categorias afectadas]
MITIGAÇÃO:       [ACÇÕES_JÁ_TOMADAS]
RESTABELECIMENTO ESTIMADO: [TIMESTAMP_OU_TBD]

A Wire activou o seu plano de resposta a incidentes e mantém canal directo com o
Encarregado de Protecção de Dados (DPO) do Município. A próxima comunicação será
enviada em [TIMESTAMP_PROXIMA_COMUNICACAO].

Em conformidade com o DL 20/2025 (transposição NIS2), a Wire procederá à notificação
ao Centro Nacional de Cibersegurança (CNCS) no prazo de 24 horas após a detecção.
Recordamos que o Município, enquanto entidade essencial, mantém a obrigação de
notificação autónoma ao CNCS no mesmo prazo.

Contacto operacional 24/7: [CANAL_CONTRATADO]
Encarregado de Protecção de Dados Wire: [NOME_DPO] · [EMAIL_DPO]

Com os melhores cumprimentos,
[NOME_RESPONSAVEL]
Coordenador SecOps · Wire
```

### 2. CNCS — Early Warning (PT-PT institucional)

`TLP:AMBER` — autoridade competente.

```
NOTIFICAÇÃO INICIAL DE INCIDENTE — DL 20/2025 ART. 23 §1

ENTIDADE NOTIFICANTE
  Designação:   Wire [CONFIRMAR — designação social completa]
  NIPC:         [NIPC_WIRE]
  Categoria:    Fornecedor crítico (Anexo I DL 20/2025, categoria 8 — serviços digitais)
  Contacto:     [DPO_NOME], [DPO_EMAIL], [DPO_TELEFONE]

INCIDENTE
  Referência interna:        wire-ir-[ID]
  Detecção:                  [TIMESTAMP_UTC]
  Início estimado:           [TIMESTAMP_UTC_OU_DESCONHECIDO]
  Estado actual:             [contido / em mitigação / em investigação]
  Classificação severity:    S1
  Natureza:                  [disponibilidade / integridade / confidencialidade / autenticidade]

IMPACTO TRANSVERSAL
  Entidades essenciais afectadas: [N] munícipios
  Serviços essenciais afectados:  [LISTA_PRODUTOS_WIRE]
  Estimativa utilizadores impactados: [N]
  Impacto transfronteiriço:       [SIM/NÃO — justificar]

NATUREZA TÉCNICA (preliminar)
  Vector suspeito:           [perímetro / interno / supply-chain / unknown]
  IoCs disponíveis:          ver anexo TLP:AMBER+STRICT (envio separado por canal seguro)

ACÇÃO EM CURSO
  [DESCRIÇÃO_FACTUAL_DAS_ACÇÕES]

PRÓXIMA ACTUALIZAÇÃO
  Submissão de notificação detalhada em conformidade com Art. 23 §2 (72h).
```

### 3. Interno-wire (neutro, factual)

`TLP:AMBER+STRICT` — leadership briefing.

```
SecOps Briefing — Incidente wire-ir-[ID]

Estado:    S1 / contido / em recuperação
Produtos:  [LISTA]
Tenants:   [N] munícipios afectados ([%] do total)
Vector:    [DESCRICAO_TECNICA_HIGH_LEVEL]
Mitigação: [SUMARIO_ACCOES]

Próximas decisões pendentes de leadership:
- [ITEM_1 — ex: comunicação pública via Comms?]
- [ITEM_2]

ETA closure: [TIMESTAMP_ESTIMADO]
```

### 4. Post-mortem público (sanitizado)

`TLP:CLEAR` — status page Wire.

Estrutura padrão: o que aconteceu (factual, sem culpa) · impacto (números, duração) · causa raiz · acções tomadas · acções preventivas futuras. **Nunca** publicar antes de:
1. Todos os clientes afectados terem sido notificados directamente.
2. CNCS ter recebido o report final (T+30 dias).
3. Aprovação Legal + Comms + CISO.

## Anti-patterns

- **Comunicar à media antes do cliente** — viola contrato e quebra confiança.
- **Publicar IoCs em TLP:CLEAR sem sanitização** — pode expor outros operadores a ataque dirigido.
- **Notificar CNCS sem informar leadership Wire** — viola RACI interno.
- **Usar nome de tenant em comunicação a outro tenant** — viola confidencialidade contratada.
- **Aguardar "certeza absoluta" para early warning CNCS** — o prazo de 24h é regulatório, não opcional. Notifica-se com a informação disponível, mesmo preliminar.

---

## Fontes

- **FIRST TLP v2.0** (Aug 2022) — Traffic Light Protocol.
- **NIS2 / DL n.º 20/2025** Art. 23 (notificação de incidentes), Art. 26 (cooperação).
- **RGPD (Regulamento UE 2016/679)** Art. 33 (notificação à autoridade), Art. 34 (comunicação ao titular).
- **Lei n.º 58/2019** — execução nacional RGPD.
- **ENISA Notification Schemes Reference** (2024).
- WIRE.PRC.IRT.005 — Procedimento IR Wire.

## Como usar este template em sessão Claude Code

A skill `wire-ir-multitenant` invoca este template quando o incidente passa da fase de contenção para a fase de comunicação. Esperar como output: lista de comunicações a preparar com audiência + prazo + template aplicável + estado (rascunho/aprovado/enviado). O user mantém aprovação final de cada comms — a sessão produz rascunhos parametrizados, nunca envia directamente.

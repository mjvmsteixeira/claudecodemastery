# Notificação ao CNCS · mapping e templates

> **Estado: rascunho operacional — o mais carente de validação dos cinco.**
> Estrutura-se sobre o modelo de três fases (alerta inicial / actualização / relatório final) que o
> `SKILL.md` fixa e que corresponde ao regime NIS2. **Os campos exactos do formulário do CNCS não
> foram verificados contra o portal oficial** e podem diferir. Antes do primeiro uso real:
> confirmar o formulário em vigor, os prazos aplicáveis à Wire enquanto fornecedor, e a articulação
> com a notificação que cada município faz enquanto entidade essencial. Validação obrigatória do
> Coordenador SecOps e do jurídico.

## Quem notifica o quê

Ponto que se presta a confusão e que convém ter claro antes do incidente:

- **Cada município** notifica o CNCS enquanto **entidade essencial ou importante**, por direito próprio.
- **A Wire** notifica enquanto **fornecedor de serviço digital** aos municípios.

São notificações **paralelas, não alternativas**. A Wire não notifica em nome do município, e a notificação da Wire não dispensa a do município. O que a Wire deve fazer é dar ao município os factos técnicos de que ele precisa para cumprir o seu próprio dever — e fazê-lo a tempo de ele cumprir o prazo dele.

Quando o incidente envolve dados pessoais, acresce a CNPD: aí o município é o **responsável pelo tratamento** e a Wire o **subcontratante**. A notificação à CNPD é do município; a Wire apoia com factos técnicos e não faz avaliação jurídica do risco — essa é do responsável.

## Fases

| Fase | Prazo | Objectivo | Grau de certeza exigido |
|---|---|---|---|
| **Alerta inicial** | T+24h | Sinalizar que existe incidente | Baixo. Não esperar por certezas. |
| **Actualização** | T+72h | Âmbito, impacto, causa provável | Médio. Corrigir o que mudou. |
| **Relatório final** | T+30d | Causa, correcção, lições | Alto. Peça definitiva. |

Os prazos contam do **conhecimento** do incidente — o T0 da timeline.

## Fase 1 — Alerta inicial (T+24h)

O propósito é sinalizar, não explicar. Um alerta com metade dos campos em "em apuramento" e enviado a horas vale mais do que um completo e fora de prazo.

```
NOTIFICAÇÃO DE INCIDENTE — ALERTA INICIAL
Referência interna: wire-<ID>
Data/hora da notificação: <UTC>

ENTIDADE NOTIFICANTE
Designação: Wire
Qualidade: fornecedor de serviço digital a entidades da Administração Local
Contacto para o incidente: <nome> · <cargo> · <email> · <telefone 24h>

INCIDENTE
Data/hora de detecção (T0): <UTC>
Data/hora estimada de início: <UTC ou "em apuramento">
Estado: <em curso | contido | resolvido>
Severidade interna: S<n>
Natureza: <disponibilidade | integridade | confidencialidade | combinação>

DESCRIÇÃO
<Três a cinco linhas, factuais.>

IMPACTO CONHECIDO
Entidades afectadas: <n> municípios
<Identificação nominal apenas se exigida pelo formulário; caso contrário,
caracterizar sem nomear.>
Serviços afectados: <produtos wire*>
Utilizadores afectados (estimativa): <n ou "em apuramento">
Transfronteiriço: <sim/não>
Dados pessoais envolvidos: <sim | não | em apuramento>

VECTOR (se conhecido)
<Perímetro | interno | cadeia de fornecimento | em apuramento>

MEDIDAS JÁ TOMADAS
<Contenção aplicada até ao momento.>

PRÓXIMA COMUNICAÇÃO
Actualização até <T+72h em data/hora>.

TLP:AMBER
```

## Fase 2 — Actualização (T+72h)

Acrescenta ao alerta inicial. Repete a referência para permitir juntar as peças.

```
NOTIFICAÇÃO DE INCIDENTE — ACTUALIZAÇÃO
Referência interna: wire-<ID> · Actualização a <data do alerta inicial>

ALTERAÇÕES AO ÂMBITO
<O que mudou face ao alerta inicial, incluindo correcções ao que foi
comunicado. Correcções explícitas, nunca silenciosas.>

AVALIAÇÃO DE IMPACTO
Entidades afectadas (confirmado): <n>
Duração da indisponibilidade: <por serviço>
Dados pessoais: <categorias, n.º aproximado de titulares, se aplicável>
Impacto transfronteiriço: <sim/não>

CAUSA PROVÁVEL
<Hipótese sustentada, identificada como hipótese. Se ainda não houver,
dizê-lo.>

INDICADORES DE COMPROMETIMENTO
<IoCs partilháveis: hashes, IPs, domínios, assinaturas. TLP:GREEN se
partilháveis com a comunidade; RED se ainda denunciarem a investigação.>

MEDIDAS DE CONTENÇÃO E ERRADICAÇÃO
<Aplicadas, com datas.>

ESTADO ACTUAL
<Em curso | contido | erradicado | em recuperação | resolvido>

PRÓXIMA COMUNICAÇÃO
Relatório final até <T+30d>.

TLP:AMBER
```

## Fase 3 — Relatório final (T+30d)

```
RELATÓRIO FINAL DE INCIDENTE
Referência interna: wire-<ID>
Período: <T0> a <fecho>

SUMÁRIO EXECUTIVO
<Um parágrafo. O que aconteceu, o que afectou, como foi resolvido.>

CRONOLOGIA
<Marcos da timeline: detecção, classificação, contenção, erradicação,
recuperação, fecho. Horas em UTC.>

CAUSA-RAIZ
<Apurada. Se a investigação não conseguiu determinar com certeza, dizê-lo
e indicar o que ficou por apurar e porquê.>

IMPACTO FINAL
Entidades afectadas: <n>
Indisponibilidade total acumulada: <por serviço>
Dados pessoais: <confirmação final; notificações à CNPD feitas pelos
municípios responsáveis>
Impacto financeiro estimado: <se aplicável>

MEDIDAS CORRECTIVAS APLICADAS
<Correcções técnicas e processuais, com datas de aplicação e validação.>

MEDIDAS PREVENTIVAS
<Alterações para reduzir recorrência, com prazos e responsáveis.
Referência aos controlos CTRL-W-* reforçados.>

LIÇÕES APRENDIDAS
<Factual, sem atribuição de culpa pessoal. Inclui o que correu bem.>

ANEXOS
<IoCs consolidados · timeline completa · evidência disponível a pedido>

TLP:GREEN
```

## Regras

- **Não esperar por certezas** para o alerta inicial. "Em apuramento" é uma resposta legítima a T+24h; o silêncio não é.
- **Corrigir de forma explícita.** A actualização e o relatório final devem assinalar o que contradiz comunicações anteriores.
- **Coerência com as comunicações aos municípios.** O que se diz ao CNCS e o que se diz ao cliente têm de ser conciliáveis — divergências vão ser notadas, e o município é destinatário de ambas por vias diferentes.
- **Cada envio entra na timeline**: hora, fase, versão.
- **Coordenação com os municípios.** Convém saber se e quando notificaram, para que os relatos não se contradigam. Não é a Wire que decide por eles, mas a incoerência prejudica os dois lados.

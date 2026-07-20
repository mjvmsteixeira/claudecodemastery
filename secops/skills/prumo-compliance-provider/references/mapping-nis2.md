# Mapping controlos Wire ↔ NIS2 (DL 20/2025)

> **Estado: esqueleto de framework — a coluna de cobertura está deliberadamente por preencher.**
>
> A enumeração das medidas do Art. 21 e do regime de notificação do Art. 23 é estrutural e
> verificável contra o texto legal. **A correspondência com os controlos `CTRL-W-*` não pode ser
> escrita sem o inventário desses controlos**, que vive no `WIRE.MTZ.SEC.006` e não está disponível
> a esta skill (ver "Dependência em falta", no fim).
>
> Preencher a coluna com correspondências plausíveis produziria uma declaração de conformidade sem
> lastro — precisamente o que o princípio *"Não inventa cobertura"* do `SKILL.md` proíbe. Confirmar
> a numeração dos artigos contra o texto do DL 20/2025 antes de qualquer uso formal.

## Posição da Wire no regime

A Wire **não** é entidade essencial nem importante por si. É **fornecedora** de entidades essenciais — os municípios. Isso tem três consequências práticas que condicionam todo o mapping:

1. As obrigações chegam à Wire sobretudo **por via contratual**, através dos requisitos que o município lhe impõe para cumprir o seu próprio dever de segurança da cadeia de fornecimento.
2. O dever de **notificação** da Wire é perante os municípios e, enquanto fornecedor crítico, perante o CNCS — em paralelo com a notificação que cada município faz por direito próprio. Nunca em substituição.
3. A **evidência** que a Wire produz destina-se sobretudo a ser consumida pelo município e pelo auditor dele, não por um regulador que audite a Wire directamente.

## Art. 21(2) — medidas de gestão de risco

As dez medidas do catálogo. A coluna "Controlos Wire" preenche-se a partir do inventário `CTRL-W-*`.

| # | Medida (Art. 21(2)) | Controlos Wire | Cobertura | Evidência | Lacuna / plano |
|---|---|---|---|---|---|
| a | Políticas de análise de risco e de segurança dos sistemas de informação | | | | |
| b | Tratamento de incidentes | | | | |
| c | Continuidade de negócio — cópias de segurança, recuperação, gestão de crises | | | | |
| d | **Segurança da cadeia de fornecimento**, incluindo relações com fornecedores directos | | | | |
| e | Segurança na aquisição, desenvolvimento e manutenção — incluindo tratamento e divulgação de vulnerabilidades | | | | |
| f | Políticas e procedimentos de avaliação da eficácia das medidas | | | | |
| g | Práticas básicas de ciber-higiene e formação em cibersegurança | | | | |
| h | Políticas de uso de criptografia e, quando aplicável, cifragem | | | | |
| i | Segurança dos recursos humanos, controlo de acessos e gestão de activos | | | | |
| j | Autenticação multifactor ou contínua, comunicações seguras de voz/vídeo/texto, comunicações de emergência | | | | |

Legenda de cobertura: **Directa** · **Parcial** (com plano) · **Lacuna** (descrita, com plano e responsável) · **N/A** (com justificação escrita).

A alínea **(d)** é a que mais importa à Wire, e por dois lados ao mesmo tempo: é o que os municípios lhe exigem enquanto elo da cadeia deles, **e** o que a Wire tem de exigir aos seus próprios sub-subcontratantes (cloud, CDN, email transaccional, IdP). Um mapping que trate (d) só na primeira direcção está incompleto.

## Art. 23 — notificação de incidentes

| Fase | Prazo | Conteúdo | Quem, no caso Wire |
|---|---|---|---|
| Alerta precoce | 24h do conhecimento | Suspeita de acto ilícito ou de efeito transfronteiriço | Município (entidade essencial) · Wire em paralelo, como fornecedor |
| Notificação de incidente | 72h | Avaliação inicial, severidade, impacto, IoCs | idem |
| Relatório intercalar | a pedido da autoridade | Actualizações de estado | idem |
| Relatório final | 1 mês da notificação | Causa-raiz, medidas aplicadas, impacto transfronteiriço | idem |

O `SKILL.md` do `prumo-ir-multitenant` fixa T+24h / T+72h / T+30d, coerente com este regime. Os templates operacionais estão em `../prumo-ir-multitenant/references/cncs-template.md` — **não duplicar aqui**; este mapping remete para lá.

## Dependência em falta — o inventário `CTRL-W-*`

Este ficheiro não pode ser completado sem a lista de controlos com as respectivas definições.

O que se apurou ao escrevê-lo: os identificadores `CTRL-W-T-001..016` e `CTRL-W-R-001..018` são citados como intervalos em vários pontos do plugin — nos comandos `/prumo-tenant-audit` e `/prumo-release-gate`, nos agents e em várias skills — mas **nenhum artefacto do repositório define o que cada um verifica**. A definição vive no `WIRE.MTZ.SEC.006`, externo.

Isto ultrapassa esta skill. Um comando que diz *"aplica CTRL-W-T-001..016"* a um agente que não tem acesso às definições está no mesmo problema que estas referências ausentes vinham corrigir. **Vale a pena tratar o inventário `CTRL-W-*` como artefacto do plugin**, ou pelo menos como referência partilhada, em vez de o assumir conhecido.

Até lá, o comportamento correcto desta skill perante um pedido de mapping NIS2 é o que a regra de paragem determina: dizer que o inventário falta, mostrar este esqueleto como o trabalho já feito, e pedir os controlos.

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

As dez medidas do catálogo.

**Ler a distinção entre as duas primeiras colunas antes de usar esta tabela.** *"Controlos candidatos"* é **análise**: que controlos conhecidos endereçam esta medida. *"Cobertura"* é uma **afirmação de conformidade**, e exige evidência verificada de que o controlo está implementado e a funcionar. A primeira preenche-se a partir do inventário; a segunda **não**, e continua vazia de propósito.

Candidatos derivados de [`ctrl-w-inventario.md`](../../../ctrl-w-inventario.md) a 2026-08-02 — famílias `T` (16) e `R` (18). A família `IR` não tem matriz e por isso não pode contribuir.

| # | Medida (Art. 21(2)) | Controlos candidatos | Cobertura | Evidência | Lacuna / plano |
|---|---|---|---|---|---|
| a | Políticas de análise de risco e de segurança dos sistemas de informação | **nenhum** | | | família de governança ausente do inventário |
| b | Tratamento de incidentes | `CTRL-W-IR-*` (**matriz ausente**) · T-016 contribui (audit cross-tenant) | | | bloqueado pela lacuna IR |
| c | Continuidade — cópias de segurança, recuperação, gestão de crises | T-012, T-013 · R-013 (adjacente) | | | |
| d | **Segurança da cadeia de fornecimento** | R-005 (SCA/CVE), R-008 (assinatura) | | | cobre a cadeia **de entrada**; nada cobre o que a Wire exige aos seus sub-subcontratantes |
| e | Aquisição, desenvolvimento e manutenção — incl. vulnerabilidades | R-001…R-009 | | | a família melhor coberta |
| f | Avaliação da eficácia das medidas | **nenhum directo** — R-014/015/016 são aprovação, não avaliação | | | |
| g | Ciber-higiene e formação | **nenhum** | | | família ausente do inventário |
| h | Criptografia e cifragem | T-005 (Transit por tenant), T-012 (backups cifrados) | | | sem controlo de *política* de uso |
| i | Recursos humanos, controlo de acessos, gestão de activos | T-003, T-010 (acessos) | | | **RH e gestão de activos sem candidato** |
| j | MFA, comunicações seguras, comunicações de emergência | T-010 (MFA admin) | | | comunicações seguras e de emergência sem candidato |

### O que as células vazias revelam

Não é ruído — é a **forma** da lacuna, e vale mais que a tabela preenchida.

Os 34 controlos conhecidos concentram-se no **técnico e no release**: (e) tem nove candidatos, (c) e (d) têm dois cada. As medidas de **governança, pessoas e processo** — (a) políticas de risco, (f) avaliação de eficácia, (g) formação, e a parte de RH e activos da (i) — não têm **um único candidato**.

Duas leituras possíveis, e não se pode escolher entre elas com o que está no repositório:

1. Existem famílias `CTRL-W-*` de governança no `WIRE.MTZ.SEC.006` que nunca chegaram aqui
2. Não existem, e são lacunas reais de conformidade

**A distinção importa e é a próxima pergunta a fazer**, porque a resposta muda se isto é um problema de documentação ou de controlo.

**Uma terceira hipótese foi testada e eliminada a 2026-08-02: não há controlos de governança perdidos no histórico.** Uma versão anterior deste ficheiro (`aecabaf`, 2026-05-19, pré-rebranding) tinha a tabela ISO **preenchida** com identificadores `CTRL-W-C-*`, `CTRL-W-S-*`, `CTRL-W-O-*` e `CTRL-W-P-001` — 24 ao todo — cobrindo precisamente estas medidas. Eram inventados: davam `OK` a controlos sem matriz, com evidência fabricada (*"LMS completion >95% staff"* para formação, *"Background check pré-contratação"* para RH). Não sobreviveram ao rebranding, e não devem ser recuperados.

Isto reforça a regra em vez de a atenuar. A tabela preenchida era **indistinguível de uma conforme** para quem a lesse sem verificar — e é o mesmo modo de falha que a coluna de cobertura vazia existe para evitar. Uma lacuna assumida é recuperável; uma declaração de conformidade sem lastro, entregue a auditor, não é.

A medida (b), tratamento de incidentes, é um caso à parte: é a única bloqueada por uma família cuja **existência é conhecida** (`CTRL-W-IR-007` é citado) mas cuja matriz não está aqui.

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

## Dependência — parcialmente resolvida a 2026-08-02

O inventário passou a existir em [`ctrl-w-inventario.md`](../../../ctrl-w-inventario.md), com as famílias `T` (16 controlos) e `R` (18) transcritas das suas origens e verificadas char a char. Isso destrancou a coluna de **candidatos**.

**O que continua bloqueado:** a coluna de **cobertura**, que é uma afirmação de conformidade e exige evidência verificada por controlo — trabalho de auditoria, não de mapeamento. E a família `CTRL-W-IR-*`, sem matriz, que bloqueia especificamente a medida (b).

### Histórico

Este ficheiro não podia ser completado sem a lista de controlos com as respectivas definições.

O que se apurou ao escrevê-lo: os identificadores `CTRL-W-T-001..016` e `CTRL-W-R-001..018` são citados como intervalos em vários pontos do plugin — nos comandos `/prumo-tenant-audit` e `/prumo-release-gate`, nos agents e em várias skills — mas **nenhum artefacto do repositório define o que cada um verifica**. A definição vive no `WIRE.MTZ.SEC.006`, externo.

Isto ultrapassa esta skill. Um comando que diz *"aplica CTRL-W-T-001..016"* a um agente que não tem acesso às definições está no mesmo problema que estas referências ausentes vinham corrigir. **Vale a pena tratar o inventário `CTRL-W-*` como artefacto do plugin**, ou pelo menos como referência partilhada, em vez de o assumir conhecido.

Até lá, o comportamento correcto desta skill perante um pedido de mapping NIS2 é o que a regra de paragem determina: dizer que o inventário falta, mostrar este esqueleto como o trabalho já feito, e pedir os controlos.

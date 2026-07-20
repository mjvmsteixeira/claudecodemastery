# Matriz de severidade S1–S4 · IR multi-tenant Wire

> **Estado: rascunho operacional.** Estruturado a partir do `SKILL.md` e do WIRE.PRC.IRT.005.
> Os limiares e a atribuição de responsáveis **têm de ser validados pelo Coordenador SecOps**
> antes de servirem de base a uma decisão real. Os prazos regulatórios citados são os que a
> skill já assume — confirmar com o DPO/jurídico antes de uma notificação efectiva.

## Como usar

Percorre as portas por ordem. **A primeira que der positivo fixa a severidade** — não continues a descer à procura de uma classificação mais confortável. Em dúvida entre dois níveis, assume o mais grave e regista a dúvida na timeline; despromover depois com evidência é barato, promover tarde não é.

## Porta 1 — S1 (crítico)

Qualquer uma basta:

- **Vazamento confirmado de dados pessoais** que cruza fronteira de tenant (dados do município A acessíveis ao município B, ou a terceiro).
- **Comprometimento de componente partilhado com credenciais**: Vault, IdP, base de dados de plataforma, pipeline de build.
- **Indisponibilidade total** de um ou mais produtos `wire*` para a generalidade dos municípios.
- **Exfiltração activa em curso** — atacante com acesso ainda não cortado.
- **Comprometimento de cadeia de fornecimento** confirmado num artefacto já em produção.

Consequência imediata: ponte permanente CSIRT, notificação T+0 a Coordenador SecOps **e** CTO, relógio regulatório a contar.

## Porta 2 — S2 (elevado)

- **≥2 municípios** afectados na mesma janela, com degradação material de serviço.
- **Suspeita fundamentada de comprometimento** sem confirmação (ex: alerta Wazuh sem correspondência Fortigate — ver regra abaixo).
- **Indisponibilidade total de um produto** para um subconjunto de municípios.
- **Credencial exposta** sem evidência de uso.
- **Vazamento de dados pessoais dentro de um único tenant**, sem cruzamento.

Consequência: ponte permanente CSIRT. Prepara notificações mas só dispara quando o âmbito estabilizar.

## Porta 3 — S3 (moderado)

- **1 município** afectado, degradação sem perda de dados nem indício de comprometimento.
- Falha de componente **com redundância que actuou** — impacto absorvido.
- Vulnerabilidade descoberta em produção **sem exploração observada**.

Consequência: tratamento em horário normal, sem ponte. Notificação ao município conforme contrato, não por prazo regulatório.

## Porta 4 — S4 (baixo)

- Impacto cosmético, num só tenant, sem efeito funcional.
- Falso positivo confirmado após análise.
- Degradação dentro dos limites de SLA.

Consequência: registo no ticket, sem notificação.

## Regra do sinal ausente

O `SKILL.md` impõe correlação Wazuh ↔ Fortigate. **Alerta Wazuh sem correspondência Fortigate na janela ±15 min sobe automaticamente a S2**, mesmo que o impacto observado sugira S3.

A razão: o Fortigate vê o perímetro. Um evento interno que ele não viu chegar implica uma de três hipóteses, todas más — movimento lateral a partir de algo já comprometido, evasão do IDS, ou artefacto malicioso que entrou pela cadeia de fornecimento e não pelo perímetro. Nenhuma delas é compatível com "moderado" enquanto não se descartar.

O inverso não se aplica: hits no Fortigate sem correspondência no Wazuh são, tipicamente, ruído bloqueado no perímetro.

## Multiplicador multi-tenant

A contagem de municípios afectados **não** é linear na severidade. Um vazamento que cruza a fronteira entre dois tenants é S1 mesmo com só dois envolvidos, porque põe em causa o controlo crítico nº 1 da plataforma (isolamento). Cinquenta municípios com lentidão são S2.

Formulado de outra maneira: **a natureza do que falhou pesa mais do que a contagem de quem sentiu**.

## Escalada e desescalada

- **Escalar** assim que houver evidência nova que abra uma porta superior. A escalada é imediata e não precisa de aprovação.
- **Desescalar** exige: evidência explícita que feche a porta superior, registo na timeline com autor e hora, e visto do Coordenador SecOps. Nunca desescalar para justificar não notificar.
- **A severidade no fecho é a máxima atingida**, não a final. Um incidente que esteve em S1 durante seis horas e fechou em S3 é reportado como S1 no post-mortem.

## Consequências por nível

| | S1 | S2 | S3 | S4 |
|---|---|---|---|---|
| Ponte CSIRT permanente | sim | sim | não | não |
| Notificação interna | T+0, SecOps + CTO | T+0, SecOps | horário normal | ticket |
| Municípios afectados | T+24h | T+24h | contratual | não |
| CNCS | T+24h / T+72h / T+30d | avaliar caso a caso | não | não |
| CNPD (via município) | T+72h se dados pessoais com risco | idem, se aplicável | não | não |
| Aprovação para contenção | N2; N3 se pipeline ou Vault | N2 | N1 | — |
| Post-mortem | obrigatório, interno + público | obrigatório, interno | opcional | não |

Os prazos são os que o `SKILL.md` fixa. **Contam a partir do conhecimento do incidente, não da sua origem** — o instante em que a organização soube, e que tem de estar na timeline com hora exacta.

## Exemplos classificados

| Situação | Nível | Porquê |
|---|---|---|
| Query sem `tenant_key` expõe registos de outro município | **S1** | Cruza fronteira de tenant com dados pessoais |
| AppRole do Vault com `secret_id` vazado num log de build | **S1** | Componente partilhado com credenciais |
| `wirePAPER` em baixo para todos os municípios do pool A | **S1** | Indisponibilidade total de produto |
| Gem Ruby com CVE crítico em 4 produtos, sem exploração observada | **S2** | Cadeia exposta, sem confirmação |
| Wazuh alerta acesso anómalo; Fortigate nada viu | **S2** | Regra do sinal ausente |
| Um município sem `wireDOCS` por falha de disco, com restauro em curso | **S3** | Um tenant, sem comprometimento |
| Latência 20% acima do normal, dentro do SLA | **S4** | Dentro dos limites |

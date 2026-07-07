# Anexo II — Notificação de Violação de Dados Pessoais (CNPD)

**Skill:** `prumo-compliance-provider` · **Versão:** v0.4.0 · **Última actualização:** 2026-05-19

> Template referenciado pela skill `prumo-compliance-provider`. Baseado em RGPD Art. 33 (notificação
> à autoridade de controlo) e Art. 34 (comunicação ao titular), Lei n.º 58/2019 (execução nacional),
> Diretrizes EDPB 9/2022 sobre notificação. Marca `[CONFIRMAR]` campos Wire-specific.

A Wire enquanto **subcontratante** (RGPD Art. 28) não notifica directamente a CNPD pelos dados que trata em nome dos municípios — quem notifica é cada município, enquanto **responsável de tratamento**. Mas a Wire **prepara o dossier técnico** que cada município usa, e tem obrigação contratual de o entregar em **prazo que permita** o cumprimento dos 72 h regulatórios.

## Quando usar este template

- Violação confirmada de **dados pessoais** (definição RGPD Art. 4 §1) tratados por conta de município.
- Independentemente da causa: ataque externo, erro humano, falha técnica, perda física, exfiltração interna.
- Independentemente do volume: até **uma única ficha** de cidadão exposta a 3rd party não autorizada activa a notificação se houver risco para direitos e liberdades.

A excepção é o Art. 33 §1 in fine: notificação não exigida quando "for improvável que a violação resulte num risco para os direitos e liberdades das pessoas singulares". A justificação dessa improbabilidade fica documentada no registo interno do subcontratante (Art. 33 §5).

## Calendário

| Marco | Prazo | Responsável |
|-------|-------|-------------|
| Detecção pela Wire | T+0 | SecOps |
| Notificação interna Wire → Município | ≤ 24 h | DPO Wire ↔ DPO Município |
| Município → CNPD | ≤ 72 h | Município (Wire fornece dossier) |
| Comunicação ao titular (se risco elevado) | "Sem demora injustificada" (Art. 34) | Município |

## Campos obrigatórios CNPD (RGPD Art. 33 §3 + Lei 58/2019)

A CNPD disponibiliza formulário electrónico no portal www.cnpd.pt com os campos seguintes. O template abaixo é o **dossier técnico que a Wire entrega ao município** para preencher o formulário:

```markdown
# Dossier Técnico — Notificação de Violação de Dados Pessoais

**Subcontratante:** Wire [DESIGNACAO_SOCIAL]
**NIPC:** [NIPC_WIRE]
**Responsável de tratamento:** Município de [NOME_MUNICIPIO]
**NIPC responsável:** [NIPC_MUNICIPIO]
**Referência interna Wire:** wire-ir-[INCIDENT_ID]
**Data de elaboração:** [TIMESTAMP_UTC]

## 1. Identificação

- **DPO Wire:** [NOME], [EMAIL], [TELEFONE]
- **DPO Município (contacto):** [NOME], [EMAIL], [TELEFONE]
- **Responsável SecOps Wire:** [NOME], [EMAIL]

## 2. Cronologia do Incidente

- **Início estimado:** [TIMESTAMP_UTC ou "desconhecido — investigação em curso"]
- **Detecção pela Wire:** [TIMESTAMP_UTC]
- **Notificação Wire → Município:** [TIMESTAMP_UTC]
- **Contenção:** [TIMESTAMP_UTC]
- **Erradicação:** [TIMESTAMP_UTC]
- **Recuperação completa:** [TIMESTAMP_UTC ou TBD]
- **Duração total (estimada):** [HORAS_MINUTOS]

## 3. Natureza da Violação

Tipo (marcar todos os aplicáveis):
- [ ] Confidencialidade — divulgação ou acesso não autorizado
- [ ] Integridade — alteração não autorizada
- [ ] Disponibilidade — destruição, perda ou inacessibilidade

Descrição factual (5-10 linhas, sem opinião nem atribuição de culpa):

> [DESCRICAO_TECNICA_NEUTRA]

Vector confirmado ou suspeito:
- [perímetro / interno / supply-chain / erro humano / falha técnica / unknown]

Indicadores de comprometimento:
- [LISTA_IOCS — pode ir em anexo TLP:AMBER+STRICT separado]

## 4. Categorias de Dados Afectados

Categorias (marcar):
- [ ] Identificação (nome, NIF, morada, contacto)
- [ ] Identificadores únicos (BI/CC, NISS, NUS, número de utente)
- [ ] Económico-financeiros
- [ ] Localização
- [ ] Dados de saúde (Art. 9 §1)
- [ ] Convicções religiosas/políticas/filosóficas (Art. 9 §1)
- [ ] Origem racial/étnica (Art. 9 §1)
- [ ] Orientação sexual (Art. 9 §1)
- [ ] Dados genéticos/biométricos (Art. 9 §1)
- [ ] Condenações penais (Art. 10)
- [ ] Dados de menores (Art. 8)
- [ ] Outros: [ESPECIFICAR]

## 5. Categorias de Titulares Afectados

- [ ] Munícipes (cidadãos residentes/operação no município)
- [ ] Funcionários/trabalhadores do município
- [ ] Eleitos locais
- [ ] Fornecedores e prestadores de serviço do município
- [ ] Outros: [ESPECIFICAR]

## 6. Volume Estimado

- **Titulares afectados (aproximado):** [N]
- **Registos afectados (aproximado):** [N]
- **Margem de incerteza:** [BAIXA / MÉDIA / ALTA — explicar]

## 7. Consequências Prováveis (Avaliação de Risco)

Avaliação por dimensão (BAIXA / MÉDIA / ALTA):

| Dimensão | Nível | Justificação |
|----------|-------|--------------|
| Discriminação | [N] | [JUSTIFICACAO] |
| Roubo de identidade ou fraude | [N] | [JUSTIFICACAO] |
| Perdas financeiras | [N] | [JUSTIFICACAO] |
| Danos reputacionais | [N] | [JUSTIFICACAO] |
| Perda de confidencialidade | [N] | [JUSTIFICACAO] |
| Reversão da pseudonimização não autorizada | [N] | [JUSTIFICACAO] |
| Qualquer outra desvantagem económica ou social | [N] | [JUSTIFICACAO] |

**Risco global para titulares:** [BAIXO / MÉDIO / ELEVADO]

Comunicação aos titulares prevista (RGPD Art. 34): [SIM / NÃO]
Se NÃO, justificação:
- [ ] Medidas técnicas tornam dados ininteligíveis (cifragem efectiva)
- [ ] Medidas posteriores asseguram que o risco elevado não se concretizará
- [ ] Esforço desproporcionado — comunicação pública alternativa em [CANAL]

## 8. Medidas Tomadas

### 8.1 Contenção (já aplicadas)

- [LISTA_FACTUAL]

### 8.2 Erradicação (em curso ou planeadas)

- [LISTA_FACTUAL]

### 8.3 Recuperação

- [LISTA_FACTUAL]

### 8.4 Medidas para mitigar efeitos adversos aos titulares

- [LISTA — ex: reset de credenciais, ofereta de monitorização de identidade, comunicação directa]

## 9. Medidas Preventivas (médio prazo)

- [LISTA_CONTROLOS_NOVOS_OU_REFORÇADOS]

## 10. Documentação Anexa

- Timeline completa: `wire-ir-[ID]/timeline.md` (TLP:AMBER)
- IoCs: `wire-ir-[ID]/iocs.json` (TLP:AMBER+STRICT)
- Causa raiz preliminar: `wire-ir-[ID]/root-cause-preliminary.md` (TLP:AMBER+STRICT)
- Comunicação Wire → Município: `wire-ir-[ID]/comms/municipio-[NIPC].pdf`

## 11. Sign-off

- **DPO Wire:** [NOME], [DATA_UTC]
- **SecOps Lead Wire:** [NOME], [DATA_UTC]
- **CISO Wire:** [NOME], [DATA_UTC]
```

## Exemplo preenchido (incident hipotético)

**Cenário:** Em wireFORMS, um endpoint de export de formulários preenchidos teve, durante 47 minutos, ausência de check de tenant. Um munícipe autenticado de Município A, ao manipular o parâmetro `form_id` na URL, conseguiu fazer download de formulários submetidos em Município B. Logs Wazuh detectaram pattern anómalo de acesso (rule_id 100045), confirmado por análise de logs aplicacionais.

```markdown
# Dossier Técnico — wire-ir-2026-0519-002

**Município responsável:** Município de [B], NIPC [505000111]
**Referência interna Wire:** wire-ir-2026-0519-002

## 2. Cronologia
- Início: 2026-05-19T07:13:00Z (deploy wireFORMS v4.2.1 com regressão)
- Detecção Wire: 2026-05-19T08:00:33Z (alerta Wazuh rule_id 100045)
- Notificação Wire → Município B: 2026-05-19T09:42:00Z
- Contenção: 2026-05-19T08:00:55Z (hotfix + cap rollback)
- Recuperação completa: 2026-05-19T08:15:00Z
- Duração: 47 min de exposição

## 3. Natureza
Tipo: Confidencialidade
Vector: Erro humano em code review (regressão de check de tenant)

## 4. Categorias de Dados
- Identificação (nome, NIF, morada, contacto telefónico/email)
- Conteúdo livre de formulários (campos texto preenchidos pelo munícipe)

## 5. Categorias de Titulares
- Munícipes residentes do Município B que submeteram formulários nos últimos 30 dias

## 6. Volume
- Titulares afectados (aprox.): 18
- Registos afectados (aprox.): 23 (alguns titulares com múltiplos formulários)
- Margem incerteza: BAIXA (logs aplicacionais permitem identificação exacta)

## 7. Consequências
- Discriminação: BAIXA (sem dados sensíveis Art. 9 envolvidos)
- Roubo identidade: MÉDIA (NIF + morada + contacto formam combinação utilizável)
- Perdas financeiras: BAIXA
- Reputação: MÉDIA (instituição municipal)
- Confidencialidade: ALTA (essência da violação)
Risco global: MÉDIO
Comunicação aos titulares: SIM (recomendação Wire ao Município)

## 8. Medidas
- Contenção: rollback Capistrano para v4.2.0 em 22 segundos após detecção
- Erradicação: hotfix v4.2.2 com check restaurado + teste unitário regression
- Recuperação: novo deploy validado em staging multi-tenant antes de prod
- Mitigação: reset de session tokens, audit access logs entregue ao Município B
```

---

## Fontes

- **Regulamento UE 2016/679 (RGPD)** Art. 33 (notificação à autoridade), Art. 34 (comunicação ao titular).
- **Lei n.º 58/2019** — execução nacional do RGPD em Portugal.
- **EDPB Guidelines 9/2022** on personal data breach notification under GDPR.
- **CNPD — Formulário de notificação de violação de dados pessoais** (versão pública 2024).
- **Diretrizes do Grupo do Artigo 29.º WP250rev.01** (legado, ainda referência técnica).

## Como usar este template em sessão Claude Code

A skill `prumo-compliance-provider` invoca este template quando um incidente confirma exposição de dados pessoais e a Wire precisa de entregar dossier técnico ao DPO de um município responsável. Esperar como output: ficheiro `.md` parametrizado com timestamps, NIPCs, e medidas concretas extraídas da timeline do incidente. O município é o submetente oficial à CNPD — a sessão nunca submete directamente.

# DPIA — Avaliação de Impacto sobre a Protecção de Dados

**Skill:** `prumo-compliance-provider` · **Versão:** v0.4.0 · **Última actualização:** 2026-05-19

> Template referenciado pela skill `prumo-compliance-provider`. Baseado em RGPD Art. 35, Diretrizes
> WP248rev.01 (Grupo do Artigo 29.º), Lista CNPD 1/2018 de operações sujeitas a DPIA obrigatória.
> Marca `[CONFIRMAR]` campos Wire-specific.

## Quando é obrigatório

A Wire elabora DPIA quando o produto/serviço a desenvolver ou alterar materialmente envolve:

1. **Tratamento sistemático e em larga escala** de dados pessoais (RGPD Art. 35 §3 b).
2. **Categorias especiais** Art. 9 (saúde, religião, etc.) ou Art. 10 (condenações) em larga escala (Art. 35 §3 b).
3. **Vigilância sistemática de área pública em larga escala** (Art. 35 §3 c).
4. **Decisões automatizadas com efeitos jurídicos** ou similarmente significativos (Art. 35 §3 a).
5. **Operações listadas pela CNPD** em Lista 1/2018 (interconnexão de bases públicas, dados de menores em larga escala, dados biométricos, etc.).
6. **Inovação tecnológica** com risco potencialmente elevado (regra prática Wire: novo produto wire* ou alteração arquitectural maior).

Para a Wire, DPIA é tipicamente exigida em:
- Lançamento de novo produto wire* que processe PII de munícipes em produção.
- Integração com serviço terceiro novo que transmita PII (CDN, IdP, IA "Maria").
- Alteração de schema multi-tenant que mude o modo de isolamento.
- Funcionalidade de matching, scoring ou perfilamento.

## As 7 secções obrigatórias

### 1. Descrição sistemática do tratamento (Art. 35 §7 a)

- **Designação do tratamento:** [NOME_OPERACAO]
- **Responsável de tratamento:** Município de [NOME] (cada cliente é responsável; Wire é subcontratante)
- **Subcontratante:** Wire [DESIGNACAO_SOCIAL]
- **Sub-subcontratantes:** [LISTA — ex: AWS para hosting, Microsoft 365 para comms, [CONFIRMAR cadeia 2026]]
- **Finalidade:** [DESCRICAO_NEGOCIAL]
- **Base de licitude (Art. 6):** [a/b/c/d/e/f + fundamentação]
- **Base de licitude Art. 9 (se aplicável):** [a-j com fundamentação]
- **Categorias de dados:** ver listagem detalhada na §1.4
- **Categorias de titulares:** munícipes, funcionários, eleitos, fornecedores...
- **Destinatários:** lista de quem recebe os dados (departamentos do município, autoridades, parceiros)
- **Transferências internacionais:** [SIM/NÃO + se SIM, mecanismo Art. 44-49]
- **Retenção:** prazo + base legal/contratual
- **Fluxo de dados (data flow):** diagrama em anexo `data-flow-[NOME].png`

### 2. Necessidade e proporcionalidade (Art. 35 §7 b)

Avaliação ponto-a-ponto:

- **Minimização de dados:** que campos são estritamente necessários? O que foi descartado?
- **Limitação da finalidade:** os dados podem ser usados para outro fim? Como se previne?
- **Exactidão:** como se garante? Quem actualiza?
- **Limitação da conservação:** quando se apaga? Como se automatiza?
- **Integridade e confidencialidade:** controlos técnicos e organizacionais (cifragem, RBAC, audit).
- **Responsabilidade (accountability):** registo de tratamentos actualizado, DPO informado.

Quando aplicável, incluir **Legitimate Interest Assessment (LIA)** — análise tripartida do Art. 6 §1 f):
- Interesse legítimo prosseguido (purpose test).
- Necessidade do tratamento para o atingir (necessity test).
- Equilíbrio entre interesses e direitos fundamentais dos titulares (balancing test).

### 3. Risco para os direitos e liberdades dos titulares (Art. 35 §7 c)

Matriz `likelihood × severity`, escala 1-5 cada, score = produto (max 25):

| Likelihood | Severity | Score |
|------------|----------|-------|
| 1 — Improvável | 1 — Despreocupante | 1-2: muito baixo |
| 2 — Pouco provável | 2 — Limitado | 3-4: baixo |
| 3 — Possível | 3 — Significativo | 5-9: médio |
| 4 — Provável | 4 — Sério | 10-15: médio-alto |
| 5 — Quase certo | 5 — Crítico | 16-25: alto |

**Sample secção 3 — preenchida para produto wire* hipotético:**

> Risco 3.1 — **Cross-tenant data leak via RLS bypass.**
> Likelihood: 2 (postura Wire forte — RLS + audit, mas não zero — regressões possíveis).
> Severity: 5 (impacto crítico — PII de munícipes expostos a 3rd party município).
> Score: 10/25 = **MÉDIO-ALTO.** Mitigação: §4.1.
>
> Risco 3.2 — **Acesso não-autorizado por sub-subcontratante.**
> Likelihood: 1 (NDAs + AppRole isolation + cláusulas contratuais).
> Severity: 4 (sério; volume de munícipes afectados se acontecer).
> Score: 4/25 = **BAIXO.** Mitigação: §4.2.
>
> Risco 3.3 — **Retenção excessiva pós-contrato.**
> Likelihood: 3 (purge automation ainda parcialmente manual).
> Severity: 3 (significativo mas reversível).
> Score: 9/25 = **MÉDIO.** Mitigação: §4.3.
>
> Risco 3.4 — **Comprometimento de credenciais staff Wire com acesso operacional.**
> Likelihood: 2 (MFA obrigatório + Vault TTL curto, mas social engineering possível).
> Severity: 4 (sério — acesso técnico amplo).
> Score: 8/25 = **MÉDIO.** Mitigação: §4.4.
>
> Risco 3.5 — **Exfiltração de backup não cifrado.**
> Likelihood: 1 (backups cifrados em repouso + transit + restricted access).
> Severity: 5 (crítico — todos os dados de um período).
> Score: 5/25 = **MÉDIO-BAIXO.** Mitigação: §4.5.

### 4. Medidas de mitigação (Art. 35 §7 d)

Por cada risco em §3:

> Mitigação 4.1 — RLS bypass (risco 3.1):
> - **Técnicas:** RLS policies em todas as tabelas multi-tenant; role Rails sem `BYPASSRLS`; staging multi-tenant test obligatório no pipeline; Wazuh rule_id 100020-100029 detectam tentativas de bypass; pen-test anual.
> - **Organizacionais:** code review obrigatório para alterações a tabelas multi-tenant; checklist `prumo-tenant-isolation` em cada release; CTRL-W-T-* auditado trimestralmente.
> - **Risco residual:** likelihood 1, severity 5, score 5/25 = MÉDIO-BAIXO. Aceitável com vigilância contínua.

> Mitigação 4.2 — Sub-subcontratantes:
> - **Técnicas:** Cifragem at rest e in transit; key management isolado da infra do sub-subcontratante (Wire holds the keys quando possível).
> - **Organizacionais:** DPA com cada sub-subcontratante incluindo cláusulas mínimas Art. 28 §3; lista actualizada em registo público à disposição dos municípios; reaudit anual.
> - **Risco residual:** score 2/25 = BAIXO.

(continuar para 4.3, 4.4, 4.5...)

### 5. Consulta a partes interessadas (Art. 35 §2)

- **DPO Wire consultado:** [SIM/NÃO + data + parecer formal anexado]
- **DPO de municípios pilot consultados:** [LISTA]
- **Consulta a titulares (Art. 35 §9):** [SIM/NÃO + justificação + método]
- **Consulta CNPD (Art. 36 — prior consultation):** [SIM/NÃO — apenas se risco residual elevado mesmo após mitigação]

### 6. Risco residual após mitigação

| Risco original | Score original | Score residual | Estado |
|----------------|-----------------|------------------|--------|
| 3.1 RLS bypass | 10/25 | 5/25 | Aceitável |
| 3.2 Sub-subcontratante | 4/25 | 2/25 | Aceitável |
| 3.3 Retenção excessiva | 9/25 | 4/25 | Aceitável |
| 3.4 Credenciais staff | 8/25 | 4/25 | Aceitável |
| 3.5 Exfiltração backup | 5/25 | 3/25 | Aceitável |

**Risco residual global:** BAIXO-MÉDIO (todos os scores ≤ 9).

Se algum risco ficasse > 12 após mitigação, accionaria-se Art. 36 (consulta prévia à CNPD).

### 7. Decisão e sign-off

- [ ] **Proceder** sem condições.
- [ ] **Proceder com restrições** — implementar medidas adicionais §X antes de go-live.
- [ ] **Não proceder** — risco residual incompatível mesmo após mitigação.
- [ ] **Consultar CNPD** — Art. 36 antes de iniciar.

Sign-off:
- **DPO Wire:** [NOME], [DATA]
- **CISO Wire:** [NOME], [DATA]
- **Product Owner / Eng Lead:** [NOME], [DATA]
- **CTO Wire:** [NOME], [DATA]
- **DPO Município(s) pilot:** [NOME], [DATA] (parecer não vinculativo mas registado)

## Esqueleto pré-preenchido — "Produto Wire que processa PII de munícipes"

Para qualquer novo produto wire* destinado a processar PII de munícipes, o esqueleto base é:

```markdown
# DPIA — wire[NOME_PRODUTO] v[VERSAO]

## 1. Descrição
- Responsável: Municípios contratantes (cada um por seus dados)
- Subcontratante: Wire
- Sub-subcontratantes: AWS (hosting eu-west-1), Microsoft 365 (comms staff Wire) [CONFIRMAR]
- Finalidade: [DESCRICAO_PRODUTO]
- Base licitude: típicamente Art. 6 §1 e) (exercício de autoridade pública) — confirmar por município
- Categorias dados: identificação, contacto, financeiros (se aplicável)
- Categorias Art. 9: [VERIFICAR]
- Categorias titulares: munícipes, funcionários
- Retenção: definida por município, default 5 anos sob arquivística autárquica

## 3. Riscos típicos do contexto Wire
- 3.1 Cross-tenant leak (sempre presente)
- 3.2 Sub-subcontratante (sempre presente — AWS/Microsoft)
- 3.3 Retenção excessiva
- 3.4 Credenciais staff Wire
- 3.5 Exfiltração backup
- 3.6 [específico do produto]

## 4. Mitigação base Wire (sempre aplicável)
- RLS PostgreSQL + tenant-key Vault
- Audit Vault → Wazuh
- SSH CA TTL ≤15min, AppRole TTL ≤30min
- Backup cifrado at rest + in transit
- DPO+CISO+CTO sign-off em deploy
- Pen-test anual externo [CONFIRMAR]
```

## DPIA review cycle

- Revisão obrigatória: a cada alteração material (novo data flow, novo sub-subcontratante, novo tipo de dado, regulamento alterado).
- Revisão de calendário: anual mesmo sem alteração material.
- Trigger automático: incidente de severity ≥ S2 que envolva o produto DPIA-coberto activa reavaliação no T+30 dias.

---

## Fontes

- **Regulamento UE 2016/679 (RGPD)** Art. 35 (DPIA), Art. 36 (consulta prévia).
- **Diretrizes WP248rev.01** — Grupo do Artigo 29.º, 4 Out 2017, sobre DPIA.
- **CNPD Deliberação 1/2018** — Lista de operações de tratamento sujeitas a DPIA obrigatória.
- **EDPB Recomendations 01/2020** on measures supplementing transfer tools (relevant para sub-processors).
- **ISO/IEC 29134:2023** — Guidelines for privacy impact assessment.

## Como usar este template em sessão Claude Code

A skill `prumo-compliance-provider` invoca este template quando se prepara DPIA para novo produto wire*, alteração arquitectural maior, ou revisão anual obrigatória. Esperar como output: estrutura pré-preenchida com riscos típicos Wire + matriz mitigação base + placeholders concretos. O sign-off final é sempre humano (DPO+CISO+CTO+Product); a sessão produz o draft técnico defensável.

# Mapping NIS2 — Wire enquanto Fornecedor Crítico

**Skill:** `prumo-compliance-provider` · **Versão:** v0.4.0 · **Última actualização:** 2026-05-19

> Template referenciado pela skill `prumo-compliance-provider`. Baseado em Directiva (UE)
> 2022/2555 (NIS2) e DL n.º 20/2025 (transposição portuguesa, publicado em Janeiro 2025).
> Marca `[CONFIRMAR]` onde a postura Wire-specific ainda não é definitiva.

## Wire enquanto entidade essencial subcontratante

A Wire opera num enquadramento NIS2 **dualmente posicionado**:

1. **Fornecedor crítico** de entidades essenciais (170+ munícipios PT, todos sob NIS2 enquanto administração pública local — Anexo I DL 20/2025 categoria 1.b).
2. **Entidade essencial directa por inclusão sectorial** — DL 20/2025 Anexo I categoria 8 ("Prestadores de serviços digitais — serviços de cloud computing e plataformas em linha") quando a Wire ultrapassa os limiares quantitativos do Art. 6 (≥ 50 trabalhadores ou ≥ 10 M€ volume negócios anual). `[CONFIRMAR — verificar enquadramento Wire 2026]`

A consequência prática é simétrica: a Wire **notifica** o CNCS em nome próprio e **apoia** cada município na notificação que este último faz enquanto entidade essencial. Não há substituição — há paralelismo regulatório.

## Obrigações de fornecedor crítico (resumo operacional)

| Obrigação | Artigo DL 20/2025 | Implementação Wire |
|-----------|-------------------|---------------------|
| Política de segurança formal | Art. 14 §1 alínea a) | WIRE.POL.SEC.001 (documentada, sign-off CTO) |
| Gestão de risco em redes e SI | Art. 14 §1 alínea b) | Registo de risco anual + revisão trimestral |
| Tratamento de incidentes | Art. 14 §1 alínea c) | Skill `prumo-ir-multitenant` + WIRE.PRC.IRT.005 |
| Continuidade de negócio + backup | Art. 14 §1 alínea d) | Backups encriptados, restore test trimestral `[CONFIRMAR — frequência]` |
| Segurança cadeia de aprovisionamento | Art. 14 §1 alínea e) | Inventário de dependências Ruby/JS, SBOM por release |
| Segurança no desenvolvimento e aquisição | Art. 14 §1 alínea f) | Pipeline com SAST, dependency scanning, code review obrigatório |
| Avaliação de eficácia das medidas | Art. 14 §1 alínea g) | Auditoria interna anual + externa bienal |
| Práticas cibernéticas básicas e formação | Art. 14 §1 alínea h) | Formação anual obrigatória, phishing tests trimestrais |
| Criptografia (políticas e procedimentos) | Art. 14 §1 alínea i) | Vault transit, TDE PostgreSQL, TLS 1.2+ |
| Segurança dos recursos humanos | Art. 14 §1 alínea j) | Background check pré-contratação, NDAs, offboarding tracked |
| Controlo de acesso + gestão de activos | Art. 14 §1 alínea k) | AppRole Vault, RBAC Rails, inventário CMDB |
| MFA, comunicações seguras | Art. 14 §1 alínea l) | MFA obrigatório staff, SSH CA, comms internas em canais autenticados |

### Notificação obrigatória (Art. 23)

Três marcos temporais cumulativos para incidente significativo:

- **T+24 h** — **early warning** ao CNCS. Tem de conter natureza, classificação preliminar, suspeita de cross-border. Pode ser ainda preliminar.
- **T+72 h** — **notificação detalhada** com indicação de gravidade, impacto, IoCs disponíveis, medidas de mitigação aplicadas.
- **T+1 mês** — **relatório final** com causa raiz, lições aprendidas, plano de remediação.

Critérios de "incidente significativo" (Art. 23 §3):
- Interrupção operacional grave ou perda financeira para a entidade ou outros;
- Impacto em pessoas singulares ou colectivas causando dano material ou imaterial considerável.

Para a Wire isto traduz-se directamente em **S1 e maioria dos S2** da matriz interna (ver `prumo-ir-multitenant/references/severity-matrix.md`).

## Mapping CTRL-W-C-* → DL 20/2025 artigos

A Wire mantém um catálogo de controlos internos com prefixo `CTRL-W-<dominio>-<NNN>`. Para compliance: `CTRL-W-C-*` (Compliance), `CTRL-W-S-*` (Security), `CTRL-W-T-*` (Tenant isolation), `CTRL-W-O-*` (Operations). `[CONFIRMAR — catálogo canónico em WIRE.MTZ.SEC.006]`

| Controlo interno | Designação | Artigo DL 20/2025 | Evidência |
|------------------|------------|--------------------|-----------|
| CTRL-W-C-001 | Registo de tratamentos como subcontratante | Art. 14 §1 a) | `secret/data/compliance/registo-tratamentos.json` |
| CTRL-W-C-005 | Avaliação anual de risco | Art. 14 §1 b) | `WIRE.RISK.001` + minutas comité risco |
| CTRL-W-C-007 | Procedimento IR documentado e exercitado | Art. 14 §1 c) | WIRE.PRC.IRT.005 + tabletop exercise log |
| CTRL-W-C-009 | Plano de continuidade testado | Art. 14 §1 d) | Restore drill log `[CONFIRMAR — periodicidade]` |
| CTRL-W-C-011 | SBOM e dependency tracking por produto | Art. 14 §1 e) | `secret/data/cicd/sbom/*` por release |
| CTRL-W-C-012 | Encryption at rest em PostgreSQL multi-tenant | Art. 14 §1 i) | TDE config + Vault transit per-tenant |
| CTRL-W-C-014 | Pipeline com SAST/DAST | Art. 14 §1 f) | Output Brakeman/dependency-check em CI |
| CTRL-W-C-015 | Auditoria interna anual | Art. 14 §1 g) | Relatório auditoria + plano remediação |
| CTRL-W-C-018 | Formação cibersegurança obrigatória | Art. 14 §1 h) | LMS completion rates >95% staff |
| CTRL-W-C-020 | MFA obrigatório para acesso privilegiado | Art. 14 §1 l) | Vault AppRole + MFA SSO staff |
| CTRL-W-C-022 | SSH CA com TTL ≤ 15min | Art. 14 §1 i) + l) | `vault read ssh/config/ca`, audit `auth/ssh/*` |
| CTRL-W-C-025 | Notificação CNCS em ≤ 24h documentada | Art. 23 §1 | Playbook em `prumo-ir-multitenant` + log envios |
| CTRL-W-C-027 | Cooperação com CNCS — ponto único de contacto | Art. 26 | DPO designado, ficha CNCS-CERT.PT |
| CTRL-W-C-030 | Inventário de activos e dependências | Art. 14 §1 e) | CMDB + SBOM linkado |

### Sample mapping detalhado

**CTRL-W-C-012 (encryption at rest em PostgreSQL multi-tenant) ↔ DL 20/2025 Art. 14 alínea c) e i).**

O Art. 14 §1 c) exige "tratamento dos incidentes e a continuidade das operações" e a alínea i) exige "políticas e procedimentos relativos à utilização de criptografia e, sempre que adequado, de cifragem". Implementação Wire: TDE (Transparent Data Encryption) em todas as instâncias PostgreSQL via PG 16 cluster-level encryption + per-tenant transit key via Vault `transit/encrypt/tenant-<NIPC>` para dados sensíveis (denunciantes, RH, processos disciplinares).

Evidência:
- Dump de `pg_settings` mostrando `ssl=on`, `data_directory_mode=0700`.
- Audit log Vault: `secret/data/db/tenant-keys/*` accessed only by `wire-tenant` AppRole.
- Key rotation policy: 90 dias para transit keys, automatizada via cron + `vault write -f transit/keys/<key>/rotate`.
- HCL policy versionada em git: `vault-policies.hcl` linha XXX.

**CTRL-W-C-025 (Notificação CNCS em ≤ 24h documentada) ↔ DL 20/2025 Art. 23 §1.**

Implementação: playbook `prumo-ir-multitenant` invoca template `distribuicao-classificacao.md` que disparam notificação CNCS para todo o S1 e S2 acima do threshold. Submissão via portal CNCS-CERT.PT. Confirmação de receção arquivada em `secret/data/compliance/notificacoes-cncs/<incident-id>/`.

Evidência:
- Notificações 2025: 3 submetidas, todas dentro do prazo `[CONFIRMAR — números reais]`.
- Acuse de receção CNCS arquivado.
- Procedimento WIRE.PRC.IRT.005 §5 referencia o prazo.

## Templates de notificação CNCS (PT-PT formal)

### 1. Early Warning — T+24h

```
NOTIFICAÇÃO INICIAL DE INCIDENTE — DL 20/2025 ART. 23 §1

A. ENTIDADE NOTIFICANTE
   Designação:     [DESIGNACAO_SOCIAL_WIRE]
   NIPC:           [NIPC_WIRE]
   Categoria:      Fornecedor crítico de entidades essenciais (Anexo I cat. 1.b clientes)
                   + Prestador serviços digitais (Anexo I cat. 8) [CONFIRMAR]
   Ponto contacto: [DPO_NOME], [DPO_EMAIL], [DPO_TEL_24x7]

B. INCIDENTE
   Referência:     wire-ir-[ID]
   Detecção:       [TIMESTAMP_UTC]
   Início:         [TIMESTAMP_UTC] (estimado)
   Estado:         [contido / em mitigação / em investigação]
   Severity:       [S1 / S2]
   Natureza:       [disponibilidade / integridade / confidencialidade / autenticidade]

C. IMPACTO PRELIMINAR
   Entidades essenciais afectadas:    [N] munícipios
   Identificação (NIPCs):             [LISTA ou "ver Anexo Restrito"]
   Serviços essenciais comprometidos: [LISTA_PRODUTOS_WIRE_AFECTADOS]
   Utilizadores impactados (estimativa): [N]
   Impacto transfronteiriço:          [SIM/NÃO — fundamentar]

D. INFORMAÇÃO TÉCNICA PRELIMINAR
   Vector suspeito:  [perímetro/interno/supply-chain/unknown]
   IoCs:             ver anexo TLP:AMBER+STRICT (envio por canal seguro separado)

E. PRÓXIMOS PASSOS
   Submissão da notificação detalhada (Art. 23 §2) prevista para [TIMESTAMP_T+72h].
```

### 2. Notificação Detalhada — T+72h

Estrutura idêntica à anterior, acrescentando:

- **F. Causa Raiz (preliminar):** análise técnica do vector confirmado.
- **G. Medidas de Mitigação Aplicadas:** lista detalhada (contenção, erradicação, recuperação).
- **H. Comunicações Realizadas:** clientes afectados notificados (data, canal), CNPD informado se PII.
- **I. Cooperação:** parceiros envolvidos, partilha de IoCs com CSIRT.PT, indicadores TLP:GREEN partilháveis.

### 3. Relatório Final — T+1 mês

- **J. Causa Raiz Confirmada:** análise forense completa.
- **K. Lições Aprendidas:** controlos novos ou reforçados.
- **L. Plano de Remediação:** acções com prazos, owners, status.
- **M. Indicadores de Recorrência:** controlos de detecção adicionados.
- **N. Sign-off:** CISO, DPO, CTO.

---

## Fontes

- **Directiva (UE) 2022/2555** (NIS2), Dez 2022.
- **DL n.º 20/2025** — transposição portuguesa NIS2, publicado em Janeiro 2025.
- **CNCS-CERT.PT** — Procedimentos de notificação e cooperação (versão pública 2025).
- **ENISA Guidelines for Reporting Significant Incidents** (2024).
- WIRE.PRC.IRT.005, WIRE.POL.SEC.001, WIRE.MTZ.SEC.006 (referências internas).

## Como usar este template em sessão Claude Code

A skill `prumo-compliance-provider` invoca este template em `/prumo-compliance-snapshot`, em prep de auditorias NIS2, em resposta a questionários de cliente que peçam mapeamento DL 20/2025, ou em notificação CNCS durante incidente. Esperar como output: tabela cruzada CTRL-W × artigo + notificações pré-preenchidas com placeholders concretos da sessão. O user revê e submete — a skill nunca envia ao CNCS directamente.

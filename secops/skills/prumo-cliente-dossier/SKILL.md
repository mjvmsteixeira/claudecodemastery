---
name: prumo-cliente-dossier
description: Gerar dossier consolidado de segurança e operação por município cliente. Compila produtos wire* activos, SLA realizado, histórico de incidentes (12 meses), DPIA aplicáveis, controlos específicos do tenant, escalations e contactos. Usa esta skill quando há reunião com cliente, renovação de contrato, resposta a pedido de evidência por DPO municipal, preparação de QBR (quarterly business review), ou auditoria do Tribunal de Contas que envolve o município. Dispara em "dossier do cliente", "tudo sobre o município X", "preparar QBR", "evidência para o DPO", "renovação cliente", "Tribunal de Contas pediu", "auditoria do município".
---

# Wire · Dossier de Cliente

## Pré-requisitos

- AppRole Vault `wire-tenant` (read em `secret/data/tenants/metadata/*`).
- Subagent `prumo-tenant-01` (capability metadata-fetch — ver agent definition).
- Referências:
  - `references/dossier-template.md` — skeleton com placeholders por secção.
  - `references/sla-calculation.md` — fórmulas exactas (uptime, MTTR, MTTD, exclusões).

## Padrão de fetch (sem wrappers)

```bash
# Metadados do cliente via wire-tenant AppRole
TENANT_NIPC="$1"
METADATA=$(V kv get -format=json "secret/data/tenants/metadata/$TENANT_NIPC" \
  | jq -r '.data.data')

if [ -z "$METADATA" ] || [ "$METADATA" = "null" ]; then
  echo "Sem metadata para tenant $TENANT_NIPC em secret/data/tenants/metadata/." \
       "Pede ao admin para criar primeiro."
  exit 1
fi

echo "$METADATA" | jq -r '"Produtos: \(.products | join(", "))\nSLA target: \(.sla.uptime_percent)%\nDPO contact: \(.dpo_email)"'
```

Cross-link: `references/dossier-template.md` tem placeholders para fillin baseado em metadata + SLA queries + incident history (12m).

Cada município é um cliente, mas também é uma entidade essencial NIS2, com obrigações próprias e DPO próprio. Esta skill produz uma vista 360° consolidada sobre o cliente, pronta para reunião, auditoria ou resposta a pedido de informação.

## Quando produzir

- Pedido directo do cliente (DPO municipal, vereador, técnico).
- Pedido de auditor (Tribunal de Contas, IGF, CNCS via cliente).
- Preparação de QBR trimestral.
- Renovação de contrato ou expansão de produtos wire*.
- Antes de uma escalada de incidente onde se prevê comunicação formal.
- Resposta a "right to access" RGPD canalizado pelo município.

## Estrutura do dossier

### 1. Identificação

- Nome do município, NIPC, contacto institucional, DPO contactável.
- Tenant UUID na plataforma Wire.
- Account manager Wire + técnico de referência.

### 2. Produtos activos

| Produto | Versão | Data activação | Utilizadores activos | SLA contratado |
|---------|--------|----------------|----------------------|----------------|
| wireSTUDIO | 7.2 | 2018-03 | 12 editores | 99.5% |
| wirePAPER | 5.4 | 2020-09 | 48 utilizadores back-office | 99.5% |
| wireDESK | 3.1 | 2022-11 | 320 colaboradores | 99.0% |
| ... | ... | ... | ... | ... |

### 3. SLA realizado (últimos 12 meses)

```
Produto       SLA contratado  SLA realizado  Crédito devido?  Notas
wireSTUDIO    99.5%           99.94%         Não              -
wirePAPER     99.5%           99.41%         Sim (0.09%)      Incidente Jan 2026
wireDESK      99.0%           99.92%         Não              -
```

### 4. Histórico de incidentes (12 meses)

Por incidente: ID, data, severidade, produto, impacto, RCA resumido, ligação à comunicação enviada.

### 5. Configurações específicas do tenant

- Customizações activas (templates wireSTUDIO, formulários wireFORMS, integrações).
- Integrações externas autorizadas (ex: AMA, autenticação Gov.pt).
- Restrições de IP / lista de admins privilegiados do tenant.
- Janelas de manutenção preferenciais comunicadas.

### 6. Compliance específica

- Evidência Art. 28 actualizada (último contrato firmado, data).
- DPIA assinadas (por produto).
- Sub-subcontratantes em uso para este cliente.
- Localização de dados (residência) com confirmação por produto.
- Backups: política, retenção, último teste de restore.

### 7. Aspectos NIS2 do cliente

- O município é entidade essencial / importante.
- CSIRT do cliente: nome, contacto, capacidade.
- Procedimentos de notificação acordados (canal, prazo intra-T+24h).
- Exercícios conjuntos realizados em 12m.

### 8. Pedidos pendentes / em curso

- Tickets abertos por severidade.
- Pedidos de feature.
- Casos jurídicos / privacidade activos.

### 9. Riscos identificados

- Lista curta (≤5) com plano e responsável.

### 10. Recomendações Wire para o cliente

Linha proactiva: o que o município deveria fazer / melhorar do seu lado (formação, MFA, revisão de acessos), para reduzir risco conjunto.

## Workflow

1. **Recebe input.** Nome do município OU tenant UUID.
2. **Recolha automatizada.** Subagent `prumo-tenant-01` puxa metadados (produtos, versões, contratos), `prumo-monitor-01` puxa SLA realizado, `prumo-compliance-01` puxa evidência regulatória.
3. **Aplica template.** Estrutura 10 secções acima.
4. **Limpa para distribuição.**
   - Remove referências a outros tenants.
   - Garante que nenhum dado de outro cliente vaza.
   - Tag classification: Confidencial — Wire + Município <nome>.
5. **Geração formal.** DOCX via Cowork `ai-rep-01`, com cabeçalho/rodapé Wire + identificação do cliente. Saída em `/shared/reports/output/dossier-<municipio>-<YYYY-MM-DD>.docx`.
6. **Registo da emissão.** Log no audit trail (quem pediu, quando, a quem foi enviado).

## Princípios não-negociáveis

1. **Um dossier = um cliente.** Nunca produz comparações entre clientes no mesmo dossier.
2. **Cross-tenant queries para gerar dossier são auditadas.** Cada acesso fica registado.
3. **DPIA assinada é evidência de tratamento autorizado** — sem isso, dossier marca como pendente.
4. **Dados em incidente activo não vão para dossier sem aprovação do IR lead.**
5. **Distribuição controlada.** Dossier marcado com watermark do destinatário; entrega via canal seguro.

## Limites

- Não substitui briefing do account manager.
- Recomendações são técnicas; comerciais são adicionadas pelo AM.
- Não inclui informação financeira/comercial sem autorização da Direcção.

## Referências

- `references/dossier-template.docx` — template institucional.
- `references/sla-calculation.md` — fórmula oficial Wire para cálculo de SLA.
- `references/distribuicao-classificacao.md` — política de classificação e distribuição.
- WIRE.PRC.AUD.004 — auditoria e retenção.

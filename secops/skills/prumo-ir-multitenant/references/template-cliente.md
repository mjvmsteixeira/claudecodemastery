# Template — Comunicação de Incidente à Empresa Cliente

**Skill:** `prumo-ir-multitenant` · **Versão:** v0.4.0 · **Última actualização:** 2026-07-07

> Template referenciado pela skill `prumo-ir-multitenant`. Comunicação do subcontratante
> (Wire) ao responsável pelo tratamento (empresa cliente) na sequência de um incidente que
> afecte dados pessoais — RGPD Art. 33 §2 (notificação sem demora injustificada) e Art. 28 §3
> al. f) (dever de assistência). Complementa, não substitui, a notificação ao CNCS
> (`cncs-template.md`) enquanto fornecedor crítico NIS2 (DL 20/2025).
> Marca `[CONFIRMAR]` os campos que dependem de decisões Wire-specific ainda não tomadas.

## Quando enviar

- **T+24h** (pelo menos comunicação inicial), a contar da confirmação do incidente na timeline.
- Actualizações subsequentes a cada mudança material de severidade ou âmbito.
- Comunicação de encerramento com o post-mortem resumido.

## Cabeçalho

```markdown
# Notificação de Incidente de Segurança — [EMPRESA]

**Para:** [NOME_DPO_OU_RESPONSAVEL] · [EMAIL]
**Empresa cliente:** [EMPRESA]
**NIF:** [NIF]
**Produtos afectados:** [LISTA_WIRE_PRODUCTS]
**Referência interna do incidente:** [INCIDENT_ID]
**Emitido por:** Wire SecOps (subcontratante, RGPD Art. 28)
**Data/hora (UTC):** [DATA_UTC]
**Classificação:** [CONFIRMAR: Confidencial / Restrito]
```

## Corpo (secções obrigatórias)

### 1. Natureza do incidente
Descrição factual e não-técnica do que ocorreu. Deriva da timeline. Sem especulação.
`[DESCRICAO]`

### 2. Categorias e volume de dados afectados
- Categorias de dados pessoais envolvidas: `[CATEGORIAS]`
- Titulares afectados (estimativa): `[N_TITULARES]`
- Registos afectados (estimativa): `[N_REGISTOS]`

### 3. Consequências prováveis
`[IMPACTO_PROVAVEL]` (ex.: risco de acesso não autorizado, indisponibilidade temporária).

### 4. Medidas adoptadas e propostas
- Medidas de contenção já aplicadas: `[MEDIDAS_CONTENCAO]`
- Medidas de remediação em curso: `[MEDIDAS_REMEDIACAO]`
- Recomendações à empresa cliente: `[RECOMENDACOES]`

### 5. Ponto de contacto
`[NOME_IR_LEAD]` · `[EMAIL]` · `[TELEFONE]`

## Notas de conformidade
- Se o incidente representar risco elevado para os direitos e liberdades dos titulares, a
  empresa cliente (responsável pelo tratamento) tem obrigação própria de comunicar aos
  titulares — RGPD Art. 34. Este template assiste-a mas não a dispensa.
- Preservar cópia da comunicação e do acuse de recepção no case file
  (`${PRUMO_FORENSICS_DIR}/[INCIDENT_ID]/comms/`).

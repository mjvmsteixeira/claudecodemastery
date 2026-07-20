---
name: prumo-ir-multitenant
description: Resposta a Incidentes (IR) para incidentes que afectam dois ou mais municípios clientes na plataforma Wire, ou que envolvem componentes partilhados (infra, Vault, base de dados central, autenticação, CDN). Usa esta skill quando o incidente tem blast radius cross-tenant, quando há suspeita de cadeia de fornecimento (supply-chain), quando a contenção exige decisão de cortar uma feature ou um produto wire* inteiro, ou quando se preparam notificações simultâneas a múltiplos municípios e ao CNCS. Dispara em "incidente afecta vários", "vazamento entre tenants", "ataque à plataforma", "indisponibilidade generalizada", "supply-chain", "preparar notificação CNCS multi-cliente".
---

# Wire · Resposta a Incidentes Multi-Tenant

## Pré-requisitos

- `prumo-base` instalado para `V()` (`lib/vault-env.sh`).
- AppRole Vault `wire-ir` activo (TTL=15m).
- Env vars: `${PRUMO_FORENSICS_DIR}` (default `$HOME/forensics`), `${PRUMO_LOG_DIR}`.
- Referências de progressive disclosure:
  - `references/severity-matrix.md` — decision tree S1/S2/S3/S4.
  - `references/timeline-template.md` — formato canónico de timeline cruzada.
  - `references/distribuicao-classificacao.md` — TLP + templates de comunicação a clientes/CNCS.
  - `references/template-cliente.md` — comunicação ao município.
  - `references/cncs-template.md` — notificação ao CNCS em três fases.

## Se uma referência estiver em falta — PARA

Esta skill delega decisões a ficheiros de `references/`. **Se um deles não existir, não improvises: pára e assinala.**

Classificar severidade com uma matriz inventada, ou redigir uma notificação regulatória a partir de um template que não existe, produz uma peça que *parece* institucional e não tem fundamento nenhum. Sob pressão de incidente, ninguém dá pela diferença — e é essa a razão de isto ser uma paragem e não um aviso.

Comportamento exigido: diz qual o ficheiro em falta, o que ele deveria fixar, e pergunta como proceder. Prossegue sem ele apenas com instrução explícita do utilizador, e nesse caso marca no output que a peça foi produzida sem base documental.

Aplica-se também ao **estado** das referências: todas trazem um cabeçalho de validação. As que estiverem marcadas como rascunho não validado **não podem sair para destinatário externo** — município, CNCS ou CNPD — sem visto do Coordenador SecOps. Assinala isso ao entregar.

## Vault audit hash (para correlation evidence — CTRL-W-IR-007)

```bash
# Hash HMAC de token suspeito para correlacionar com Vault audit log sem expor o token
curl -s -k -H "X-Vault-Token: $VAULT_TOKEN" \
  --data '{"input":"<token-suspeito-base64>"}' \
  "${VAULT_ADDR}/v1/sys/audit-hash/file" | jq -r '.data.hash'
```

(O AppRole `wire-ir` tem `update` em `sys/audit-hash/*` per `vault-policies.hcl`.)

A diferença operacional crítica: enquanto um município gere o seu próprio incidente, a Wire pode estar a gerir um incidente que **atinge dezenas em simultâneo**. As decisões têm consequência colectiva e contratual.

## Critério para activar esta skill

Um incidente é "multi-tenant" se **qualquer** das condições se verificar:

- Afecta ≥2 municípios na mesma janela temporal.
- Atinge componente partilhado (load balancer, Vault, DB de plataforma, IdP, build pipeline).
- Origem suspeita em dependência terceira (lib, container base, CDN, serviço externo).
- Há indícios de exfiltração que cruzam tenant boundaries.
- Há decisão pendente sobre desligar funcionalidade para todos.

Se for incidente **isolado a um único cliente**, usa `prumo-cliente-dossier` em modo de IR pontual.

## Ciclo (NIST SP 800-61 adaptado para SaaS provider)

### 1. Detecção & Análise

- Recolhe evento(s) origem do Wazuh com `rule_id` + janela.
- **Correlação obrigatória Wazuh ↔ Fortigate.** Para cada evento Wazuh do incidente, valida se há correspondência no Fortigate (hits IPS, sessões, WAF blocks na mesma origem e janela ±15min). Alerta Wazuh sem correspondência Fortigate é red flag — assume potencial lateral movement, evasão IDS ou supply chain comprometida.
- Cruza com painel `/prumo-saas-health` para confirmar blast radius.
- Identifica:
  - **Lista de tenants afectados** (UUID + nome do município).
  - **Produtos wire* afectados** (com versão Rails respectiva).
  - **Tipo de impacto:** disponibilidade / integridade / confidencialidade.
  - **Vector de entrada:** perímetro (Fortigate viu) vs interno (Fortigate não viu, supply chain provável).
  - **Cadeia de dependência exposta** (gems Ruby partilhados entre produtos com mesma versão Rails são vector de propagação).
- Classifica severidade (S1–S4) usando os critérios em `references/severity-matrix.md`.
- **S1/S2 abre ponte permanente CSIRT.** Comunicação contínua até resolução.

### 2. Contenção

Tomar decisão difícil: contenção parcial (cortar uma feature) vs total (desligar produto). Critérios:

- **Vazamento confirmado de dados pessoais →** contenção imediata, mesmo com indisponibilidade.
- **Indisponibilidade sem evidência de comprometimento →** mitigar mantendo serviço, escalar à engenharia.
- **Dúvida razoável de comprometimento →** preservar evidência antes de qualquer reset; assume contenção parcial.

Toda a contenção em produção exige aprovação **N2** explícita do Coordenador SecOps Wire. Operação destrutiva em pipeline ou Vault exige aprovação **N3** (CTO).

### 3. Erradicação

- Patch/rollback aplicado em ambiente de pré-prod, validado em dry-run multi-tenant (mínimo 5 tenants representativos).
- Rotação de credenciais expostas (Vault).
- Re-issuing de chaves de cifra por tenant se aplicável.

### 4. Recuperação

- Restauro tenant-a-tenant, ordenado por SLA crítico → não-crítico.
- Monitorização reforçada por 72h.
- Validação por amostragem de queries de tenant sentinel.

### 5. Notificações (paralelas à acção técnica)

**O timing é regulatório, não opcional.**

| Destinatário | Quando | O quê |
|--------------|--------|-------|
| **Coordenador SecOps + CTO Wire** | T+0 | Alerta interno via canal IR |
| **Municípios afectados** | T+24h (pelo menos comunicação inicial) | Subcontratante notifica responsável (RGPD Art. 33 §2). Template em `references/template-cliente.md` |
| **CNCS** | T+24h alerta inicial, T+72h actualização, T+30d relatório final | Wire enquanto fornecedor crítico; cada município notifica como entidade essencial (paralelo) |
| **CNPD** | T+72h se vazamento de dados pessoais com risco | Cada município notifica como responsável; Wire apoia com factos técnicos |
| **Parceiros** | Conforme contratos | Caso CDN/IdP terceiros relevantes |

### 6. Lições aprendidas

- Post-mortem **factual**, sem culpa pessoal.
- Identifica controlos a reforçar (referência aos CTRL-W-*).
- Actualiza:
  - Wazuh rules (assinaturas novas).
  - Runbooks.
  - Esta skill, se aplicável.

## Cadeia de custódia

- Evidência hashada (SHA-256), guardada em `${PRUMO_FORENSICS_DIR:-$HOME/forensics}/wire-<incident-ID>/`.
- Toda a evidência referenciada no ticket institucional (GLPI ou equivalente Wire).
- Acesso à evidência audit-logado.

## Princípios não-negociáveis

1. **Preservar antes de remediar.** Snapshot, dump, hash, depois corrige.
2. **Cross-tenant queries de IR exigem audit.** Mesmo em emergência, log + justificação.
3. **Comunicação a clientes é por subcontratante,** não por município. Não delegues a comunicação primária.
4. **Não atribuir culpa** em comunicação ao cliente; reportar factos, impacto, mitigação.
5. **Second-opinion obrigatório** em qualquer acção destrutiva (Ollama qwen3-coder local valida).

## Outputs

- Timeline cruzada (`references/timeline-template.md`).
- Lista de tenants afectados com nível de impacto.
- Mapping para o CNCS-form (`references/cncs-template.md`).
- Comunicação por cliente (parametrizada com tenant_id e impacto específico).
- Post-mortem público (resumido) + interno (completo).

## Referências

- `references/severity-matrix.md` — S1–S4 com exemplos.
- `references/template-cliente.md` — comunicação ao município.
- `references/cncs-template.md` — notificação ao CNCS.
- `references/timeline-template.md` — timeline cruzada.
- WIRE.PRC.IRT.005 — Procedimento IR Wire.
- DL 20/2025 (NIS2) Art. 21 — notificações.
- RGPD Art. 33 — notificação de violação.

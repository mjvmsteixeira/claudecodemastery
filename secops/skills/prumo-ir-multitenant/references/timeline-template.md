# Timeline cruzada · formato canónico

> **Estado: rascunho operacional.** Formato derivado do `SKILL.md` (correlação Wazuh ↔ Fortigate,
> cadeia de custódia) e do WIRE.PRC.IRT.005. Validar com o Coordenador SecOps antes de servir de
> base a peça formal.

A timeline é a peça central do incidente: alimenta o post-mortem, as notificações e, se houver processo, a prova. Escreve-se **durante**, não no fim — uma timeline reconstruída de memória perde exactamente os instantes que interessam.

## Regras de escrita

1. **UTC sempre**, formato `YYYY-MM-DDTHH:MM:SSZ`. Os servidores `wire*` estão em fusos e horários de verão diferentes; misturar locais torna a correlação impossível.
2. **Uma linha por facto observado.** Interpretações vão na coluna própria, marcadas como tal.
3. **Facto e hipótese nunca na mesma coluna.** O que a hipótese custa é ser revista; o que um facto mal registado custa é a credibilidade do documento todo.
4. **Cada linha aponta para evidência** — `rule_id` do Wazuh, ID de sessão do Fortigate, caminho do artefacto em `${PRUMO_FORENSICS_DIR}/wire-<incident-ID>/`, hash SHA-256.
5. **Append-only.** Corrigir é acrescentar uma linha nova a rectificar a anterior, nunca editar a original. Se editares, a cadeia de custódia deixa de valer.
6. **T0 é o instante do conhecimento**, não o da origem. Ambos ficam registados; é o T0 que faz correr os prazos regulatórios.

## Cabeçalho

```
Incidente:        wire-<ID>
Severidade:       S<n>  (máxima atingida: S<n>)
Detectado em:     <UTC>          ← T0, arranca os prazos
Origem estimada:  <UTC>          ← quando terá começado, se distinto
Fecho:            <UTC>
Coordenador:      <nome>
Tenants:          <n> municípios (lista em anexo)
Produtos:         wire<X> (Rails <v>), wire<Y> (Rails <v>)
Componentes:      <partilhados envolvidos>
TLP:              <ver distribuicao-classificacao.md>
```

## Corpo

| # | UTC | Fonte | Facto observado | Correlação | Interpretação | Evidência |
|---|-----|-------|-----------------|------------|---------------|-----------|
| 1 | `2026-…T14:02:11Z` | Wazuh | `rule_id=5710` · 40 auth falhadas para `wire-srv-03` | Fortigate: sessões da mesma origem 14:01:47Z | *Hipótese:* brute-force a partir do exterior | `evidence/wazuh-5710.json` · `sha256:…` |
| 2 | `2026-…T14:03:02Z` | Fortigate | IPS bloqueou origem `<IP>` | — | Perímetro conteve | `evidence/fgt-ips-…log` |
| 3 | `2026-…T14:22:40Z` | Wazuh | Acesso bem-sucedido a `wire-srv-07` | **sem correspondência Fortigate** | *Hipótese:* movimento lateral. Sobe a S2 pela regra do sinal ausente | `evidence/wazuh-…json` |

Colunas mínimas: hora, fonte, facto, evidência. As de correlação e interpretação podem ficar vazias mas não devem ser removidas — uma célula vazia na coluna "Correlação" é ela própria informação (é o sinal ausente).

## Marcos obrigatórios

Estes têm de constar, com hora, mesmo que a resposta seja "não aplicável":

- **T0** — conhecimento do incidente, e por que via
- **Classificação inicial** de severidade, e com que critério
- **Cada reclassificação**, com o facto que a motivou e quem a decidiu
- **Abertura da ponte CSIRT** (S1/S2)
- **Cada decisão de contenção**, com o nível de aprovação (N1/N2/N3) e quem aprovou
- **Preservação de evidência** — antes de cada acção destrutiva, conforme o princípio "preservar antes de remediar"
- **Cada notificação enviada** — destinatário, hora, versão do texto
- **Erradicação aplicada** e validação em dry-run multi-tenant
- **Início e fim** da monitorização reforçada de 72h
- **Fecho**, com severidade máxima atingida

## Secção de decisões

Separada do corpo, porque tem leitores diferentes — o post-mortem e, eventualmente, o auditor.

```
D<n> · <UTC> · <decisão tomada>
  Contexto:     o que se sabia nesse instante
  Alternativas: as que foram ponderadas
  Escolha:      o que se decidiu e com que fundamento
  Aprovação:    N<n> por <nome>, <UTC>
  Reversível:   sim/não · se sim, como
```

Regista o que se sabia **naquele momento**, não o que se veio a saber. Uma decisão razoável com informação incompleta não é um erro, e o post-mortem tem de conseguir distinguir as duas coisas.

## Cadeia de custódia

Toda a evidência em `${PRUMO_FORENSICS_DIR:-$HOME/forensics}/wire-<incident-ID>/`, com hash à recolha:

```bash
find "${PRUMO_FORENSICS_DIR:-$HOME/forensics}/wire-<ID>/evidence" -type f -exec shasum -a 256 {} \; \
  > "${PRUMO_FORENSICS_DIR:-$HOME/forensics}/wire-<ID>/MANIFEST.sha256"
```

Para correlacionar um token suspeito com o audit log do Vault sem o expor, usa o `sys/audit-hash/file` documentado no `SKILL.md` — o HMAC entra na timeline, o token nunca.

Acesso à evidência é audit-logado. Queries cross-tenant durante o IR exigem log e justificação, mesmo em emergência.

## Fecho

Ao fechar, a timeline deve permitir a alguém que não esteve lá responder, só com ela: o que aconteceu, quando se soube, o que se decidiu e porquê, o que foi notificado a quem e quando, e o que ficou por resolver.

Se não responder a uma destas, ainda não está fechada.

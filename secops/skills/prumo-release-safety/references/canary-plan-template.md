# Plano de canary — critérios e template

> **Estado: método definido; a lista de tenants representativos é decisão vossa e não consta aqui.**
>
> Os critérios de selecção, os degraus de promoção e as regras de aborto são escrevíveis e estão
> abaixo. **Que municípios concretos compõem o painel é uma escolha deliberada** sobre que
> características do parque se quer exercitar antes de expor os 170. Não se deduz do código nem se
> infere de um inventário — depende de contratos, criticidade e apetite ao risco. Preencher a
> secção "Painel" e validar com SRE e SecOps.

## Porque é que a lista não pode ser automática

A tentação é escolher "os 5 maiores" ou "5 ao acaso". As duas falham pela mesma razão: o canary não existe para cobrir *volume*, existe para cobrir *variedade de caminhos de código*.

Um município grande com configuração-padrão exercita menos caminhos do que um pequeno com integração à medida. Se o painel não incluir o caso raro, o canary passa e a promoção a 100% rebenta no primeiro tenant que não se parece com os outros.

## Critérios de composição

O painel deve cobrir, no conjunto, todas as dimensões seguintes. Não é um município por critério — é um painel que, somado, as toca todas.

| Dimensão | Porquê | A cobrir |
|---|---|---|
| **Volume** | Carga expõe contenção e locks que baixo volume esconde | ≥1 alto, ≥1 baixo |
| **Produtos contratados** | O release toca produtos; o painel tem de os incluir | Todos os afectados |
| **Versão de Rails** | Pools em 6.1 a 7.2; o comportamento diverge | Todas as afectadas |
| **Configuração** | Integrações à medida são o que rompe primeiro | ≥1 padrão, ≥1 à medida |
| **Volume de dados** | Migrations comportam-se de forma diferente em tabelas grandes | ≥1 com dataset grande |
| **Criticidade** | Um município em época de pico não é bom canary | Evitar os críticos no degrau 1 |
| **Fuso e padrão de uso** | A janela de baixa carga não é a mesma para todos | Considerar na janela |

Duas regras que evitam a maioria dos erros:

- **Nunca pôr no primeiro degrau um município em época crítica** — período eleitoral, prazo de IMI, campanha de matrículas. O canary é onde se espera falhar.
- **Manter o painel estável entre releases.** Rodá-lo a cada release destrói a comparabilidade histórica: deixa de se saber se a métrica mudou por causa do release ou do painel. Rever trimestralmente, não a cada entrega.

## Template

```
PLANO DE CANARY
Release:     <id> @ <SHA>
Produto(s):  <wire*>
Tipo:        <feature | bugfix | hotfix | migration>
Autor:       <nome>          Data: <data>

PAINEL  (preenchido a partir da lista validada — CTRL-W-R-012)
| Município | Tenant ID | Produtos | Rails | Volume | Config | Porque está no painel |
|-----------|-----------|----------|-------|--------|--------|------------------------|
|           |           |          |       |        |        |                        |

Cobertura das dimensões:
  Volume alto/baixo:     <sim/não>
  Todos os produtos:     <sim/não>
  Todas as versões Rails:<sim/não>
  Config à medida:       <sim/não>
  Dataset grande:        <sim/não>
Lacunas assumidas: <dimensão não coberta e porquê>

DEGRAUS
  1.  5% · 24h · <municípios do degrau 1>
  2. 25% · 24h · <+ municípios>
  3. 50% · 12h · <+ municípios>
  4. 100%      · parque completo

  Promoção exige verificação humana em cada degrau. Não automatizar.

MÉTRICAS DE PROMOÇÃO  (comparadas com o baseline do produto, não com absolutos)
  p95:              dentro de <n>× baseline
  Taxa de erro 5xx: <= baseline + <n>pp
  Tickets suporte:  sem aumento atribuível
  Alertas Wazuh:    sem alerta novo atribuível ao release
  Métricas de DB:   locks, slow queries, conexões dentro do normal

ABORTO IMEDIATO  (não esperar pelo fim do degrau)
  - Erro que afecte integridade de dados
  - Qualquer indício de fuga cross-tenant
  - p95 > 3× baseline sustentado 5 min
  - Taxa de erro > 5% sustentada 5 min
  - Migration a falhar a meio num tenant

JANELA
  Início:  <data/hora + fuso>
  Evitar:  <épocas críticas dos municípios do painel>

RESPONSÁVEIS
  Promoção:  <nome>       Aborto: <nome> (autoridade para abortar sem consulta)
```

## Regras de promoção

1. **Cada degrau corre o tempo mínimo completo.** Encurtar porque "está tudo bem" anula o efeito — os problemas que o canary apanha são os que só aparecem sob carga real, ao fim de horas: acumulação de memória, saturação de pool de conexões, jobs agendados.
2. **Um degrau sem tráfego representativo não conta.** 24h em fim-de-semana num produto de atendimento ao munícipe é 24h sem sinal. Se a janela apanhar período morto, estende-se.
3. **Métricas contra o baseline do produto.** Com produtos entre 95 ms e 310 ms de p95 normal, um limiar absoluto não serve para nenhum.
4. **Aborto não precisa de consulta.** Quem tem autoridade para abortar aborta e explica depois. Uma decisão de aborto que espera por reunião já não é uma decisão de aborto.
5. **Aborto é evento, não fracasso.** Regista-se no plano com o que se aprendeu; alimenta os critérios do painel seguinte.

## Casos especiais

- **Hotfix de segurança** — pode justificar canary comprimido, mas **nunca ausente**. Comprimir tempo, não degraus; documentar a compressão como ressalva do `GO_COM_CONDICOES`.
- **Migration destrutiva** — o canary de código não valida a migration. Esta corre com o seu próprio plano, com rollback testado (CTRL-W-R-009). Ver `rollback-template.md`.
- **Feature atrás de flag** — o canary é da flag, não do deploy. O código pode ir a 100% com a flag desligada; o painel aplica-se à activação.

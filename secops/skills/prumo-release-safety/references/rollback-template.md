# Plano de rollback — template

> **Estado: template operacional.** Estrutura derivada dos princípios do `SKILL.md` (CTRL-W-R-009 e
> CTRL-W-R-013) e da stack real: Capistrano sobre Puma + systemd, PostgreSQL por tenant. Validar os
> tempos-alvo com SRE.

Um plano de rollback existe para ser executado por alguém sob pressão, possivelmente de madrugada, possivelmente não quem escreveu o código. Se precisar de interpretação, não serve.

## A pergunta que determina tudo

**O rollback de código é fácil. O rollback de dados pode ser impossível.**

Capistrano reverte um release em segundos — `cap production deploy:rollback` troca o symlink e reinicia o Puma. Uma migration que largou uma coluna não se desfaz: a coluna volta, os dados não.

Por isso a primeira secção do plano não é o procedimento, é a classificação:

| Classe | Migration | Rollback | Consequência |
|---|---|---|---|
| **A** | Sem migration | Código apenas | Segundos. Reversível |
| **B** | Aditiva (nova coluna/tabela, nullable) | Código; schema pode ficar | Segundos. Reversível |
| **C** | Transformadora (backfill, mudança de tipo) | Código + `down` testado | Minutos. Reversível com plano |
| **D** | Destrutiva (drop de coluna/tabela, purga) | **Restauro de backup** | Horas. Perda de dados desde o backup |

**Classe D não tem rollback — tem recuperação de desastre.** Um plano que trate um drop como reversível está errado, e a altura de descobrir isso não é durante a execução.

A consequência prática: preferir sempre *expand/contract*. Fase 1 aditiva (classe B) vai a produção e estabiliza; fase 2 destrutiva (classe D) só depois de a anterior estar validada em 100% durante tempo suficiente. Entre as duas, o rollback é sempre barato.

## Template

```
PLANO DE ROLLBACK
Release:     <id> @ <SHA>          Rollback para: <SHA anterior>
Produto(s):  <wire*>               Classe: <A | B | C | D>
Autor:       <nome>                Data: <data>

TEMPO-ALVO
  Decisão:    <n> min do sintoma à decisão
  Execução:   <n> min da decisão ao serviço reposto
  RTO total:  <n> min
  RPO:        <0 para A/B/C | <n> min para D — indicar a perda máxima aceite>

QUEM DECIDE
  Autoridade para reverter: <nome/papel>
  Sem necessidade de consulta: <sim/não>
  Escalada se indisponível:  <nome>

GATILHOS  (objectivos — não "se parecer mau")
  - Taxa de erro > <n>% sustentada <n> min
  - p95 > <n>× baseline sustentado <n> min
  - Qualquer erro de integridade de dados
  - Qualquer indício de fuga cross-tenant
  - <gatilho específico deste release>

PROCEDIMENTO
  0. PRESERVAR ANTES DE REVERTER
     - Snapshot do estado actual e recolha de logs
     - Se houver suspeita de comprometimento: parar e passar a IR
       (o rollback destrói evidência)
  1. <passo>            comando: <exacto>     verificação: <como se sabe que resultou>
  2. …
  N. Confirmar reposição por tenant do painel de canary

MIGRATION  (preencher se classe C ou D)
  Script down:        <caminho>
  Testado em pré-prod:<data> · <quem> · <evidência>          ← CTRL-W-R-009
  Tempo estimado:     <n> min sobre o maior dataset do parque
  Bloqueia escritas:  <sim/não — se sim, durante quanto tempo>
  Se falhar a meio:   <estado em que fica e o que fazer a seguir>

  Classe D acrescenta:
  Backup a restaurar: <identificação e idade>
  Restauro testado:   <data do último teste de restauro>
  Perda de dados:     <janela concreta>
  Quem autoriza:      <N3 — a decisão é de perda de dados, não técnica>

FEATURE FLAG  (se aplicável — CTRL-W-R-010)
  Flag:          <nome>
  Desligar via:  <mecanismo>
  Tempo:         <segundos>
  Chega por si?: <sim → tentar primeiro, antes do rollback de código>

APÓS O ROLLBACK
  - Confirmar métricas de volta ao baseline
  - Comunicar aos municípios afectados <se houve impacto visível>
  - Abrir post-mortem
  - Bloquear re-deploy do SHA até causa apurada
```

## Regras

1. **Testar o rollback, não só escrevê-lo.** CTRL-W-R-009 exige `down` validado em pré-prod. Um script nunca executado é uma hipótese.
2. **Tentar a flag antes do rollback.** Se a feature está atrás de flag e o problema é dela, desligar leva segundos e não mexe em código nem schema. É a razão de a flag ser obrigatória em features que tocam dados de tenant.
3. **Preservar antes de reverter.** Espelha o princípio do IR. Um rollback apaga o estado que explicaria a falha; se houver qualquer suspeita de comprometimento, o rollback espera e o IR começa.
4. **Rollback parcial é preferível.** Reverter só os tenants do canary é menos disruptivo do que reverter o parque. Se a arquitectura permitir, o plano deve dizê-lo.
5. **Tempo de decisão faz parte do RTO.** Vinte minutos a debater é indistinguível, para o município, de vinte minutos de indisponibilidade.
6. **Um plano por release.** Reaproveitar o do release anterior é como não ter plano — os passos e a classe mudam com o conteúdo.

## Erros que este template previne

- **Drop tratado como reversível.** A classificação em A–D força a distinção logo no início.
- **`down` que nunca correu.** O campo de teste em pré-prod é obrigatório e datado.
- **Rollback que destrói evidência** de um incidente que ainda ninguém percebeu ser incidente.
- **Migration validada em dataset pequeno.** O tempo estima-se sobre o **maior** dataset do parque, não sobre pré-prod.
- **Ninguém com autoridade para decidir** às 3 da manhã.

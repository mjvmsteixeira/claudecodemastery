# Painel consolidado de isolamento

> **Estado: template operacional.** Consolida o resultado dos CTRL-W-T-001..016 numa vista única.
>
> **Não confundir com o `painel-template.md` do `prumo-saas-monitoring`**, que é o painel de saúde
> da plataforma (`/prumo-saas-health`). São peças diferentes: aquele responde "a plataforma está a
> funcionar?", este responde "o isolamento entre municípios aguenta?". O nome desta foi
> desambiguado precisamente para tornar impossível resolver um pelo outro.

## Para que serve

O relatório por cliente (`template-relatorio.md`) responde a um município sobre o isolamento dele. Este painel é a vista **transversal**: estado dos 16 controlos no parque inteiro, para uso interno.

Serve três leitores com necessidades diferentes: o Coordenador SecOps que quer saber se há fogo, o auditor que quer saber a cobertura, e quem prepara a auditoria seguinte e quer saber o que envelheceu.

## Template

```
== Wire · Isolamento Multi-Tenant · YYYY-MM-DD ==
Âmbito: <parque completo | produto wire* | lista de municípios>
Período auditado: <início> a <fim>
Auditor: <nome> · Ticket: <ref>

CONTROLOS
                                             Conf  N-conf  N/aval  Evidência
Críticos    (001,002,003,004,009,010,016)      -/7    -       -     <ref>
Altos       (005,006,007,008,011,012,015)      -/7    -       -     <ref>
Médios      (013,014)                          -/2    -       -     <ref>
                                              ────
TOTAL                                          -/16

NÃO-CONFORMIDADES
| ID | Controlo | Sev | Âmbito | Evidência | Desde | Acção | Responsável | Prazo |
|----|----------|-----|--------|-----------|-------|-------|-------------|-------|

CONTROLOS NÃO AVALIADOS
| ID | Porque não foi avaliado | O que falta para avaliar |
|----|-------------------------|--------------------------|

SINAIS DE VAZAMENTO REAL  (cross-check, não conformidade)
  Queries sem filtro de tenant (30d):      -
  Logs com tenant_id inconsistente (30d):  -
  Notificações fora do tenant (30d):       -
  Acessos cross-tenant sem ticket (30d):   -
  Exports não rastreados (30d):            -

  Qualquer valor > 0 exige investigação individual antes de fechar o painel.

COBERTURA DA PRÓPRIA AUDITORIA
  Produtos avaliados:     -/10
  Municípios amostrados:  - de 170+
  Controlos por amostragem: <lista — não provam o parque, só a amostra>
  Última auditoria completa: <data>

CONCLUSÃO: <Aprovado | Aprovado com reservas | Reprovado>
Reservas: <lista>
Próxima auditoria: <data>
```

## Regras de preenchimento

1. **"Não avaliado" é uma categoria própria, nunca conforme.** É o erro que mais inflaciona um painel destes: um controlo que ninguém conseguiu verificar aparece como conforme e some da lista de trabalho. Fica em coluna própria, com o que falta para o avaliar.

2. **Não-conformidade crítica torna o painel `Reprovado`**, independentemente das outras 15. Não há média ponderada em isolamento — os controlos críticos são conjuntivos. `15/16` com o RLS em falha não é 94%, é uma plataforma sem isolamento ao nível da base de dados.

3. **A secção de vazamento real é cross-check, não conformidade.** Um controlo pode estar conforme e haver sinal de vazamento — significa que o controlo não cobre o caminho usado. Qualquer valor acima de zero investiga-se antes de fechar o painel, e evidência de vazamento **dispara IR** em vez de continuar em auditoria.

4. **Registar a cobertura da auditoria.** Um painel que diz `16/16` sobre 5 municípios amostrados de 170 não afirma o mesmo que um sobre o parque completo. Sem esta secção, os dois são indistinguíveis para quem lê.

5. **Datar as não-conformidades.** Uma que persiste há três auditorias é um problema diferente de uma detectada hoje, e o painel tem de mostrar a diferença.

## Relação com as outras peças

- **`queries-evidencia.md`** — de onde vêm os números. As limitações de cada query são materiais e devem chegar às reservas do painel.
- **`template-relatorio.md`** — o relatório Art. 28 ao cliente. Deriva deste painel, filtrado ao município, e **nunca inclui dados de outros** — a mesma regra de distribuição do IR.
- **`prumo-ir-multitenant`** — destino obrigatório se houver sinal de vazamento real.
- **`prumo-compliance-provider`** — este painel é evidência directa para os controlos de segregação em auditoria ISO e para o Anexo II do Art. 28.

## Cadência

Rotina semestral, conforme o `SKILL.md`. Fora disso, dispara com: activação de município novo, incidente que envolva aplicação `wire*`, due-diligence de cliente ou auditor, e dúvida operacional concreta de um município.

Um painel com mais de seis meses não descreve a plataforma actual — descreve a que existia quando foi feito.

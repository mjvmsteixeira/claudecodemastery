# DPIA — Avaliação de Impacto sobre a Protecção de Dados

> **Estado: rascunho operacional.** Estrutura derivada do Art. 35 do RGPD e do que o `SKILL.md`
> enumera. **A DPIA final é responsabilidade conjunta do DPO Wire e do DPO do município** — este
> template produz a contribuição técnica da Wire, não a avaliação concluída.

## Quem faz a DPIA

Ponto que se presta a confusão e que convém fixar antes de começar.

A obrigação do Art. 35 recai sobre o **responsável pelo tratamento** — o município. A Wire, enquanto subcontratante, **assiste** (Art. 28(3)(f)) fornecendo a descrição técnica do tratamento, as medidas de segurança implementadas e a informação de risco que só ela conhece.

Consequência prática: a Wire produz uma **DPIA por produto `wire*`**, reutilizável por todos os municípios que o contratem, que cada município adapta ao seu contexto. A avaliação final de necessidade e proporcionalidade é do município — depende das finalidades dele e da base de licitude que invocou, que a Wire não determina.

Não escrever a DPIA como se fosse a avaliação do município. Escrevê-la como o que é: o contributo técnico do subcontratante.

## Quando é obrigatória

O Art. 35(1) exige DPIA quando o tratamento seja susceptível de implicar **risco elevado**. O Art. 35(3) enumera três casos, e a CNPD publica lista de tratamentos sujeitos. Para produtos `wire*`, os gatilhos habituais:

- Tratamento em larga escala de dados de munícipes
- Categorias especiais (Art. 9) — saúde, dados biométricos, convicções
- Avaliação sistemática com efeitos jurídicos ou significativos
- Cruzamento de dados de origens distintas
- Componente de IA com influência em decisão sobre pessoas

Na dúvida, fazer. Uma DPIA desnecessária custa tempo; a ausência de uma necessária é incumprimento.

## Estrutura

### 1. Identificação

```
Produto:            wire<X> · versão <v>
Data:               <data> · Revisão: <n>
Autor (Wire):       <nome> · <cargo>
DPO Wire:           <nome> — parecer em anexo
Âmbito:             <módulos e funcionalidades abrangidos>
Municípios:         <template genérico | específico para <município>>
```

### 2. Descrição sistemática do tratamento (Art. 35(7)(a))

```
Finalidades:            <por conta do responsável>
Categorias de dados:    <lista>
Categorias especiais:   <Sim: … / Não>
Categorias de titulares:<munícipes, funcionários, candidatos, …>
Volume estimado:        <n titulares, n registos>
Origem dos dados:       <recolha directa / importação / integração>
Fluxo:                  <recolha → tratamento → conservação → eliminação>
Destinatários:          <internos e externos>
Sub-subcontratantes:    <remeter para anexoII-template.md, sem duplicar>
Conservação:            <prazos por categoria>
Transferências:         <Não / Sim, com salvaguardas>
Decisões automatizadas: <Não / Sim — descrever lógica, significado e consequências>
```

Se houver componente de IA, a descrição da lógica não é opcional: cruza-se com o Art. 22 e com as obrigações de transparência do AI Act.

### 3. Necessidade e proporcionalidade (Art. 35(7)(b))

Secção onde a Wire **contribui mas não conclui** — a avaliação depende das finalidades do município.

```
Base de licitude:       <invocada pelo responsável>
Minimização:            <por que razão cada categoria é necessária à finalidade>
Exactidão:              <como é assegurada e corrigida>
Limitação da conservação:<justificação dos prazos>
Direitos dos titulares: <como são exercidos e em que prazos>
Transparência:          <como a informação é prestada>
Alternativas ponderadas:<opções menos intrusivas e por que foram afastadas>
```

A linha das alternativas é a mais frequentemente omitida e a que o regulador mais valoriza. Se não foram ponderadas alternativas, a proporcionalidade não foi realmente avaliada.

### 4. Riscos para direitos e liberdades (Art. 35(7)(c))

Avaliar do ponto de vista **do titular**, não da organização. O risco relevante não é o dano reputacional da Wire — é o dano para o munícipe.

| # | Risco | Origem | Probabilidade | Gravidade | Nível | Medidas | Risco residual |
|---|---|---|---|---|---|---|---|
| R1 | Acesso não autorizado a dados de um município por outro | Falha de isolamento multi-tenant | | | | | |
| R2 | Divulgação por comprometimento de credenciais | | | | | |
| R3 | Perda de disponibilidade com impacto em serviço público essencial | | | | | |
| R4 | Conservação além do necessário | | | | | |
| R5 | Tratamento incompatível por sub-subcontratante | | | | | |

Escalas em três níveis (baixo/médio/elevado), com critério escrito para cada. **R1 é o risco estruturante de uma plataforma multi-tenant** e deve ancorar na família `CTRL-W-T-*` e na evidência do `/prumo-tenant-audit`.

### 5. Medidas de mitigação (Art. 35(7)(d))

```
Por risco identificado:
  Medida:            <técnica ou organizativa>
  Controlo Wire:     <CTRL-W-*>
  Evidência:         <artefacto verificável>
  Responsável:       <Wire | município | ambos>
  Estado:            <implementada | em curso, com prazo>
  Risco residual:    <nível após a medida>
```

A coluna "Responsável" é essencial: numa relação responsável/subcontratante há medidas que só o município pode aplicar — gestão de perfis dos seus utilizadores, definição de prazos de conservação, informação aos titulares. Uma DPIA que atribua tudo à Wire dá ao município uma falsa sensação de cobertura.

### 6. Consulta

```
DPO Wire:            parecer de <data> — <anexo>
DPO do município:    <a obter pelo responsável>
Titulares ou representantes: <consultados / não, com justificação — Art. 35(9)>
Consulta prévia à CNPD: <necessária se risco residual elevado se mantiver — Art. 36>
```

### 7. Conclusão e revisão

```
Risco residual global:  <baixo | médio | elevado>
Parecer técnico Wire:   <favorável | favorável condicionado a … | desfavorável>
Decisão final:          do responsável (município)
Revisão:                a cada <n> meses, ou antes se houver alteração material do
                        tratamento, da arquitectura ou do quadro legal
```

Se o risco residual permanecer elevado após todas as medidas, o Art. 36 impõe consulta prévia à autoridade **antes** de iniciar o tratamento. Não é opcional, e o prazo de resposta da autoridade tem de entrar no planeamento do projecto.

## Notas

- **Uma DPIA por produto, não por município.** Adapta-se; não se refaz.
- **Datar e versionar.** Uma DPIA sem data não demonstra nada — o Art. 35(11) exige revisão quando o risco muda.
- **Não confundir com o registo de tratamentos** (Art. 30). O registo é inventário permanente; a DPIA é avaliação de risco pontual e revista.
- **Linguagem acessível.** A DPIA pode ser lida pelo DPO do município, por um vereador e, em caso de inspecção, pela CNPD.

# Anexo II — Termos do subcontratante (RGPD Art. 28)

> **Estado: rascunho operacional.** Estrutura derivada do Art. 28(3) do RGPD e do que o `SKILL.md`
> enumera. **Peça contratual — carece de validação do jurídico e do DPO Wire antes de qualquer
> utilização.** Os campos entre `<…>` são de preenchimento obrigatório; um anexo entregue com
> campos por preencher é pior do que anexo nenhum, porque aparenta ter sido validado.

Este anexo acompanha o contrato de prestação de serviços entre a Wire (**subcontratante**) e o município (**responsável pelo tratamento**). Existe para satisfazer o Art. 28(3), que exige que o tratamento seja regido por contrato que fixe objecto, duração, natureza, finalidade, tipo de dados, categorias de titulares e obrigações das partes.

A parte que muda de município para município é pequena — categorias de dados variam com os produtos contratados. **O resto deve ser idêntico em todos os contratos.** Divergências entre municípios criam obrigações incompatíveis entre si sobre a mesma plataforma partilhada, e é impossível cumprir prazos de notificação diferentes com a mesma infraestrutura.

## 1. Identificação das partes

```
Responsável pelo tratamento:  Município de <nome>
  Encarregado de Protecção de Dados: <nome> · <email>
Subcontratante:               Wire
  Encarregado de Protecção de Dados: <nome> · <email>
Contrato:                     <referência> · <data>
Produtos contratados:         <lista wire*>
```

## 2. Objecto, natureza e finalidade

```
Objecto:     Prestação dos serviços <produtos wire*> em regime SaaS multi-tenant.
Natureza:    Recolha, registo, organização, conservação, consulta, utilização e
             apagamento de dados pessoais, por conta e sob instruções do responsável,
             na medida do necessário à prestação do serviço.
Finalidade:  Exclusivamente a execução do contrato. A Wire não trata os dados para
             finalidades próprias.
Duração:     Vigência do contrato, acrescida do período de devolução/eliminação
             previsto na secção 9.
```

## 3. Categorias de dados pessoais

Por produto. **Preencher apenas os contratados** — listar produtos não contratados alarga indevidamente o âmbito declarado.

| Produto | Categorias de dados | Categorias especiais (Art. 9) |
|---|---|---|
| `wire<X>` | <ex: nome, NIF, morada, contactos> | <Sim: … / Não> |

Se houver categorias especiais, indicar a base de licitude invocada pelo responsável — **a determinação da base é do município, não da Wire**.

## 4. Categorias de titulares

`<munícipes · funcionários do município · candidatos a procedimentos concursais · fornecedores · outros>`

## 5. Medidas técnicas e organizativas (Art. 32)

Descrever **medidas concretas e verificáveis**. Uma lista de generalidades não satisfaz o artigo e é a primeira coisa que um auditor ataca.

```
Isolamento entre responsáveis:  <mecanismo de segregação multi-tenant e como é verificado>
Controlo de acessos:            <modelo, autenticação, gestão de privilégios>
Gestão de credenciais:          <broker de segredos, TTLs, ausência de chaves estáticas>
Cifra em trânsito:              <protocolos e versões mínimas>
Cifra em repouso:               <âmbito e gestão de chaves>
Registo e monitorização:        <o que é registado, retenção, quem acede>
Cópias de segurança:            <frequência, retenção, teste de restauro>
Continuidade:                   <RTO e RPO contratados>
Gestão de vulnerabilidades:     <processo e prazos por severidade>
Desenvolvimento seguro:         <controlos no ciclo de desenvolvimento e release>
Segurança dos recursos humanos: <triagem, confidencialidade, formação>
Eliminação segura:              <procedimento à cessação>
```

Cada linha deve corresponder a um controlo `CTRL-W-*` identificável e com evidência. **Não declarar medida que não seja demonstrável** — o Art. 28(3)(h) dá ao responsável o direito de auditar, e uma medida declarada e não demonstrável é incumprimento contratual.

## 6. Localização do tratamento

```
Localização primária:    <país/região>
Cópias de segurança:     <país/região>
Suporte e administração: <de onde é feito o acesso administrativo>
Transferências para país terceiro: <Não | Sim — ver secção 7>
```

O acesso administrativo a partir de país terceiro **é** transferência, mesmo que os dados fiquem armazenados na UE. Ponto frequentemente omitido.

## 7. Sub-subcontratantes

Autorização do responsável nos termos do Art. 28(2). A lista tem de estar completa — um sub-subcontratante omitido é tratamento não autorizado.

| Entidade | Serviço | Localização | Salvaguardas se fora UE | Autorizado em |
|---|---|---|---|---|
| <cloud provider> | <infraestrutura> | <país> | <CCT / decisão de adequação> | <data> |
| <CDN> | | | | |
| <email transaccional> | | | | |
| <IdP> | | | | |

```
Regime de alteração: a Wire informa o responsável com <n> dias de antecedência sobre
adição ou substituição de sub-subcontratante, podendo o responsável opor-se com
fundamento, nos termos do Art. 28(2).
```

A Wire impõe aos sub-subcontratantes obrigações **não menos exigentes** do que as que assume perante o responsável (Art. 28(4)), e responde perante este pelo incumprimento daqueles.

## 8. Violação de dados pessoais

```
Prazo de notificação ao responsável: sem demora injustificada após ter conhecimento,
  e em qualquer caso até <24h> (Art. 33(2)).
Via:       <canal e destinatários acordados — não a caixa geral>
Conteúdo:  natureza da violação, categorias e número aproximado de titulares e de
           registos, consequências prováveis, medidas aplicadas ou propostas.
Apoio:     a Wire presta ao responsável a informação técnica necessária ao
           cumprimento dos Art. 33 e 34.
```

A notificação à autoridade de controlo é do **responsável**. A Wire notifica o responsável, apoia-o com factos técnicos e não faz avaliação jurídica do risco.

O prazo aqui fixado tem de ser coerente com o `template-cliente.md` do `prumo-ir-multitenant`. **Se divergirem, é o contrato que vale** — e a skill de IR tem de ser corrigida, não o contrário.

## 9. Devolução e eliminação

```
À cessação, por opção do responsável (Art. 28(3)(g)):
  a) devolução dos dados em <formato>, até <n> dias; ou
  b) eliminação, com certificado emitido até <n> dias.
Cópias de segurança: eliminadas no ciclo natural de retenção, até <n> dias, mantendo-se
  inacessíveis para tratamento nesse intervalo.
Conservação obrigatória por lei: <identificar, se aplicável>.
```

## 10. Auditoria

```
Direito do responsável a auditar (Art. 28(3)(h)), com pré-aviso de <n> dias.
Em alternativa aceite pelas partes: relatório de auditoria independente e
Declaração de Aplicabilidade actualizada.
Custos: <regime>
```

Numa plataforma com 170+ municípios, auditorias presenciais individuais não escalam. Daí a alternativa por certificação e relatório — **mas o direito a auditar não pode ser suprimido**, apenas regulado.

## 11. Assistência ao responsável

A Wire assiste o responsável, na medida do possível e considerando a natureza do tratamento (Art. 28(3)(e) e (f)), em: exercício de direitos dos titulares, avaliações de impacto, consultas prévias à autoridade, e segurança do tratamento.

```
Prazo de resposta a pedido de exercício de direitos: <n> dias úteis
Mecanismo: <como o município submete e como a Wire responde>
```

## Notas de utilização

- **Não personalizar as secções 5 a 11 por município.** Só as secções 3 e 4 variam legitimamente.
- Se um município exigir termos mais exigentes, escalar para o jurídico **antes** de aceitar: pode ser exequível, ou pode criar obrigação incompatível com a plataforma partilhada.
- Rever a lista de sub-subcontratantes a cada alteração de infraestrutura. É a secção que desactualiza primeiro e a que tem consequência directa.

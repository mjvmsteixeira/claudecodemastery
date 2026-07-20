# Comunicação ao município · templates

> **Estado: rascunho operacional.** Estes textos produzem uma comunicação com efeitos contratuais e
> regulatórios (RGPD Art. 33 §2, subcontratante → responsável). **Carecem de validação do DPO e do
> jurídico antes do primeiro uso real.** O prazo T+24h é o que o `SKILL.md` fixa; confirmar face ao
> contrato de subcontratação de cada município, que pode ser mais exigente.

Classificação por defeito: **TLP:AMBER**. Cada município recebe apenas o que lhe respeita — nunca a lista dos outros afectados.

## Antes de enviar

Quatro verificações. Falhar qualquer uma é motivo para não enviar ainda:

1. O âmbito estabilizou o suficiente para o texto não ser desmentido em duas horas?
2. O texto está livre de detalhe explorável, de atribuição e de referências a outros municípios?
3. Os factos afirmados estão na timeline com evidência?
4. Todos os municípios afectados recebem **à mesma hora**?

Se o âmbito ainda se move, envia o template 1 — que não promete âmbito — em vez de esperar por certezas.

## Template 1 — Comunicação inicial (T+24h)

Destinatário: responsável pelo tratamento no município (não a caixa geral). Cópia: gestor de conta.

```
Assunto: [Wire] Incidente de segurança com impacto no serviço — comunicação inicial

Exmo.(a) Senhor(a) <cargo>,

Ao abrigo do contrato de subcontratação em vigor e do disposto no artigo 33.º, n.º 2
do RGPD, a Wire comunica a ocorrência de um incidente de segurança que afecta o
serviço prestado ao Município de <nome>.

O QUE ACONTECEU
<Dois a três parágrafos, factuais. O que foi observado, não o que se suspeita.
Sem detalhe técnico que permita reproduzir.>

QUANDO
Detectado a <data/hora local>. <Se a origem estimada for anterior e estiver
confirmada, indicar. Caso contrário, omitir — não especular.>

IMPACTO NO VOSSO SERVIÇO
Produtos afectados: <lista, só os deste município>
Período de indisponibilidade ou degradação: <intervalo>
Dados pessoais envolvidos: <Sim, das seguintes categorias: … | Não | Em apuramento>
Funcionalidades não afectadas: <o que continuou a funcionar>

O QUE JÁ FIZEMOS
<Contenção aplicada, por ordem cronológica. Estado actual do serviço.>

O QUE PEDIMOS QUE FAÇAM
<Acções concretas, ou "Não é necessária qualquer acção da vossa parte neste
momento." Se houver dever de notificação do município enquanto responsável,
indicá-lo aqui de forma explícita.>

PRÓXIMA COMUNICAÇÃO
Até <data/hora>, ou antes se houver desenvolvimento relevante.

CONTACTO
<nome> · <cargo> · <email> · <telefone>
Referência do incidente: wire-<ID>

TLP:AMBER — destinada à vossa organização e a quem por ela seja responsável.

<assinatura institucional>
```

## Template 2 — Actualização

Só quando há facto novo. Uma actualização que não acrescenta nada gasta a atenção de que vais precisar na seguinte.

```
Assunto: [Wire] Incidente wire-<ID> — actualização <n>

Exmo.(a) Senhor(a) <cargo>,

Actualização à comunicação de <data>, referente ao incidente wire-<ID>.

O QUE MUDOU DESDE A ÚLTIMA COMUNICAÇÃO
<Só o novo.>

ESTADO ACTUAL DO VOSSO SERVIÇO
<Normal | Degradado: … | Indisponível: …>

CORRECÇÃO AO QUE FOI COMUNICADO ANTES
<Se algo antes comunicado se revelou incorrecto, corrigir aqui, de forma
explícita. Nunca corrigir em silêncio.>

PRÓXIMA COMUNICAÇÃO
<data/hora>

Referência: wire-<ID> · TLP:AMBER
```

A secção de correcção existe de propósito. Num incidente, comunicar cedo implica comunicar com informação incompleta; a alternativa — esperar pela certeza — é pior e viola o prazo. O que preserva a confiança é corrigir de forma visível.

## Template 3 — Encerramento

```
Assunto: [Wire] Incidente wire-<ID> — encerramento

Exmo.(a) Senhor(a) <cargo>,

O incidente wire-<ID> foi encerrado a <data/hora>.

RESUMO
<O que aconteceu, em linguagem acessível a não-técnico.>

IMPACTO FINAL NO VOSSO SERVIÇO
Indisponibilidade total: <duração>
Dados pessoais afectados: <Sim: … | Não>
<Se sim: categorias, número aproximado de titulares, e se o município tem
dever de notificação à CNPD enquanto responsável.>

CAUSA
<Causa apurada. Se ainda em investigação, dizê-lo — não fechar com uma causa
provisória apresentada como definitiva.>

O QUE FOI CORRIGIDO
<Correcção aplicada e validada.>

O QUE VAMOS MUDAR
<Medidas para reduzir recorrência, com prazos.>

DOCUMENTAÇÃO
Relatório detalhado disponível a pedido, ao abrigo do contrato.

Referência: wire-<ID> · TLP:AMBER
```

## Notas de redacção

- **Português europeu, registo institucional.** Estas cartas podem ir a reunião de câmara e a processo.
- **Sem jargão sem tradução.** "Movimento lateral" não diz nada a um vereador; "o atacante conseguiu passar de um servidor para outro dentro da nossa infraestrutura" diz.
- **Voz activa e sujeito assumido.** "A Wire detectou", não "foi detectado". A construção impessoal lê-se como fuga à responsabilidade.
- **Nunca minimizar.** "Apenas alguns registos" transforma-se em problema quando o número real aparecer.
- **Nada de desculpas antes dos factos.** O pedido de desculpas vem depois de dizer o que aconteceu, não em vez disso.
- **Se não sabes, escreve que não sabes** e quando saberás. "Em apuramento, com actualização até às 18h" é uma resposta profissional; uma estimativa apresentada como facto não é.

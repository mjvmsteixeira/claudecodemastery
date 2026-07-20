# Classificação TLP e matriz de distribuição

> **Estado: rascunho operacional.** O TLP segue a v2.0 do FIRST; a aplicação aos destinatários Wire
> é proposta e **carece de validação do Coordenador SecOps e do DPO**. A coluna de prazos reproduz
> o que o `SKILL.md` fixa — confirmar com jurídico antes de uma notificação efectiva.

Numa plataforma com 170+ municípios, o erro de distribuição é tão caro como o erro técnico. Mandar detalhe de exploração a 170 destinatários durante um incidente activo é criar 170 novas superfícies de fuga.

## Níveis TLP

| Nível | Quem pode receber | Uso na Wire |
|---|---|---|
| **TLP:RED** | Apenas os nomeados na comunicação | Incidente activo com atacante presente. Detalhe de exploração antes do patch. IoCs que denunciem o que já se sabe. |
| **TLP:AMBER+STRICT** | Só a organização do destinatário | Comunicação a um município sobre impacto que só a ele respeita. |
| **TLP:AMBER** | Organização do destinatário e clientes dele | Comunicação a município que precisa de avisar os seus próprios utilizadores. **Default para comunicação a cliente durante incidente.** |
| **TLP:GREEN** | Comunidade, não público | Partilha de IoCs com o CNCS e pares após contenção. |
| **TLP:CLEAR** | Sem restrição | Post-mortem público, aviso de indisponibilidade já resolvida. |

## Regra de degradação

A classificação **desce** ao longo do incidente, nunca sobe. Um facto que saiu como AMBER não volta a RED — já circulou.

O corolário prático: **em dúvida, classifica mais restritivo**. Desclassificar depois é um envio; reclassificar para cima é impossível.

Trajectória típica de um S1:

```
Detecção ──── RED ──── contenção ──── AMBER ──── erradicação ──── GREEN ──── post-mortem ──── CLEAR
             (interno)              (clientes)                   (CNCS/pares)                (público)
```

## Matriz de distribuição

| Destinatário | Quando | TLP | Conteúdo | Nunca inclui |
|---|---|---|---|---|
| Coordenador SecOps + CTO | T+0 | RED | Tudo. Factos, hipóteses, incerteza. | — |
| Ponte CSIRT (S1/S2) | contínuo | RED | Estado técnico ao minuto | — |
| **Municípios afectados** | T+24h | AMBER | Impacto no serviço deles, dados envolvidos, o que devem fazer, quando haverá actualização | Detalhe de exploração. Dados de outros municípios. Atribuição. |
| Municípios **não** afectados | após contenção | AMBER | Que houve incidente e que não foram afectados, se perguntarem ou se houver risco de contágio de perceção | Detalhe. Lista de quem foi afectado. |
| **CNCS** | T+24h / T+72h / T+30d | AMBER→GREEN | Formulário completo, IoCs, cronologia | — |
| **CNPD** (via município) | T+72h se dados pessoais com risco | AMBER | Factos técnicos de apoio; o município é que notifica enquanto responsável | Avaliação jurídica — não é da Wire |
| Parceiros (CDN, IdP) | conforme contrato | AMBER+STRICT | Só o que respeita ao serviço deles | Dados de municípios |
| Público | após resolução | CLEAR | Post-mortem resumido | IoCs. Nomes de municípios. Detalhe de exploração. |

## O que nunca sai em comunicação a cliente

Durante incidente activo, e por defeito:

- Detalhe que permita reproduzir a exploração
- Identificação de outros municípios afectados — **cada município recebe só o que lhe respeita**
- Atribuição de autoria, mesmo com suspeita forte
- Especulação sobre causa antes de confirmada
- Nomes de pessoas envolvidas na resposta

O princípio nº 4 do `SKILL.md` — não atribuir culpa — aplica-se também às comunicações entre municípios: não indicies que outro cliente foi vector.

## Comunicação é por subcontratante

O princípio nº 3 do `SKILL.md` é uma regra de distribuição, não só de cortesia: **a Wire comunica ao município enquanto subcontratante**, e não delega essa comunicação primária. Um município não deve saber do incidente por outro município, nem por um parceiro, nem pela imprensa.

Consequência operacional: as comunicações a municípios saem **em lote e à mesma hora**, não à medida que alguém tem tempo. Um município que recebe seis horas depois do vizinho vai perguntar porquê — e terá razão.

## Marcação

Cabeçalho e rodapé de qualquer peça:

```
TLP:AMBER — Wire · Incidente wire-<ID> — <UTC>
Distribuição: <destinatários>
```

Em anexos, marca **cada ficheiro**. Anexos separam-se do corpo e perdem o contexto de classificação.

## Registo

Cada envio entra na timeline: destinatário, hora, TLP, versão do texto. Se o incidente vier a ser auditado, "quando é que o município X soube" é das primeiras perguntas — e a resposta tem de estar escrita, não lembrada.

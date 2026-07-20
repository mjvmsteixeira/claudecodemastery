# Changelog para clientes — formato

> **Estado: template operacional.** Satisfaz o CTRL-W-R-011 (documentação de breaking changes) e
> alimenta o CTRL-W-R-017 (comunicação de janela de manutenção). Validar com gestão de produto o
> tom e os canais.

O leitor não é developer. É o gestor de aplicações do município, ou um vereador a preparar uma reunião. Um changelog escrito para quem leu o código não comunica nada a quem só vai sentir o efeito.

## Distinção que estrutura tudo

**Changelog interno** — commits, SHAs, detalhe técnico. Fica no repositório.

**Changelog de cliente** — o que muda no trabalho de quem usa o produto. É deste que este ficheiro trata.

A tradução entre os dois não é resumir: é mudar de eixo. "Refactor do serviço de autenticação para usar tokens opacos" é interno. Para o cliente, ou não existe, ou é "as sessões passam a expirar ao fim de 8 horas em vez de 24".

**Se uma alteração não tem efeito observável para o cliente, não entra no changelog dele.** Um changelog cheio de linhas irrelevantes deixa de ser lido, e a linha que importava vai no meio.

## Template

```
<Produto> · versão <n> · <data>

O QUE MUDA PARA SI
<Uma a três frases. O efeito prático. Se não houver efeito visível,
escrever exactamente isso: "Esta actualização não altera a forma como
utiliza o <produto>.">

REQUER ACÇÃO DA VOSSA PARTE
<Só se existir. Passos numerados, com prazo. Se não houver:
"Nenhuma acção necessária.">

NOVIDADES
- <funcionalidade> — <para que serve, numa frase>

ALTERAÇÕES
- <o que mudou> — <o que era antes, o que é agora>

CORRECÇÕES
- <problema corrigido, na perspectiva de quem o sentiu>

ALTERAÇÕES QUE PODEM AFECTAR INTEGRAÇÕES        ← só se aplicável
- <o que muda> — <o que deixa de funcionar> — <alternativa> — <a partir de quando>

JANELA DE MANUTENÇÃO                            ← só se houver indisponibilidade
Data e hora: <início> a <fim>, <fuso>
Serviços afectados: <lista>
Durante este período: <o que não funciona>

APOIO
<canal> · Referência da versão: <n>
```

## Breaking changes

É a secção que justifica o controlo bloqueante. Regras:

1. **Anunciar antes, não com o release.** Um município com integração precisa de tempo para adaptar. O prazo mínimo é contratual; na dúvida, mais.
2. **Nomear o que deixa de funcionar**, concretamente. "Alterações na API" não permite a ninguém saber se é afectado. O endpoint, o campo, o formato.
3. **Dar sempre a alternativa.** Uma remoção sem substituto é um problema que se transfere para o cliente.
4. **Datar a remoção.** Se houver período de compatibilidade, dizer quando termina — e cumprir.
5. **Contactar directamente quem está afectado.** O changelog é registo, não notificação. Municípios com a integração em causa recebem contacto próprio.

## Tom

- **Português europeu, institucional mas legível.**
- **Voz activa.** "Corrigimos", não "foi corrigido".
- **Sem jargão sem tradução.** *Cache*, *endpoint*, *deploy* não significam nada para metade dos leitores.
- **Sem minimizar.** Se houve um problema que os afectou, dizê-lo. Um município que perdeu meio dia de trabalho e lê "pequenos ajustes de estabilidade" fica pior do que se nada tivesse recebido.
- **Sem promessas de datas** que não estejam confirmadas.

## Correcções que resultaram de incidente

Se a correcção resolve um problema que teve impacto visível, o changelog **não substitui** a comunicação de incidente — essa segue o `template-cliente.md` do `prumo-ir-multitenant`, com prazos próprios.

No changelog, a linha é factual e sem defensiva:

```
CORREÇÕES
- Corrigido o erro que impedia a submissão de formulários com anexos
  acima de 10 MB, ocorrido entre 12 e 14 de <mês>.
```

Datar o período. Um município que teve o problema quer confirmar que é o mesmo; um que não teve fica a saber que não foi afectado.

## Versionamento

Coerente entre changelog, release e tag. Um cliente que reporta problema "na versão 2.3" tem de identificar um artefacto único — se a numeração visível ao cliente divergir da interna, o apoio perde tempo a traduzir em cada contacto.

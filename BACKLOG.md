# Backlog — marketplace prumo

Trabalho identificado e **não feito**, com o contexto necessário para lhe pegar sem reconstruir a investigação. O que já foi feito vive no `CHANGELOG.md`; isto é o complemento.

**Regra deste ficheiro:** um item entra com o *porquê* e o *estado de verificação*, não só com o título. Um backlog de títulos obriga a redescobrir tudo, e é assim que os itens morrem.

Aberto a 2026-08-02.

---

## B1 · Identidade do embedder do MemPalace — **FECHADO** (2026-08-03)

**Resolvido com `mempalace palace set-embedder --model minilm`.** Identidade gravada em `palace/mempalace_embedder.json` (`minilm`, dim 384), coerente com o `embedding_model` do `config.json`. Verificado pelo comportamento: a operação que antes emitia o `EmbedderIdentityUnknownWarning` para as duas colecções — `repair --dry-run` — deixou de emitir qualquer aviso.

**A premissa abaixo estava errada e é o que vale a pena reter.** O item dizia *"fixar é fácil de fazer e difícil de desfazer"* e tratava fixar e migrar como caminhos exclusivos. Não são: o `--help` do `set-embedder` é explícito em que **regista identidade, não converte vectores** (*"Records identity on the palace only; does not change the configured model"*). Registar é etiquetagem — não fecha a porta a migrar para `embeddinggemma`, porque o custo da migração é o re-embed, igual com ou sem etiqueta. A decisão cara continua disponível; o que se fechou por custo zero foi o risco de um upgrade trocar o modelo em silêncio.

Lição: **ler o `--help` antes de classificar uma acção como irreversível.** Um item ficou meses em "decisão pendente" por uma premissa que um comando de dez segundos desmentia.

### Contexto original (mantido para referência)

**Estado:** decisão do utilizador, não tarefa. Bloqueado por escolha, não por esforço.

O `repair rebuild-index` de 2026-08-01 apagou a identidade registada do embedder. O palácio **assume** `minilm` sem o registar, e emite `EmbedderIdentityUnknownWarning`. Consequência: um upgrade futuro pode trocar o modelo em silêncio — espaços vectoriais incompatíveis, pesquisa a degradar sem erro visível.

Dois caminhos, ambos legítimos:

| | Fixar `minilm` | Migrar para `embeddinggemma` |
|---|---|---|
| Esforço | um comando | re-embed do palácio inteiro |
| Custo | zero | 50 min a 3 h (depende de recalcular ou reinserir — **por medir**) |
| Ganho | fecha o risco de troca silenciosa | margem de discriminação em PT: 0.148 → 0.299 |
| Custo de errar | cristaliza a escolha pior para corpus misto PT/EN | indisponibilidade durante a migração |

**Antes de decidir vale a pena:** re-medir a margem com pares reais do corpus actual (~30 min). Os 0.148/0.299 vêm de medições anteriores ao rebuild. Transforma um argumento num número próprio.

**Não avançar sem decisão explícita.** Fixar é fácil de fazer e difícil de desfazer.

---

## B2 · A fila do daemon falha ~79 jobs por dia — causa, não recuperação

**Reescrito a 2026-08-03. A versão anterior descrevia um incidente que não existe.**

Dizia *"após o daemon ficar encravado, ~694 jobs ficaram em `failed`"* — como se fosse um lote congelado de um evento único, e a tarefa fosse recuperá-lo. Medido contra a queue real (`~/.mempalace/daemon/<id>/queue.sqlite3`), são **710 falhados contra 55 bem-sucedidos**, distribuídos por **9 dias consecutivos**, de 26/07 a 03/08. Não é um lote: é uma sangria, e continua a correr.

**Falhas por dia:** 46 · 104 · 89 · 86 · 179 · 50 · 59 · 61 · 30. Nenhum dia a zero.

### As três causas, medidas

| Falhas | % | Causa | Leitura |
|---|---|---|---|
| **542** | 76% | `palace is held by PID <n> (mempalace-mcp)` | **uma sessão Claude aberta bloqueia a escrita do daemon** |
| 85 | 12% | `Failed to apply logs to the hnsw segment writer` · compaction | a divergência do índice, do lado da escrita |
| 83 | 12% | `MaxAttemptsExceeded` | consequência das duas acima, não causa própria |

Por tipo: **620 `diary_write`** e 90 `mine`. Os `diary_write` são conteúdo único por sessão que ninguém re-submete; um `mine` perdido recupera-se na corrida seguinte.

### O que isto significa

**Três quartos das falhas são o desenho a colidir com o padrão de uso.** O daemon precisa do palace sem holders; o servidor MCP de cada sessão Claude aberta é um holder. Com sessões abertas quase todo o dia, a fila falha quase todo o dia. É a mesma guarda que bloqueou a consolidação dos wings e o `repair` a 02/08 — e a guarda está certa; o que falta é o daemon saber esperar em vez de falhar.

**Recuperar os payloads trata o sintoma.** Mesmo que se re-enfileirassem os 710, amanhã há mais ~79. A tarefa útil é a causa, não a recuperação.

### O que fazer, por ordem

1. **Apurar se o `held by PID` devia ser falha ou espera.** Um job que falha porque o recurso está ocupado devia voltar à fila, não morrer — provavelmente é comportamento a reportar upstream, não a corrigir aqui. Confirmar contra o changelog da versão instalada (3.6.0) antes de assumir que é bug.
2. **Reduzir a janela de bloqueio** — sessões Claude fechadas quando não estão em uso, ou o daemon a correr em janela onde não há sessões.
3. **A divergência do HNSW** (12%) resolve-se com o `repair` já documentado; ver [[hnsw-diverge-com-mining-normal]] na memória — recorre com mining activo e o threshold de 4 é apertado de mais.
4. **Só então** decidir se vale re-enfileirar os `diary_write` históricos. Continua sem verbo de CLI (`mempalace daemon` tem apenas `jobs|start|status|stop|wait`) e o `UNIQUE INDEX ... WHERE state IN ('queued', …)` pode colidir com o dedupe. Escrever na queue interna continua a ser o item de maior risco deste backlog.

### Verificado e ainda válido

- `payload_json` **íntegro e legível** — nada se perdeu, os dados estão lá
- não existe verbo de recuperação na CLI
- **alternativa mais barata**, se se decidir não mexer na fila: exportar os payloads e arquivá-los fora. Perde-se a pesquisa sobre eles; ganha-se não escrever na base de dados interna.

---

## B3 · Inventário `CTRL-W-*` — as 4 fases feitas do lado do repositório; falta a resposta externa

**Estado a 2026-08-02: fases 1–4 concluídas na parte executável aqui.** A fase 4 era *identificar* o que falta face ao `WIRE.MTZ.SEC.006` — está escrito, com formato e critério de aceitação, na secção **"O que pedir ao `WIRE.MTZ.SEC.006`"** do `secops/ctrl-w-inventario.md`. O que resta é obter a resposta, e essa não se produz aqui.

**Acção pendente do utilizador:** levar os três pedidos a quem detém o documento. O nº 2 é o mais barato — sim/não seguido de lista — e é o que decide se as lacunas de governança são problema de documentação ou de conformidade.

Feito:
- **Fase 1** — `secops/ctrl-w-inventario.md`, com as famílias `T` (16) e `R` (18) transcritas das origens e verificadas char a char
- **Fase 2** — `/prumo-tenant-audit` e `/prumo-release-gate` apontam para o inventário; ambos param se não o conseguirem ler, em vez de inferir controlos pelo número
- **Fase 3** — coluna de **candidatos** preenchida no `mapping-nis2.md`. A coluna de **cobertura** fica vazia de propósito: é afirmação de conformidade e exige evidência verificada, não mapeamento

**O que falta, e só o utilizador pode dar:**

1. **A matriz `CTRL-W-IR-*`.** Sabe-se que existe — o `CTRL-W-IR-007` é citado no `prumo-ir-multitenant` — mas nenhuma definição está no repo. Bloqueia a medida (b) do NIS2, tratamento de incidentes.
2. **Resposta a uma pergunta que muda o diagnóstico:** os 34 controlos conhecidos cobrem o técnico e o release, mas **nenhum** endereça governança, formação, RH ou avaliação de eficácia. Ou existem famílias `CTRL-W-*` de governança que nunca chegaram aqui, **ou** são lacunas reais de conformidade. Não se distingue de dentro do repositório, e a resposta decide se é problema de documentação ou de controlo.
3. **ISO 27001** — o mapping continua por preencher, mas por razão **diferente**: os títulos dos 93 controlos do Anexo A são texto protegido e não podem ser reproduzidos aqui. Quem tiver a norma licenciada preenche sem depender de mais nada.

### Contexto original (mantido para referência)

**Estado inicial:** parcialmente resolúvel com o que já existe no repo.

Os identificadores `CTRL-W-T-001..016` e `CTRL-W-R-001..018` são citados como intervalos em comandos, agents e skills do `prumo-secops`, mas **nenhum artefacto acessível define o que cada controlo verifica** — a definição vive no `WIRE.MTZ.SEC.006`, externo.

Consequências actuais:
- `/prumo-tenant-audit` e `/prumo-release-gate` instruem *"aplica CTRL-W-…"* a um agente sem acesso às definições
- os dois mappings do `prumo-compliance-provider` ficaram com a coluna de cobertura **deliberadamente vazia** (ver `secops/CHANGELOG.md` v0.6.1) — preenchê-la sem os controlos seria inventar conformidade

**A pista que poupa a maior parte do trabalho:** as matrizes já existem dentro do repo. Verificado a 2026-08-02: **18 linhas** `CTRL-W-T-*` no `SKILL.md` do `prumo-tenant-isolation` e **20 linhas** `CTRL-W-R-*` no do `prumo-release-safety`. São os *comandos* que não lhes chegam.

Fases:

1. Extrair as duas matrizes para uma reference partilhada
2. Apontar os dois comandos para ela — deixam de correr no vazio
3. Preencher a coluna de cobertura dos dois mappings do compliance
4. Identificar o que falta face ao documento externo ← **feito**: pedido escrito no inventário, com formato exigido e o que não aceitar como resposta. Fechar depende da resposta externa.

---

## B4 · Vigilância contínua do daemon (fora do âmbito do `memory-doctor`)

**Estado:** desenho decidido, implementação não feita.

O check 4b.1b (v0.9.1) detecta o daemon **vivo mas surdo** — mas o `memory-doctor` corre **a pedido**. Entre corridas, uma paragem passa despercebida, exactamente como passou durante 6h42m a 2026-08-01.

Verificado que os jobs de manutenção existentes **não tapam o buraco**:
- `mempalace-health` corre às 09:00 diárias → não apanharia uma paragem das 14:36
- `mempalace-fts5-canary` corre de 15 em 15 min → mas vigia o FTS5, não o daemon

O que falta é um plist que compare `pgrep` com `daemon status` e faça `launchctl kickstart -k` quando divergirem. Fica fora do plugin por decisão — é configuração da máquina, não conteúdo de marketplace.

---

## B5 · Derivar listas em vez de as escrever — **FECHADO** (`base` v0.10.0)

**Estado a 2026-08-02: resolvido, com as duas abordagens em vez de uma.** `prumo_plugins()` na `prumo-common.sh` deriva do `marketplace.json` (formatos `name`/`dir`/`pair`, fallback ruidoso), e os quatro consumidores passaram a usá-la — `/prumo-upgrade`, `/prumo-onboard`, `package.sh` e o próprio `validate.sh`, que enumerava à mão. O check `1b` do `validate.sh` garante que o fallback não diverge e que nenhum loop volta a enumerar à mão; ambos os ramos testados por injecção.

### Contexto original

O `prumo-design` ficou de fora de enumerações escritas à mão em **três** ocasiões: `/prumo-onboard` (corrigido em `base` v0.7.3), os contadores `X/3` (idem), e os loops do `/prumo-upgrade` (corrigido em v0.9.2).

Nenhuma dessas omissões falhou ruidosamente — o `/prumo-upgrade` reportava *"tudo actualizado"* com toda a confiança sobre 75% do marketplace.

A correcção real é **derivar a lista do `.claude-plugin/marketplace.json`** em vez de a escrever em cada sítio, tal como se fez com os verbos do Graphify (`base` v0.8.0). Alternativa mais barata: um check no `validate.sh` que compare qualquer enumeração de plugins com o `marketplace.json`.

---

## Itens fechados hoje, para referência

Não repetir a investigação — está toda no `CHANGELOG.md`:

- Daemon encravado e crash loop de 45 SIGSEGV → causa apurada (índice HNSW divergente → null deref nas bindings Rust do ChromaDB), resolvido pelo rebuild
- `--scope` do `memory-doctor` (`base` v0.9.0)
- Check 4b.1b, daemon vivo mas surdo (`base` v0.9.1)
- `prumo-design` no `/prumo-upgrade` (`base` v0.9.2)

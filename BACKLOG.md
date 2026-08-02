# Backlog — marketplace prumo

Trabalho identificado e **não feito**, com o contexto necessário para lhe pegar sem reconstruir a investigação. O que já foi feito vive no `CHANGELOG.md`; isto é o complemento.

**Regra deste ficheiro:** um item entra com o *porquê* e o *estado de verificação*, não só com o título. Um backlog de títulos obriga a redescobrir tudo, e é assim que os itens morrem.

Aberto a 2026-08-02.

---

## B1 · Identidade do embedder do MemPalace — decisão pendente

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

## B2 · Recuperação de jobs falhados na fila do daemon

**Estado:** viabilidade parcialmente verificada; a fase 3 pode invalidar o resto.

Após o daemon ficar encravado (ver `base/CHANGELOG.md` v0.9.1), ~694 jobs ficaram em `state='failed'`. A maioria são `diary_write` — conteúdo único por sessão que **ninguém re-submete**, ao contrário de um `mine`.

Verificado:
- `payload_json` está **íntegro e legível** — os dados não se perderam
- não existe verbo de recuperação na CLI: `mempalace daemon` tem apenas `jobs|start|status|stop|wait`, e `jobs` só aceita `--limit`
- existe `UNIQUE INDEX ... WHERE state IN ('queued', …)` — repor para `queued` **pode colidir com o dedupe**

Fases:

1. Exportar os payloads para ficheiro (read-only, serve de backup)
2. Testar um job numa **cópia** da queue
3. Perceber o comportamento do dedupe e se o daemon consome o job reposto ← **decide se o resto vale a pena**
4. Aplicar em lotes, com o daemon a drenar

**Risco: o mais alto dos itens deste backlog.** Escreve na base de dados interna do MemPalace, sem caminho suportado pela ferramenta.

**Alternativa mais barata:** exportar os payloads e arquivá-los fora, sem re-ingerir. Perde-se a pesquisa sobre eles; ganha-se não mexer na fila.

---

## B3 · Inventário `CTRL-W-*` — fases 1–3 feitas, falta o que é externo

**Estado a 2026-08-02: fases 1, 2 e 3 concluídas.** O que resta depende do `WIRE.MTZ.SEC.006` e não pode ser feito a partir deste repositório.

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
4. Identificar o que falta face ao documento externo ← só o utilizador pode fechar

---

## B4 · Vigilância contínua do daemon (fora do âmbito do `memory-doctor`)

**Estado:** desenho decidido, implementação não feita.

O check 4b.1b (v0.9.1) detecta o daemon **vivo mas surdo** — mas o `memory-doctor` corre **a pedido**. Entre corridas, uma paragem passa despercebida, exactamente como passou durante 6h42m a 2026-08-01.

Verificado que os jobs de manutenção existentes **não tapam o buraco**:
- `mempalace-health` corre às 09:00 diárias → não apanharia uma paragem das 14:36
- `mempalace-fts5-canary` corre de 15 em 15 min → mas vigia o FTS5, não o daemon

O que falta é um plist que compare `pgrep` com `daemon status` e faça `launchctl kickstart -k` quando divergirem. Fica fora do plugin por decisão — é configuração da máquina, não conteúdo de marketplace.

---

## B5 · Derivar listas em vez de as escrever

**Estado:** padrão identificado três vezes; correcção estrutural por fazer.

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

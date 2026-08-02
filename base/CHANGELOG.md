# Changelog — prumo-base

Formato: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versionamento: [SemVer](https://semver.org/spec/v2.0.0.html).

## v0.10.0 — 2026-08-02

**B5 — a lista de plugins deixa de ser escrita.** O `prumo-design` ficou de fora de enumerações à mão **três vezes**, e nenhuma das omissões falhou: o `/prumo-upgrade` reportava *"tudo actualizado"* com toda a confiança sobre 75% do marketplace. Um erro sem forma de se manifestar é pior que um que rebenta — e a correcção de cada instância não impedia a quarta.

- **Novo `prumo_plugins()` na `lib/prumo-common.sh`** (v0.1.0 → v0.2.0), com três formatos: `name`, `dir` e `pair`. O `pair` existe para que quem precisa dos dois não infira um do outro removendo o prefixo — a correspondência nome↔directoria é do `marketplace.json`, não uma convenção.
- **Emite um por linha, e o call-site usa heredoc.** Nunca `for p in $(prumo_plugins)`: em zsh a substituição de comando não sofre word-splitting, e o loop correria uma vez com a lista inteira como um item. O heredoc também evita o subshell de um pipe, que perderia os arrays acumulados.
- **Fallback ruidoso.** Sem `marketplace.json` legível, cai numa lista estática **e avisa em stderr**. Um fallback silencioso reproduziria o defeito que isto corrige.
- **Quatro consumidores convertidos:** `/prumo-upgrade` (3 loops), `/prumo-onboard` (1), `scripts/package.sh` (default e validação de argumentos), e o próprio `scripts/validate.sh`, que enumerava à mão na linha 70 — o validador era ele próprio uma instância do defeito.
- **Novo check `1b · enumerações de plugins` no `validate.sh`**, para que a quarta vez rebente no CI. Duas verificações: o `PRUMO_PLUGINS_FALLBACK` tem de bater com o `marketplace.json`, e nenhum loop ou array pode enumerar plugins à mão. Ambas testadas por injecção de regressão.
- O padrão de busca casa só **listas de palavras nuas** — `for p in $(prumo_plugins)` não casa, nem a prosa que documenta o anti-padrão. Foi o primeiro falso positivo da regra, e ficou registado no comentário.

`package.sh` passa a rejeitar um plugin não declarado mostrando a lista real, em vez de o comparar contra quatro nomes fixos.

## v0.9.3 — 2026-08-02

**O check 4b.1b passa a apontar para o sinal precoce em vez de só descrever o sintoma.** Um crash loop do daemon é quase sempre consequência tardia de um índice HNSW divergente — verificar o `repair-status` primeiro é a diferença entre 30 segundos e um dia a ler stack traces de Rust.

- **Cadeia causal fechada por investigação** (2026-08-02): 45 `SIGSEGV` em 6 dias, **todos** o daemon e nunca o MCP; pilha inteiramente dentro do `chromadb_rust_bindings.abi3.so`; endereços de falha `0x88` (26×) e `0x0` (19×) — *null pointer dereference*; thread de trabalho sempre diferente (29–35), assinatura de pool e não de caminho determinístico. O índice estava divergente em 1.358 entradas. Depois do `repair`: **0 crashes em 13h**, +27k drawers, e os primeiros jobs `succeeded` de sempre (antes: 0).
- **Severidade definida**: divergência acima do limiar **com** crashes recentes → CRIT, e a remediação é o rebuild, não depurar o processo. O inverso informa na mesma — crashes **sem** divergência apontam para outra causa e aí sim justificam investigação.
- **Armadilha de shell documentada no próprio comando.** O glob de contagem de crashes leva aspas: um glob nu que não case aborta o comando inteiro em zsh (`no matches found`) e produz um falso *"não há crashes"*. Foi exactamente assim que esta pista se perdeu na primeira tentativa desta sessão — a conclusão "não há relatórios de diagnóstico" estava errada e havia 45.
- **Ressalva escrita no texto**: é um caso, com antes/depois forte. Não prova que toda a divergência cause crash nem o inverso — prova que compensa verificar primeiro o mais barato.
- Ambos os comandos verificados contra o sistema real: divergência 0 hoje, 44 crashes contados com o glob citado, e o glob nu a falhar como descrito.

**Novo `BACKLOG.md`, versionado.** Cinco itens abertos com o *porquê* e o *estado de verificação*, não só o título. Acrescentado à whitelist do `.gitignore` — sem isso ficaria como o `docs/`: com aspecto de guardado e fora do git.

## v0.9.2 — 2026-08-02

**O `/prumo-upgrade` nunca consultou o `prumo-design`** — reportava "tudo actualizado" sobre três dos quatro plugins do marketplace.

- **4 sítios no command**: os três loops (versões locais, fetch remoto, diff) e a mensagem final de "os 3 plugins". Um plugin fora dos loops é invisível ao upgrade-check, e o silêncio lê-se como "em dia".
- **Descrições de frontmatter** do command e da skill diziam `(base/secops/devkit)` — é o texto que o modelo lê para decidir invocar, e descrevia mal o que a ferramenta faz.
- **Mesma omissão em mais dois sítios**, encontrados por sweep: o `prumo-doctor` enumerava três plugins na detecção (o design entra no inventário mas não tem doctor próprio — reportar presente, não lançar nada), e o `README` do base descrevia o `/prumo-onboard` como cobrindo três, o que ficou factualmente errado quando o onboard passou a cobrir quatro na v0.7.3.
- Acrescentada nota no command a ligar a lista ao `marketplace.json`: um plugin novo que não seja acrescentado aos loops fica invisível.
- É a terceira vez que o `prumo-design` fica de fora de uma enumeração escrita antes de ele existir — depois do `/prumo-onboard` (v0.7.3) e dos contadores `X/3`.

## v0.9.1 — 2026-08-01

**Novo check 4b.1b — "daemon vivo mas surdo", o estado que nenhum mecanismo vigiava.** Encontrado a custar 6h42m de escrita parada, 724 jobs falhados e 0 sucessos, sem um único sinal.

- **O modo de falha**: o daemon não morre — fica vivo sem aceitar ligações. O socket em `LISTEN`, o `launchctl` vê processo vivo e **não relança**, o daemon segura a lease, e toda a escrita de fundo pára em silêncio. O `KeepAlive` cobre o crash; não cobre isto.
- **A detecção é a divergência entre duas fontes que deviam concordar**: `pgrep` diz vivo, `mempalace daemon status` diz "not running". Nenhuma leitura isolada revela o problema — só a contradição. Verificado nos dois estados: apanha o encravado, não dá falso positivo no são.
- **Recorrência, não ocorrência** (Regra de ouro 4). `LastExitStatus=11` é SIGSEGV; um `11` com PID diferente do da corrida anterior significa crash pelo meio. Observadas **duas recorrências em menos de 24h**, com um kickstart manual entre elas — assinatura sistemática, a reportar como tal e não como "resolvido".
- **Limite declarado no próprio texto**: o `memory-doctor` corre a pedido, **detecta mas não vigia**. Os jobs existentes não tapam o buraco — o `health` corre às 09:00 (não apanha uma paragem das 14:36) e o `fts5-canary` vigia o FTS5, não o daemon. Vigilância contínua exige plist próprio e fica fora do âmbito da skill — dito ao utilizador em vez de implícito.

## v0.9.0 — 2026-08-01

**O `memory-doctor` divagava pela máquina toda em vez de auditar o projecto actual.** Numa corrida real varreu 13 repos, listou 10 alheios como lacunas, contabilizou 90.000 drawers de outros projectos e inventariou um vault Obsidian de um projecto em pausa — tudo verdadeiro, quase nada accionável para quem estava a trabalhar ali. Os achados que interessavam (índice vectorial desligado, daemon parado há 6h40m, grafo 3 commits atrás, ADR inexistente) ficaram enterrados no meio.

- **Causa: a skill não definia âmbito em lado nenhum.** Zero menções a projecto actual, `cwd` ou `--scope`. O vácuo deixava cada agente do fan-out decidir sozinho, e o default de um modelo é ser exaustivo.
- **`--scope project|machine`, default `project`.** Novo parâmetro, com a regra que o torna utilizável: **saúde da infraestrutura sobe sempre; inventário de outros projectos só com `--scope machine`**. O critério é *"isto afecta o projecto onde estou?"*, não *"isto é global?"* — um HNSW divergente é global e degrada este projecto, logo sobe; que outro wing tenha 36.000 drawers de código não afecta este projecto, logo não.
- **A dificuldade real, agora documentada**: as três camadas têm âmbitos naturais **diferentes**. Estrutural e humana são por-projecto (vivem no repo); a episódica é por-máquina (há um só palácio em `~/.mempalace/`). Um fan-out uniforme não consegue produzir relatório coerente de projecto sem resolver isto.
- **Resolução projecto → wings, com as ambiguidades assumidas.** A convenção não é única: o mesmo palácio tem `abaco` **e** `wing_abaco` (resíduo de migrações), e há wings-hash (`wing_1b1e285a2e1e`) que não mapeiam para nome nenhum. O matcher aceita as duas formas. Verificado em 4 casos, incluindo um duplicado e uma falha. **Se nenhum wing corresponder, reporta-se isso e fica-se pela saúde global** — alargar ao palácio inteiro por falha de correspondência era exactamente o divagar a corrigir.
- **O âmbito é passado aos agentes no prompt**, com a proibição explícita de varrer `~/dev`/`$HOME` em `project` — sem isso o parâmetro não chega a quem faz o trabalho.
- **O relatório abre com uma secção Âmbito** que declara scope, raiz do projecto, wings resolvidos e **o que ficou de fora**. Um leitor tem de saber o que não foi olhado.

## v0.8.1 — 2026-08-01

**`prumo_mode()` degradava `lab` para `prod` em silêncio.** Sem o marker `~/.prumo/lab-mode`, pedir `PRUMO_OPERATING_MODE=lab` devolvia `prod` — o modo mais restritivo — sem nada que o explicasse. Quem exportava a variável à mão levava bloqueios de prod e concluía que o modo não funcionava.

- A degradação **mantém-se** (pedir lab sem marker não pode resultar em algo mais permissivo que o default), mas passa a avisar em stderr, uma vez por processo, com as duas formas de activar de facto.
- stderr e não stdout: o stdout é o valor de retorno da função.

## v0.8.0 — 2026-08-01

**O `memory-doctor` afirmava que dois verbos do Graphify não existiam. Existem — e o `--apply` regredia o `CLAUDE.md` do utilizador ao removê-los.**

- **Bug — afirmação de versão nunca confirmada contra o binário.** O bloco de routing `v2` e três ficheiros de referência declaravam que `graphify query`/`affected` *"não existem no Graphify actual (v0.9.18)"*. Verificado na **v0.9.32 instalada: existem ambos** — `query "<question>"` (BFS a partir de uma pergunta) e `affected "X"` (travessia inversa dos nós impactados).
- **O erro não era cosmético.** O `affected` é a resposta literal a *"o que parte se eu mexer aqui?"* — a pergunta principal da secção estrutural da própria regra — e o `v2` encaminhava-a para `explain`/`path`, que respondem a outra coisa. Um `--apply` sobre um `CLAUDE.md` correcto **retirava o verbo certo**.
- **Bloco de routing `v3`**: repõe `affected` e `query` com a pergunta certa em cada um, e acrescenta a verificação de frescura (`built_at_commit` vs HEAD), que faltava.
- **Bug — a verificação de resolução validava a sua própria conclusão.** O `v2` já tinha um check aqui, mas com a lista de verbos fixa dentro do check (`for verb in explain path`): confirmava que os verbos que ele próprio recomendava existiam, e nunca perguntava se eram os certos. Passa sempre. Agora a lista sai **do bloco** e a verdade sai **do binário** (`graphify --help`), nenhuma das duas escrita à mão.
- **Bug — `for v in $VAR` dava verde a verbos inventados em zsh.** O zsh não faz word-splitting de variáveis não citadas: o `for` itera uma vez com a lista inteira, e o `grep -qx` com padrão multilinha casa se qualquer linha casar. Reescrito com `while IFS= read -r` + `grep -qxF`. Verificado nos dois shells: verbo inventado agora falha com `rc=1` e é nomeado.
- **Limite do check, documentado em vez de silenciado.** Ele apanha *citar um verbo falso*; **não apanha** *omitir um verbo real*, que foi o defeito do `v2` — não há nada para resolver numa omissão. Contra esse sentido a defesa é editorial e está escrita: não fixar em prosa que verbo existe em que versão, e ao rever perguntar se a lista real do binário tem verbo melhor que o escolhido.
- Corrigidos `routing-rule.md`, `camada-estrutural.md` e `arbitro.md` (duas instâncias). Sweep confirma zero afirmações fixadas por versão fora do histórico que documenta a correcção.
- Nota de método registada: `graphify <verbo> --help` é um stub que remete para o help principal — verificar flags contra o subcomando dá falso negativo.

## v0.7.4 — 2026-07-20

**Três commands partiam quando invocados como slash command — o mesmo bug do `/prumo-secops-bootstrap` (#3), agora varrido por completo.** Encontrado ao invocar `/prumo-style on --profile focus`: o texto expandido chegou com `local l="$1"` virado em `local l="--profile"`, e as funções `has_block`/`present_version`/`strip_block` a operar sobre um ficheiro chamado `--profile`.

- **Bug — variáveis posicionais nuas em blocos bash de commands eram substituídas pelo harness.** Num slash command, `$0..$9` nus são trocados pelos argumentos da invocação antes de o bloco correr. Uma função auxiliar que usa `$1` como parâmetro próprio recebia o argumento do command (ex: `--profile`) e passava a operar sobre um ficheiro inexistente. Corrigido para `${1}` (chavetas sobrevivem à substituição) ou `$(1)` no awk (campo, mas resistente).
- **`/prumo-style`** — 6 funções auxiliares afectadas (`prumo_backup`, `target_for`, `has_block`, `present_version`, `present_profile`, `strip_block`). Sintoma: status sempre "sem bloco", e `on` deixa de detectar bloco existente → **empilha em vez de substituir**. Idempotência restaurada (2ª corrida mantém 1/1 marcadores).
- **`/vault-list`** — `audit_path() { local base="$1"` partia mesmo sem argumentos: `$1` → string vazia, e a função listava um path vazio em vez do recebido.
- **`/prumo-vault-kv-migrate`** — `walk_kv1() { local prefix="$1"` num command **destrutivo** que recebe `--plan|--backup|--apply`; o `$1` global capturava o modo e a função de walk ficava inutilizável.
- **`validate.sh` ganhou o check que faltava.** Nenhum bloco bash de command pode ter `$N` nu (só `$ARGUMENTS`). É a rede que impediria a regressão desde o #3 — verificado que passa limpo e que apanharia uma reintrodução.
- Sweep confirmado: **zero** posicionais nus em todos os commands dos 4 plugins.

## v0.7.3 — 2026-07-20

**O Passo 2b do `/prumo-onboard` tratava dois Vaults como um.** Origem: ao correr o wizard contra um setup real, o passo reportou `transit/`, `ssh/` e as 7 policies `wire-*` como lacunas de um Vault local que, ao ser inspeccionado, se revelou um **broker de credenciais pessoal** — árvore `secret/ai|tokens|credentials|projects|infrastructure`, 10 AppRoles por projecto do utilizador, zero objectos `wire-*`, e ficheiros de instalação três meses anteriores ao próprio ecossistema de plugins.

- **A ausência não era lacuna.** Um broker pessoal não precisa de `transit/` nem de `ssh/` (só interessam a quem use cifra-como-serviço ou SSH CA) e **nunca** deve receber policies `wire-*`, que descrevem um parque de produção inexistente nessa máquina. Criá-las localmente não habilita nada e deixa objectos órfãos.
- **Passo 2b reescrito para identificar primeiro, provisionar depois.** Tabela comparativa dos dois Vaults (endereço, propósito, árvore, AppRoles, engines, quem provisiona), inferência do tipo a partir do `VAULT_ADDR`, e caminhos de provisionamento separados. Contra um broker pessoal, o `/prumo-secops-bootstrap` **não é sugerido**; `transit/`/`ssh/` em falta são reportados como opcionais, não como desvio.
- **Tipo indeterminado pergunta em vez de assumir.** Um `VAULT_ADDR` que não seja reconhecidamente local nem `wire.internal` suspende a sugestão de bootstrap: um `--apply` contra o Vault errado escreve policies e AppRoles onde não pertencem.
- **Relatório final passa a nomear o alvo** (`broker pessoal | parque Wire | indeterminado` + `VAULT_ADDR`) e a distinguir `n.a.` de `não` no secops bootstrap — `n.a.` não é pendente.
- Passo 3 ajustado: `/vault-list` só é sugerido contra broker pessoal provisionado; contra o parque Wire os paths `secret/projects/*` não existem.
- Quatro cenários de detecção verificados por comportamento (local, `wire.internal`, host desconhecido, `VAULT_ADDR` ausente), mais o caso sem `~/vault`.

## v0.7.2 — 2026-07-20

**Bug — o `smoke.sh` validava a versão errada.** `find … -print -quit` devolve o **primeiro** manifest que a travessia encontra, não o mais recente. O cache do Claude Code guarda **todas** as versões instaladas: com cinco versões de `prumo-secops` presentes (0.5.0 a 0.6.4), o smoke validava a **0.5.2** enquanto a 0.6.4 estava instalada e activa. Corrigido para `sort -V | tail -1`. As duas ocorrências que apenas testam presença (`| grep -q .`) ficam como estavam — aí qualquer match serve.

## v0.7.1 — 2026-07-20

**`vault_ready()` nunca podia devolver verdadeiro.** Encontrado a correr o `/prumo-onboard` recém-actualizado contra o setup real — o Passo 2b levou ao `/prumo-secops-bootstrap --plan`, que abortou com "Vault inacessível ou sealed" tendo o Vault destrancado e a responder.

- **Bug — `jq '.sealed // "true"'` em `lib/vault-env.sh`.** Em jq, `//` trata `false` como ausente: com `sealed=false` a expressão devolvia `"true"`, e `vault_ready` falhava **sempre**, em qualquer estado do Vault. Corrigido para `.sealed | tostring`, com o fallback a aplicar-se só quando não há JSON válido.
- **Raio de impacto: 12 consumidores** em três plugins. Todos os `/vault-*` (`list`, `set`, `audit`, `backup`, `integrate`), ambos os bootstraps, o `kv-migrate`, o `/ngrok-expose` do devkit e o `/prumo-secops-bootstrap` abortavam com "Vault inacessível ou sealed" independentemente do estado real.
- **Sintoma visível há muito**: o hook SessionStart `vault-session-check.sh` emitia *"Vault is sealed and auto-unseal failed"* em todos os arranques, mesmo com o Vault operacional — as duas mensagens contraditórias no início de cada sessão vinham daqui.
- Mesma família do defeito corrigido no `~/vault/vault-read.sh` na mesma sessão; o padrão `.<bool> // <alternativa>` é a armadilha, não este sítio em concreto.

## v0.7.0 — 2026-07-20

**`/prumo-style` v2: três regras novas no bloco base e um perfil `focus` para execução multi-passo.** Origem: análise do [`ayghri/i-have-adhd`](https://github.com/ayghri/i-have-adhd) (MIT), uma skill de output-shaping ADHD-friendly com 10 regras. Sete já estavam cobertas pelo bloco `prumo-style` v1 ou pelo `CLAUDE.md` global do utilizador; instalar o plugin acrescentaria uma terceira camada de estilo com duplicados e contradições. As regras genuinamente novas foram absorvidas.

- **Bloco base 6 → 9 regras.** Passos numerados (uma acção por passo), listas com máximo de 5 itens, e tom factual em erros. Aplicam-se em qualquer contexto e não colidem com nada do que já lá estava.
- **Perfil `focus` (novo).** `--profile focus` acrescenta 4 regras de execução multi-turno: reafirmar o estado a cada turno, tornar visível o que já funciona, fechar com uma acção seguinte concreta, estimativas de tempo em unidades reais. Ficam **fora** do perfil default porque em Q&A puro contradizem "sem labels de resumo/fecho" — só deixam de ser filler quando há progresso a comunicar. `normal` continua a ser o default.
- **Marcador ganha o perfil**: `<!-- prumo-style BEGIN v2 profile=focus -->`. Blocos `v1` (sem `profile=`) e `wire-style` legacy são lidos como `normal` e migrados na primeira invocação de `on`. `on` sem `--profile` **preserva** o perfil instalado — só troca quando indicado explicitamente.
- **`/prumo-onboard` passa a perguntar pelo estilo (Passo 4b, novo).** O wizard nunca mencionava `/prumo-style` — quem fazia onboarding só descobria o command por acaso. Agora detecta o estado do bloco em projecto e user (ausente / v2 com perfil / legacy v1-wire) e **pergunta** qual o perfil, sem nunca aplicar: escreve num `CLAUDE.md` do utilizador, logo a decisão de scope e perfil é dele. Avisa do risco de duplicação se o `~/.claude/CLAUDE.md` já tiver regras de tom próprias. Cinco estados verificados por comportamento.
- **Bug — `/prumo-onboard` sugeria um smoke test que falha por desenho.** O Passo 3 propunha `/vault-list` como sanity check do base, mas nada no wizard provisionava o Vault (kv-v2, approle, transit, ssh): numa máquina limpa o teste sugerido falha, e a mensagem não diz que a causa é o bootstrap nunca ter corrido. Novo **Passo 2b**, antes dos smokes, que detecta o estado e ordena `/prumo-vault-bootstrap --plan` → `--apply`, mais `/prumo-secops-bootstrap` quando o secops está instalado. Sem `~/vault`, o passo é saltado e os smokes dependentes do Vault deixam de ser sugeridos.
- **Bug — o Passo 4 reimplementava mal o `/prumo-mode`.** Escrevia `echo prod > ~/.prumo/mode` à mão, ignorando a precedência `env` > ficheiro > default e o marker `~/.prumo/lab-mode` que o modo `lab` exige — podia reportar um modo diferente do que os hooks vêem. Passa a delegar no command, e a propor fixar o modo explicitamente quando a fonte é o default implícito.
- **`/prumo-upgrade` entra no Passo 1.** O wizard é feito para re-correr, mas um plugin instalado imprimia `✓` sem qualquer verificação de versão: num setup desactualizado ficava tudo verde.
- **`/prumo-ollama-doctor` entra no Passo 3** quando o secops está instalado — o hook `pre-tool-second-opinion` depende de um Ollama local e degrada em silêncio sem ele.
- **Bug — `/prumo-onboard` detectava 3 de 4 plugins.** O `prumo-design` existe no `marketplace.json` desde o rebrand mas nunca entrou no wizard: faltava no loop de detecção, no bloco de gaps, nos smoke tests e na lista de CHANGELOGs; os contadores diziam `X/3`. Corrigido para `X/4`.
- **Bug (pré-existente, v1) — acumulação de linhas em branco.** Cada ciclo `on`/`off` acrescentava uma linha em branco antes do bloco, sem limite; a troca de perfis torna o ciclo frequente e o drift visível. `strip_block` passa a normalizar o trailing newline. Verificado: 10 ciclos consecutivos deixam o ficheiro com 1/1 marcadores e máximo de uma linha em branco, e `off` restaura o ficheiro byte-a-byte idêntico ao original.

## v0.6.1 — 2026-07-17

**`memory-doctor`: upgrade-check vira Gate 0, e dois bugs de verbo morto.** Origem: em uso real a skill nem sempre verificava necessidade de upgrade antes de auditar — devia ser a primeira acção. A investigação encontrou três defeitos que o explicam e dois bugs a montante da mesma família (verbos que não resolvem contra a CLI).

- **Gate 0 (versão/upgrade) é agora a primeira acção, imposta.** O mandato "inventário primeiro" existia em prosa (Fase 0) e na Regra de ouro 1, a 190 linhas de distância, sem gate — nada impedia o agente de saltar para o fan-out. Passou a STOP obrigatório antes do fan-out, read-only, separado da *acção* de upgrade (essa continua opt-in via `--apply` + gates).
- **Data-gap fechado.** O inventário comparava só CLI-vs-plugin-em-cache; nunca ia buscar o *latest* ao PyPI, pelo que o caso comum "estás N versões atrás" era indetectável. Agora `pypi_latest`/`ver_verdict` comparam instalado vs latest para `mempalace` e `graphifyy`, com `sort -V` (semver-aware, apanha `0.9.9 < 0.9.18`). Ramos verificados por comportamento: actualizado, upgrade-pendente, ausente→propor-instalar, pre-release, offline.
- **Âmbito alargado a plugins + MCP.** O Gate 0 delega a `/prumo-upgrade` (não duplica) para as versões dos plugins prumo e dos servidores MCP; ausência de uma camada tornou-se proposta explícita de instalação (identidade PyPI + versão pinada, sob os 3 gates).
- **Bug (verbo morto) — `graphify query`/`affected` não existem na v0.9.18** e apareciam em 4 sítios, incluindo o bloco de routing escrito no CLAUDE.md do utilizador (`routing-rule.md`): o `--apply` **regredia** um CLAUDE.md já corrigido à mão. Corrigido para `graphify explain`/`path` (verbos reais), bloco de routing subido a `v2` (substituição idempotente por marcadores).
- **Bug (árbitro não testava resolução de rota)** — validava coerência de âmbito mas nunca corria os verbos recomendados contra a CLI, o buraco por onde o verbo morto passou. Adicionada verificação de resolução obrigatória (em `arbitro.md` e `routing-rule.md`): cada verbo do bloco tem de resolver via `graphify <verb> --help` antes da escrita, ou é alarme. Fecha o círculo da Regra de ouro 3.

Relatório reordenado: secção **UPGRADES** no topo (era **VERSÕES** no fundo). Sem alteração de comportamento destrutivo — Gate 0 é read-only; toda a acção continua gated.

## v0.6.0 — 2026-07-15

**Skill `memory-doctor` + hook `memory-scope`.** Governança do setup de memória em 3 camadas de âmbito disjunto.

### Added
- **Skill `/memory-doctor`** — audita as 3 camadas de memória (episódica/MemPalace, estrutural/Graphify, humana/docs) com um contrato de âmbito onde cada ferramenta sabe o que faz **e o que nunca faz**. Corre 3 agentes (um por camada) + um árbitro read-only das 7 colisões C1–C7 (mandatos concorrentes no CLAUDE.md, PreToolUse sobre Read/Glob, sobreposição de corpus, ambições episódicas do Graphify, orçamento de tools, `.claudeignore` sem `graph.json`, âmbito global). Fase 0 avalia install/upgrade e instala primeiro; Fase 4 `--apply` escreve **uma** regra de encaminhamento no CLAUDE.md (bloco versionado, idempotente, à prova de marcadores corrompidos) e instala o hook. References por camada: `camada-episodica.md` (modelo de escritores MCP, Etapa 0 changelog-first, FTS5 integrity/rebuild, embedder trap, thresholds), `camada-estrutural.md` (AST-only, anti-typosquat), `camada-humana.md`, `arbitro.md`, `routing-rule.md`.
- **Hook PreToolUse `memory-scope`** (matcher **Bash apenas** — nunca Read/Glob, para não cometer a colisão C2 que a skill denuncia). Guarda de âmbito entre camadas, endurecido por 5 rondas de revisão adversarial: normalização antes de casar (aspas, backslash, continuação de linha, `${IFS}`/`$IFS`), guards de substituição de comando **e** de processo (`$()`, backtick, `<()`, `>()`), fronteira de palavra **denylist de identificador** `(^|[^A-Za-z0-9_])` (fecha `!`/`=`/`:`/`$` sem enumerar), allowlist só de comandos data-only — todos os programáveis (git, awk, sed, perl, jq, pagers less/more/man) deliberadamente **fora**, pelo invariante "programável ⇒ fora da allowlist". Deteção de typosquat `graphify` vs `graphifyy` em 11 gestores (install/add/uvx/`uv run`/`pipx run`/…), e `mempalace mine` a exigir `--mode convos`. Fronteira de âmbito documentada no header (correspondência textual sobre formas naturais + ofuscações leves; não é um parser de shell).

### Changed
- Skill **`mempalace-doctor` absorvida** por `memory-doctor` (removida; etapas, checklist, migration-recipes e scope-model migrados/reescritos nas references por camada).
- `marketplace.json`, `README.md` e o gate do `/prumo-doctor` (`HAS_MEMPALACE` → `HAS_BASE`) actualizados para a nova skill.

### Tests
- eval-harness: corpus **96 → 135 casos** (`hook_path()` mapeia `memory-scope`; breakdown por hook), todos **mutation-proof** (remover qualquer normalização/guard reabre FN ou FP). `validate.sh` 0/0 · `smoke.sh` 35/0. Revisão final adversarial: **APROVADO**.

## v0.5.0 — 2026-07-07

**Telemetria dos guardrails + hardening de segurança** (adicionado à linha 0.5.0 em 2026-07-07):

- **Telemetria (Fase 03):** `prumo-common.sh` ganha `prumo_telemetry_init/record/summary` (trap EXIT por choke-point, log TSV sem PII, guardas `BASH_SUBSHELL`/`PRUMO_TM_RECORDED`); novo comando `/prumo-telemetry` e secção no `/prumo-doctor`.
- **`hook_tool_payload` partilhado:** movido para `lib/prumo-common.sh` como fonte única (antes só existia no `secops/hooks/_lib.sh`); o `_lib.sh` mantém um fallback fail-closed.
- **Segurança — `pre-tool-audit-guard.sh`:** a classe de fronteira de palavra passa a incluir `(` e backtick, fechando o bypass de `rm`/`truncate`/marker embrulhados em `$()`/subshell/backtick (incl. auto-desactivação do marker de audit); deteção de ofuscação passa a correr sobre o comando inteiro (apanha `curl … | bash` que o split por `|` deixava passar).
- **`/prumo-doctor`:** novo check de binários essenciais (jq marcado como CRÍTICO — hooks dependem dele).
- Robustez: `validate.sh` deixa de ter falso-verde no check de hooks-json (o `fail()` corria em subshell); `package.sh`/`validate.sh` com `cd || exit`.

**BREAKING — rebranding wire → prumo** (2026-07-06). O plugin passa a chamar-se `prumo-base` no marketplace `prumo`.

- Renomeados: comandos `/wire-*` → `/prumo-*`, skills, `lib/wire-common.sh` → `lib/prumo-common.sh`, funções `wire_*` → `prumo_*`, env vars `WIRE_*` → `PRUMO_*`, estado `~/.wire/` → `~/.prumo/`
- Bridge de migração: na primeira execução, `~/.wire/mode` (e `lab-mode`) é copiado para `~/.prumo/` automaticamente
- Owner passa a mjvmst · mjvmst@gmail.com; licença "Proprietary - uso interno"
- Upgrade: `/plugin uninstall wire-base@jump2new` seguido de `/plugin install prumo-base@prumo`

## v0.4.0 — 2026-05-26

### Adicionado

- **`/wire-style` (command + skill)** — activa/remove um estilo de output conciso e directo, injectando um bloco versionado e delimitado por marcadores (`<!-- wire-style BEGIN vN -->` / `<!-- wire-style END -->`) num `CLAUDE.md`. Inspirado no [talk-normal](https://github.com/hexiecs/talk-normal) (MIT), mas no canal nativo do Claude Code em vez de `AGENTS.md`. `/wire-style` (status) · `/wire-style on [--user]` · `/wire-style off [--user]`. Scope **projecto** por default (`./CLAUDE.md`); `--user` para `~/.claude/CLAUDE.md`. Idempotente (substitui versão antiga em vez de duplicar), uninstall cirúrgico (só remove entre marcadores), backup automático em `~/.wire/backups/` antes de qualquer escrita via `wire_backup`. Não é hook nem reescrita runtime — injecção de config; não respeita `WIRE_OPERATING_MODE`.
- `base/smoke.sh`: assert do novo command.

## v0.3.0 — 2026-05-19

### ⚠ Upgrade · OBRIGATÓRIO desinstalar a versão antiga antes de instalar v0.3.0

Claude Code não actualiza plugins in-place de forma fiável; cache da versão antiga pode coexistir com a nova e provocar comportamento inconsistente (commands antigos chamados, hook antigo activo). Faz **sempre**:

```
/plugin uninstall wire-base@jump2new
/plugin install wire-base@jump2new
```

Depois recarrega a sessão (nova janela ou Ctrl-D + abrir) para os hooks novos entrarem em vigor.

Verifica com `/plugin list` que aparece `wire-base · 0.3.0 · user` (e que **não** há entrada duplicada).

### Adicionado

- **`/wire-vault-bootstrap`** — provisiona infra Vault genérica (audit device em `/vault/audit/audit.log`, kv-v2 em `secret/`, approle auth, transit engine, ssh engine). Idempotente. Padrão `--plan` (default) / `--apply`. Valida policy='root' antes de qualquer escrita (defesa em profundidade contra allowlist do hook secops). Refuse-and-redirect para `/wire-vault-kv-migrate` se detectar kv-v1 com dados.

- **`/wire-vault-kv-migrate`** — migra `secret/` de kv-v1 para kv-v2. Destrutivo, fluxo em 3 etapas exclusivas: `--plan` (walker recursivo, conta paths+keys, não escreve), `--backup` (exporta para `~/vault/backups/kv-v1-<ts>.json` em JSONL com chmod 600, valida JSON), `--apply` (exige backup <24h, faz disable→re-enable v2→re-import, gate por env-var `WIRE_VAULT_MIGRATE_CONFIRM=migrate-now`).

- `base/smoke.sh`: asserts dos 2 novos commands.

### Fonte

Plano: `docs/superpowers/plans/2026-05-19-wire-vault-bootstraps/`.
Resolve findings #1, #2 e parte de #4 do `/wire-vault-doctor`.

## [0.2.1] — 2026-05-15

### Added

- **`hooks/pre-tool-audit-guard.sh`** — PreToolUse hook que dá defense-in-depth ao `wire-devkit`. Activa-se quando `~/.wire/audit-active` existe ou `WIRE_AUDIT_ACTIVE=1` está definida (skill marca o início da Fase 4 com apply); bloqueia tools `Bash|Write|Edit|MultiEdit|NotebookEdit` se o tool input é destrutivo (`rm` fora de `/tmp`, `git rm`, SQL `DROP/ALTER/TRUNCATE/DELETE`, Edit/Write a `.gitignore`/`.env*`/`config/initializers/`/`spec/`/`test/`/`.github/workflows`/`filter_parameter_logging.rb`/`backtrace_silencers.rb`) a menos que `WIRE_AUDIT_APPLY=1` esteja exportada (skill aprovou explicitamente após gates). Em prod fail-closed (exit 2), em dev warn-only via `wire_fail_or_warn`. Registado em `hooks.json` com matcher conjunto. Silencioso fora de contexto de audit — não interfere com qualquer outro uso de Claude Code.

### Notes

- Este hook torna efectiva a política `shared/safe-apply.md` do `wire-devkit` mesmo se o agente decidir ignorar a metodologia da skill — a defesa é dupla: contractual (skill) + enforcement (hook).
- Sem `wire-devkit` instalado o hook é no-op (marker file e env nunca aparecem).

## [0.2.0] — 2026-05-15

Iteração focada em **upgrade story**, **smoke tests** e **vault policy templating**. Sem breaking changes.

### Added

- **Command + skill `wire-upgrade`** — verifica versões instaladas (cache local) vs. remotas (raw GitHub do marketplace). Comparação semver via `sort -V`. Para cada plugin com update disponível, emite a linha `/plugin install <plugin>@jump2new` para colar. Read-only — não auto-instala.
- **Command + skill `wire-vault-policy`** — gera template HCL parametrizado para uma nova policy Vault. Flags: `--kv-read`, `--kv-write`, `--kv-full`, `--transit-key`, `--ssh-role`, `--dest`. Escreve em `$VAULT_HOME/policies/<nome>-policy.hcl` para revisão; não aplica.
- **Command + skill `wire-smoke`** — orquestra `smoke.sh` shippados em cada plugin. Argumento `base|secops|devkit|all`. Exit `0`/`1`/`2` (ok/fail/degraded-warns). Read-only. ~2s por plugin.
- **`smoke.sh`** em cada plugin (wire-base, wire-secops, wire-devkit) — sanity check de install correctness. Funciona tanto a partir da cache (post-install) como da source tree (dev/CI) via fallback.

### Changed

- **`/wire-onboard`** · Passo 3 reescrito para sugerir `/wire-smoke` em vez de smoke tests manuais. Smokes operacionais (`/vault-list`, `/wire-stack-doctor`, `/full-audit --ci`) ficam como sugestões secundárias.
- **`scripts/validate.sh`** · nova secção `smoke.sh (per plugin)` — valida bit de execução e shebang em cada `smoke.sh`.

## [0.1.0] — 2026-05-15

Versão inicial do plugin no marketplace `jump2new`.

### Added

- **Skill `mempalace-doctor`** — diagnóstico de saúde do tool MemPalace (drawers SQLite, HNSW, KG, idade de backups, jobs launchd/systemd).
- **Skill `claude-deep-audit`** — auditoria profunda de uma instalação Claude Code via 10 sub-agentes paralelos (CLAUDE.md, settings, skills, hooks, MCPs, memory, plugins, x-refs).
- **Skill `vault-toolkit`** — trigger fino que roteia intenções "segredos / Vault" para os 5 commands `/vault-*`.
- **Command + skill `wire-onboard`** — setup wizard do ecossistema: detecta plugins instalados (base/secops/devkit), emite linhas `/plugin install` para gaps e sugere smoke tests por plugin. Idempotente.
- **Command + skill `wire-doctor`** — meta-doctor read-only. Orquestra `mempalace-doctor`, `claude-deep-audit`, `/vault-audit` e (se `wire-secops` instalado) `/wire-vault-doctor` em paralelo; consolida num relatório único com status por componente e top acções priorizadas.
- **Command + skill `wire-mode`** — interface slash para o `WIRE_OPERATING_MODE`. Lê/escreve `~/.wire/mode` e gere o marker `~/.wire/lab-mode` (obrigatório para activar `lab`). Suporta `prod | dev | lab | status`.
- **Command + skill `wire-context-pack`** — cheat-sheet curado por scope (`ir | release | audit | all`) com skills, commands, agents, paths Vault, AppRoles, logs e one-liners relevantes. Não corre live data — é mapa. Marca itens de plugins não instalados com `(plugin em falta)`.
- **Commands** `/vault-list`, `/vault-set`, `/vault-audit`, `/vault-backup`, `/vault-integrate`.
- **Hook SessionStart** `vault-session-check.sh` — auto-unseal opcional do Vault local (lê `~/vault/vault-init.json`) e injecta nota de contexto.
- **Lib partilhada** `lib/vault-env.sh` — `V()` (native/docker abstraction), `vault_ready`, `vault_unseal`, `vault_container_up`, `vault_arrange_up`. Source-able por outros plugins.
- **Lib partilhada** `lib/wire-common.sh` — `wire_mode`, `wire_scope`, `wire_log`, `wire_backup`, `wire_fail_or_warn`, `wire_require`, `wire_is_prod/dev/lab`. Estabelece `WIRE_OPERATING_MODE` (prod/dev/lab) que plugins downstream respeitam.

### Notes

- O `vault-toolkit` **detecta** instalações existentes em `~/vault/` e adapta-se — nunca migra estrutura.
- Versão inicial após reset do histórico git ("clean slate") do repositório do marketplace.

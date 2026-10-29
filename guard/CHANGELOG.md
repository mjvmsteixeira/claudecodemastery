# Changelog — prumo-guard

Formato: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versionamento: [SemVer](https://semver.org/spec/v2.0.0.html).

## v1.4.0 — 2026-10-29

**Os segredos colados no chat ficam guardados no Vault.** Antes eram redigidos e perdiam-se; agora o prumo-guard grava-os numa inbox e o marcador aponta para lá. Requer o prumo-base 1.1.0.

### Mudanças de comportamento

- **Captura:** antes de redigir, os segredos do prompt (`prompt.submit`) e dos argumentos de slash commands (`command.run`) são gravados em `secret/inbox/<projeto>/<aaaammdd-hhmmss>-<n>`, campo `value`, por `vault-write-field.sh` (`kv put -cas=0`: nunca sobrescreve). O valor só viaja por stdin.
- **Marcador com referência:** `[prumo:CLASSE→secret/inbox/<projeto>/<id>#value]`; PII e falhas ficam com o marcador simples. O mesmo valor repetido na sessão reutiliza a referência.
- **Contexto para o modelo:** uma linha `[prumo-guard]` diz que o valor está guardado e que só a referência é visível.
- **Falhas:** Vault inacessível, sem permissão ou colisão deixam o segredo só redigido, com aviso; sem o prumo-base 1.1.0, aviso único por sessão; se a redação do prompt falhar, o prompt é descartado (`{ drop }`).
- **Configuração:** `redact.capture` (por omissão `true`). Padrões `extra` do `redact.json` só são capturados com `"secret": true`.
- **Limites:** prompts `isMeta` não são tocados; imagens e anexos não são lidos; máximo de 10 segredos novos por prompt.
- **Permissão:** o token (cache AppRole ou `vault-env.sh`) precisa de `create` em `secret/data/inbox/*`; HCL mínimo no README. Requer anexar essa policy ao AppRole do Claude (o token em cache tem `deny` na inbox); sem ela a captura cai sempre em «não guardado».
- **Redação:** falsos negativos corrigidos (`$` dentro de valores entre aspas, aspa de fecho da palavra-chave, frases entre aspas, pontuação interna).

## v1.3.1 — 2026-10-29

**A redação apanha mais, e o Vault deixa de receber marcadores.** Uma palavra-passe escrita em prosa passava em claro, e um valor já redigido podia ser gravado no Vault como se fosse o segredo.

### Mudanças de comportamento

- **Palavras-chave novas:** `senha`, `palavra-passe` (também com espaço ou `_`), `passphrase` e `pass` (não dentro de `bypass`, `compass`, `passport`).
- **Prosa:** `<palavra-chave> … é|is|era|was <valor>` e `<palavra-chave> <valor>`. Sem aspas, o valor em prosa ou depois de `: ` tem de conter um dígito ou um símbolo. Valores com 5 ou mais caracteres (o mínimo desceu de 6 para 5, também para as palavras-chave que já existiam); com aspas podem ter espaços (exceto em `pass` sozinho, que pede dígito ou símbolo dentro das aspas), sem aspas podem ter `,` e `;`.
- **`.env`:** variáveis em maiúsculas `*_KEY=`.
- **Classes novas:** `CHAVE-API` (`sk-`, `sk-proj-`, `sk-ant-`, `sk-svcacct-`, `sk_live_`/`sk_test_`/`rk_live_`/`rk_test_`, `AIza`, `glpat-`, `npm_`) e `TELEGRAM-TOKEN`. `SLACK-TOKEN` aceita também `xapp-`.
- **Exclusões:** referências (`$…`, `process.env`, `os.environ`, `ENV[`, `<…>`, `{{…}}`) e tipos ou literais (`true`, `false`, `null`, `none`, `nil`, `undefined`, `string`, `str`, `number`, `int`, `bool`, `boolean`, `required`, `optional`).
- **Limite conhecido:** um PIN de 4 dígitos não é coberto.
- **Menos falsos positivos:** a pontuação final não conta como símbolo nem entra no valor, a interna conta (`the token expires.`, `token (optional)`); `pass "all tests passed"` não é redigido (frase sem dígito nem símbolo); código de shell a seguir à palavra (`secret 2>/dev/null`, `.root_token ~/vault/…`, `auth/approle/login`) e taxas como `99.5%` ficam de fora. `a senha é <valor>.` redige o valor sem o ponto final.
- **Limites conhecidos:** `PRIMARY_KEY=id_col` é redigido (regra `*_KEY=` mantida); o hook do Vault não vê o conteúdo de ficheiros (`@f.json`) nem variáveis de chamadas anteriores.
- **Gravações no Vault com marcadores recusadas** (hook `tool.call` no Bash, fail-closed, ativo mesmo com a redação desligada): `vault kv put|patch` (também com opções como `-mount=` pelo meio), `vault write` em `secret/`, `kv` ou com `-mount=`, e `curl`/`wget` de escrita em `/v1/secret/` ou `/v1/<mount>/(data|metadata)/`. A recusa manda guardar o valor no terminal da pessoa com `vault kv patch <caminho> <campo>=-` (`kv put` se o caminho não existir).

## v1.3.0 — 2026-10-24

**Painel com consumo a cores.** A band acima do prompt passa a mostrar o consumo de contexto, dos limites de taxa e do custo com barras coloridas, e avisa quando um limite se aproxima do fim.

### Mudanças de comportamento

- **Linha larga** (a partir de 110 colunas): `◆ [ralph N/M · ]<fase>`, depois `ctx`, `5h` e `7d`, cada um com uma barra de 8 células e a percentagem, mais `↻ <reset>` em cada limite, e o custo. Com o travão ligado e orçamento definido, o custo aparece como `NN,NN/BB USD`.
- **Linha estreita** (abaixo de 110 colunas): `◆ … · ctx NN% · 5h NN% ↻XhYY · 7d NN% · custo`. O `↻` só aparece para resets nas próximas 24 h.
- **Cores por limiar:** abaixo de `warn`, `success`; de `warn` até `crit`, `warning`; a partir de `crit`, `error` a negrito. Os limiares são 50 e 80 por omissão.
- **Alertas a partir de `crit`:**
  - `▲ limite de 5 horas a NN% — reinicia em XhYY`
  - `▲ limite de 7 dias a NN% — reinicia <dia HH:MM>`
  - `▲ limite <nome> a NN%` para limites de outro tipo
  - `▲ contexto a NN% — compacta em breve (/compact)`
  - `▲ orçamento a NN% (GG,GG/BB USD)`, só com o travão ligado e orçamento definido
- **Pausa:** o rótulo ` PAUSA ` invertido (fundo `error`), seguido de `<motivo> · ferramentas recusadas`, do resultado do ralph (`loop do ralph suspenso`, `não foi suspenso` ou `de outra sessão (não tocado)`) e de `/prumo-guard-resume`.
- **`guard.json`:** secção nova `panel: { warn, crit }` (50 e 80). Valores inválidos ou incoerentes caem nos valores por omissão. O `/prumo-guard` mostra `painel: aviso W% · crítico C%`.
- **Upgrade a partir do 1.2.0:** o estado antigo, que sobrevive ao `/reload-plugins`, é tolerado sem erros.
- `mod-audit`: 7 hooks gating sem `.catch` e 4 com (sem alteração). Testes: 371.

## v1.2.0 — 2026-10-24

**Tier user: sem `classic.*`, e um travão que trava.** O `cc-plugin-sec-default` passa os eventos `classic.*` adiante sem chamar os mods do tier user, por isso o escritor do FRIDAY e o veto no `Stop` nunca correram e enchiam o contexto de avisos. O mod deixa de os registar, e o travão passa a atuar pelos eventos que o tier user recebe.

### Mudanças de comportamento

- Em pausa, o travão recusa todas as ferramentas exceto `loop_phase`, incluindo as dos subagentes. A recusa entra no trilho CEF como `deny`. Só com `brake.enabled`.
- No disparo, o loop do ralph fica suspenso: `.claude/ralph-loop.local.md` passa a `.claude/ralph-loop.local.md.paused`, e sem esse ficheiro o stop hook do ralph não faz re-prompt. Só se suspende um loop desta sessão (o `session_id` do frontmatter) ou sem dono; o de outra sessão no mesmo projeto não é tocado e o aviso di-lo. Um `.paused` antigo é guardado como `.paused.<epoch ms>`.
- `/prumo-guard-resume` repõe o `.paused` e retoma o loop (se for de outra sessão, repõe-no e diz a que sessão pertence e como retomar). `/prumo-guard-stop` termina-o: apaga o ficheiro ativo, o `.paused` e os `.paused.<epoch ms>`; não tira a pausa. Ambos funcionam sempre, mesmo em pausa.
- No arranque, se houver um `.paused`, um aviso di-lo.
- O FRIDAY sai do mod: o caminho é o `friday-state.sh` da FRIDAY, e a chave `friday` do `guard.json` passa a ser ignorada.
- O mod deixa de registar `classic.*`, que no tier user eram saltados e enchiam o contexto de avisos.
- O despachante `tool.call` decide e falha aberto: se o estado do travão não se puder ler, a chamada passa.
- `mod-audit`: 7 hooks gating sem `.catch` e 4 com (antes 17 e 5). Testes: 320.

## v1.1.0 — 2026-10-15

**Regras de aprovação por projeto.** Num pedido N1, `4: Este comando, sempre neste projeto` ou `5: Todos os N1 neste projeto` grava uma regra em `~/.prumo/rules/<sha256 do projeto>.json` e aprova o comando atual. A regra fica ativa nesta sessão.

- **Arranque.** Ao abrir uma sessão no projeto, a band mostra cada regra com `7: Ativar nesta sessão · 8: Agora não · 9: Revogar`. Os dígitos 7/8/9 não coincidem com os 1 a 5 do pedido, por isso um pedido que surja no instante do toque não recebe o dígito destinado à regra. Uma regra só vale depois desse dígito, por isso uma regra escrita pelo agente nunca se ativa sozinha. O match usa a cópia tirada na ativação.
- **Projeto.** É a raiz git do diretório da sessão no arranque, ou o próprio diretório sem git. Fica fixo durante a sessão: um `cd` posterior não o muda. A regra ativa acompanha a sessão e não o diretório, por isso depois de um `cd` para outro repositório uma regra "todos os N1" continua a aprovar N1.
- **Como aprova.** Com regras ativas, o mod classifica cada Bash correndo o approval-gate. Num N1 com uma regra que bata, escreve o mesmo `approvals/<id>` de uso único do `1: Só esta`. O tecto de 10 minutos do gate não muda, e o modelo recebe a nota `aprovado pela regra do projeto`.
- **Âmbito.** Só N1: o N2, o N3 e o `run_with_secret` pedem sempre, e o pedido do `run_with_secret` não mostra as opções 4 e 5. Uma regra "todos os N1" não limita os caminhos que o comando toca.
- **Integridade da oferta.** Uma regra `command` só é válida se o sha256 do texto bater com o `commandId`; se alguma regra falhar, o ficheiro inteiro é ignorado. Assim o comando mostrado na band é exatamente o que a regra aprova. O `createdAt` tem de ser uma data ISO.
- **Sessões concorrentes.** Ao criar ou revogar, o mod relê o ficheiro do disco e junta as alterações em vez de o sobrescrever. Se o ficheiro estiver inválido, substitui-o pelo espelho da sessão.
- **`/prumo-guard-rules`** lista as regras do ficheiro e as ativas nesta sessão, e revoga-as: revogar desativa a regra e tira-a do ficheiro. A linha de estado mostra `regras N1: <n> ativa(s)`.
- **Erros.** Um ficheiro de regras inválido é ignorado com aviso. Se a escrita falhar, a regra vale só nesta sessão. Com o gate em falta ou uma saída inesperada, o pedido segue como sempre.
- **Dependência.** Requer o prumo-base 1.0.1 para o self-guard proteger `~/.prumo/rules/`, que é best effort. A defesa real é a ativação no arranque.
- **Residuais (BACKLOG B15, B16).** A band e o painel mostram o comando numa linha e não neutralizam quebras de linha nem caracteres de controlo; duas escritas de regras em paralelo na mesma sessão podem perder uma atualização.

## v1.0.4 — 2026-10-15

**A redação aparece como `RGPD`.** A linha de estado mostra `prumo dev · RGPD on` em vez de `redação on`, e o `/prumo-guard` e a resposta do `/prumo-guard-redact` usam o mesmo nome. As descrições dos comandos explicam o termo: "RGPD (redação de segredos e dados pessoais)". O comando continua a chamar-se `/prumo-guard-redact`, e o comportamento não muda.

## v1.0.3 — 2026-10-15

**A band explica que o dígito vai sem Enter, e os botões ficam legíveis em terminais estreitos.** Medido no terminal real, em tmux a 65 colunas: o dígito fica um instante no prompt antes de carregar no botão. Com Enter a seguir, sai como mensagem e o pedido fica por decidir. A 1.0.2 também colava `1: Só esta2: 10 minutos` (um `Text` só com um espaço perde-se) e partia a dica numa coluna estreita ao lado dos botões.

- Os botões ficam numa linha própria com `columnGap`, tanto na band como no painel, e a dica passa para a linha de baixo: `só o dígito, sem Enter, com o prompt vazio · /prumo-guard-approvals abre o painel`.
- A notificação diz `1/2/3 com o prompt vazio, sem Enter`.

## v1.0.2 — 2026-10-15

**O pedido de aprovação deixa de tirar o teclado.** Na 1.0.1 cada recusa do approval-gate abria o painel `prumo · aprovação` com foco: com o prompt vazio o painel ficava com as teclas, e os botões `[ Só esta ][ 10 minutos ][ Negar ]` não diziam que `1`/`2`/`3` respondiam nem que o `Esc` o fechava. Quem estava a trabalhar ficava sem prompt.

- O pedido aparece na band acima do prompt: `1: Só esta · 2: 10 minutos · 3: Negar`, um dígito com o prompt vazio responde, e quem está a escrever continua a escrever. Com um inquérito do Claude Code aberto, a band cede-lhe o lugar. Vale também para os pedidos do `run_with_secret`.
- O painel continua no `/prumo-guard-approvals`, com foco, as teclas à vista e a linha `Esc fecha o painel; o pedido continua na band acima do prompt.`
- A notificação acrescenta `1/2/3 com o prompt vazio`.
- Funciona com o prumo-secops 1.0.0; com o 1.0.1 há menos pedidos, porque apagar dentro do scratchpad do Claude Code deixa de pedir aprovação.

## v1.0.1 — 2026-10-15

**O travão passa a ser opt-in.** Na 1.0.0 atuava por omissão e, fora de um loop ralph, contava o custo da sessão inteira a partir de zero: numa sessão interativa longa pausava e, acima de 120% do orçamento, cortava turnos. Agora só atua com `brake.enabled: true` no `~/.prumo/guard.json` (ação humana); por omissão não pausa, não veta o `Stop` e não corta turnos.

- `GuardConfig.brake.enabled` (default `false`), verificado no orçamento em USD, nos tokens e nas repetições.
- `/prumo-guard` mostra `travão: ligado` ou `travão: desligado (guard.json → brake.enabled)`.
- Testes: com o travão desligado, 41,44 USD sobre 20 não pausam nem cortam o turno; repetições e tokens não pausam; `enabled: false` explícito ignora o orçamento.
- Migração: quem quer o travão acrescenta `"enabled": true` à secção `brake`.

## v1.0.0 — 2026-10-14

**Primeira release do prumo-guard.** O `run_with_secret` é experimental, está desligado por omissão e pede aprovação humana a cada chamada; o travão pausa em cada disparo e só corta o turno acima de 120% do orçamento em USD.

**`run_with_secret`: limitações conhecidas.** Experimental; recomenda-se mantê-lo desligado em loops sem supervisão e ligá-lo só com allowlist explícita em `~/.prumo/secret-exec.json`. O único controlo real é a aprovação humana por chamada, de uso único e não forjável enquanto o prumo-guard está ativo (registo em memória e ficheiro; ficheiro sem registo é apagado e recusado). A lista de recusa do `argv` é defesa em profundidade e best effort: uma chamada aprovada a um cliente da allowlist pode correr código com o segredo no ambiente e devolvê-lo em formas que o mascaramento não cobre. Escapes conhecidos: `psql -o '|cmd'`/`--output='|cmd'`, opções longas abreviadas (`--fil`) e `\g (opções) | cmd`; `mysql` `pager`/`tee`/`\P`/`\T`; `gh api -iq 'env…'`/`-pq` com jq que lê o ambiente e subcomandos que correm `git` no `cwd` (`pr checkout`, `repo sync`, `pr create`) e leem o `.git/config`. Aprovar uma chamada é confiar nesse comando com o segredo. Residuais em `BACKLOG.md` (B12).

**Aviso: a API de mods (function hooks) do Claude Code é early access e pode mudar entre versões do Claude Code.** Nomes de eventos, regras do validador e comportamento dos tiers podem exigir ajustes neste mod.

### Added
- Scaffold do mod: manifesto, `hooks.json` com `modules`, `register.tsx` com um só `session.start`, configuração (`guard.json`) com defaults, contrato de estado `prumo-guard`, testes e smoke.
- Aprovação humana por comando: painel `prumo · aprovação` sobre o contrato do `approval-gate` do prumo-secops 0.11.0 (`approvals/<id>`, 5 minutos ou 10 minutos).
- Redação de segredos e PII em `session.append` e `prompt.submit` (NIF, CC e IBAN com validação), padrões próprios em `redact.json` e guarda contra marcadores `[prumo:...]` em escritas.
- Painel do loop (iteração do ralph, fase, contexto, custo, subagentes, testes) e ferramenta `loop_phase`.
- Travão do loop: orçamento USD e de tokens, repetição de chamadas, de falhas de teste e de edições desfeitas, veto ao re-prompt do ralph; `/prumo-guard-resume` e `/prumo-guard-stop`.
- Trilho CEF com veredicto por chamada, em lote, para `~/.prumo/log/cef.log` e UDP; o secops não duplica quando o mod está ativo.
- `run_with_secret`: comandos com segredos do Vault por variável de ambiente, desligado por omissão (`secretExec.enabled`), com aprovação humana por chamada, output mascarado e allowlist em `secret-exec.json`.
- Agentes escondidos do modelo (`agents.hidden`) e `/prumo-guard-agents`.
- Idade das memórias nos resultados do `mempalace_search`.
- Writer do `friday-state` no processo, desligado por omissão (`friday.enabled`).
- Comandos humanos `/prumo-guard`, `/prumo-guard-mode`, `/prumo-guard-redact`, `/prumo-guard-approvals` e entrada na linha de estado.
- Instalação gerida em clientes (`docs/instalacao-gerida.md`).

### Fixed (revisão final do ramo)
- Aprovação: o id escrito em `approvals/<id>` é calculado a partir do comando que a pessoa vê, e o painel só abre se a recusa do gate trouxer esse id. Antes vinha do primeiro `approval-id:` do texto, que o próprio comando (na pré-visualização) ou o output de outro comando podiam pôr lá, e a pessoa aprovava um comando diferente do que via.
- Aprovação: a mensagem ao modelo cita o comando numa só linha e sem crases.
- `run_with_secret`: recusa as formas conhecidas de correr código com os clientes da allowlist (`git -c`, `docker run`, `kubectl exec`, `curl -K`, `psql \!`, ...), variáveis de loader e de comportamento (`PATH`, `LD_*`, `DYLD_*`, `GIT_*`, ...) e argumentos ou `cwd` em `~/.prumo` e nos settings; corre os mesmos PreToolUse do Bash (`self-guard`, `secret-read`, `workspace`, `agent-readonly`) antes do approval-gate; as recusas voltam como `deny`. Um `secret-exec.json` inválido recusa em vez de cair na allowlist por omissão. A descrição deixa de prometer mais do que o mascaramento faz.
- Travão (D6): a pausa já não corta o turno; o corte (`$.turn.abort`) só acontece acima de 120% do orçamento em USD, também depois de uma pausa. `loop_phase` não conta como repetição. O veto no `classic.Stop` tem `.catch`, e uma falha do friday-state já não o derruba.
- Trilho CEF (D10): o despachante passa a ser o hook mais exterior, por isso as recusas do próprio mod entram no trilho como `deny`. Depois de `/clear` ou resume o marker e as linhas passam para o id novo (também no friday-state). O fim da sessão espera pelo lote em escrita.
- `redact.json` ilegível ou inválido avisa (toast e `/prumo-guard`) em vez de desligar os padrões da organização em silêncio.
- Testes: os stubs de `clock.every` recusam o período, em vez de pôr os flushes periódicos em ciclo apertado.

### Security
- `run_with_secret` desligado por omissão: só corre com `secretExec.enabled: true` no `guard.json` (decisão da pessoa); desligado, a ferramenta não é registada e uma chamada é recusada.
- `run_with_secret` pede aprovação humana a cada chamada: id = sha256 de `run_with_secret\n` + JSON `{argv que corre, secrets ordenados por nome, cwd}`, ficheiro `approvals/<id>` (N2) e registo do diálogo; cada aprovação serve uma só chamada, também com `10 minutos` (o registo fica gasto e o ficheiro apagado quando corre); o resto é apagado e recusado. O painel mostra o `argv` inteiro, as referências e o `cwd`, nunca os valores; uma chamada que não caiba nos 400 caracteres do painel é recusada. O comando corre no `cwd` aprovado, e o approval-gate continua a correr depois.
- Allowlist por omissão reduzida a `psql`, `mysql`, `curl`, `gh`. `git`, `docker`, `kubectl` e `mongosh` recusam mesmo listados, salvo `"allowRisky": true` no `secret-exec.json`. No `psql` e no `mysql`, qualquer `\!` num argumento e `system` no início de uma instrução recusam.
- O controlo é a aprovação humana de cada chamada: um binário aprovado pode correr código com o segredo no ambiente, e o mascaramento cobre só a forma crua e a codificada em URL. Antes, `git status` num repositório com `core.fsmonitor`, `mongosh --eval` ou `psql \!` corriam código com o segredo e devolviam-no codificado, sem aprovação.
- **Aprovações com registo humano.** O diálogo grava cada decisão no átomo `approvals` da sessão (`id`, nível, `scope`, `expires`, `used`) antes de escrever `approvals/<id>`. Com o mod ativo, um ficheiro de aprovação só serve com um registo que bata (mesmo id e nível, por expirar e, em `once`, por usar): antes de cada Bash chegar ao approval-gate, e no `run_with_secret` para o ficheiro da chamada e para o do gate, um ficheiro sem registo é apagado e o comando recusado (`aprovação não reconhecida: o ficheiro não foi criado pelo diálogo do prumo-guard`). O hook do Bash da aprovação ganha `.catch`, que recusa quando a verificação falha antes de o comando seguir. Antes, `cd ~ && ln -s .prumo y` e `curl -o y/approvals/<id> file:///…` fabricavam uma aprovação que o gate e o `run_with_secret` aceitavam.
- **`run_with_secret` isolado da configuração do cliente.** O cliente corre com `HOME`, `XDG_CONFIG_HOME` e `XDG_DATA_HOME` num diretório novo e vazio (`mktemp -d`, apagado no fim), `curl -q` e `mysql --no-defaults` como primeiro argumento, `psql -X` com `PSQLRC=/dev/null` e `gh` com `GH_CONFIG_DIR` no diretório temporário; recusa `curl --variable`, `--expand-*`, `-K`/`--config` (também abreviados). O painel mostra o `argv` que corre, com estas opções. Antes, um `~/.curlrc` com `variable = %TOKEN` e `expand-header` mandava o segredo em base64 (sem máscara) numa chamada que o painel mostrava como `curl http://...`.
- **Rotas restantes de aprovação fechadas.** A lista de recusa do `run_with_secret` deixa de falhar por aglomerados de opções curtas: `curl -aK` (e `-BK`, `-MK`, `-hK`, `-VK`), psql `-qf`/`-Atf`/`-1f` e mysql `--execute=system`/`-esystem`/`--execute=source` passam a recusar — antes o `K`/`-f`/`system`/`source` escapava por vir depois de outras letras, de `=` ou da letra `e`. A deteção de cluster pára na primeira opção que leva valor, por isso `curl -HKey: v` continua a passar.
- **Exfiltração do ambiente por cliente.** Recusa `psql \getenv` (traz uma variável de ambiente — o segredo — para uma variável do psql que o SQL emite codificada) e `gh --jq`/`-q` com a builtin `env`/`$ENV` do gojq (lê o ambiente e codifica o segredo); `.env`/`.environment` (acesso a campo) continuam a passar. O mascaramento do output passa a cobrir também o segredo em hex e base64 (defesa em profundidade; não cobre transformações arbitrárias — a barreira é o checkArgv).
- **Aprovação de um comando Bash longo não esconde a cauda.** O painel mostra o início E o fim do comando, com o meio marcado como omitido e a contagem de caracteres, e diz que a aprovação cobre o comando inteiro. Antes truncava em 400 caracteres e a pessoa aprovava um prefixo sem ver a cauda (o id sempre cobriu o comando todo).
- **Janela TOCTOU com o approval-gate estreitada.** Depois de um Bash correr, o mod varre um `approvals/<id>` sem registo humano que tenha surgido na janela entre a verificação do mod e a leitura do gate (noutro processo): apaga-o para não autorizar o comando seguinte e avisa o modelo. A verificação de cada comando já apagava um ficheiro sem registo, por isso um ficheiro forjado não persiste além de um comando.
- Residual (BACKLOG B12): sem o prumo-guard instalado, o approval-gate sozinho continua a confiar no ficheiro (até 10 minutos); escritas por caminho relativo depois de um `cd`, e um symlink para `~/.prumo` criado sem a literal `.prumo`, continuam best effort no `self-guard` do prumo-base; o registo é da sessão; e a janela de **um único comando** entre a verificação do mod e a leitura do gate noutro processo não fica fechada — a barreira efetiva para esse comando é o prompt de permissão do Bash. Ids com NUL ou surrogates isolados divergem entre o gate e o mod (pré-existente, presumivelmente inexplorável).

### Notes
- API de mods em early access.
- `/prumo-mod-audit` mostra 17 hooks sem `.catch` e 5 com; dois dos 17 decidem e falham abertos (`prompt.submit` e `agent.offer`). Ver README.

# prumo-guard

Mod Claude Code (function hooks em TypeScript) · guardrails do kit prumo · v1.0.0

**Aviso: a API de mods do Claude Code é early access.** Os nomes de eventos, as regras do validador e o comportamento dos tiers podem mudar entre versões do Claude Code; cada mudança pode exigir ajustes neste mod. Os hooks de eventos `classic.*` não correm em plugins instalados por uma pessoa quando uma organização gere o Claude Code (ver `docs/instalacao-gerida.md`).

Recomenda `prumo-base` e `prumo-secops` (usa os seus hooks como classificadores). Cada funcionalidade funciona sem as outras; as que dependem de outro plugin dizem-no abaixo.

## Instalação

```
/plugin install prumo-guard@prumo
```

Equivalente na shell:

```bash
claude plugin install prumo-guard@prumo
```

## O que faz

### Aprovação humana por comando

Quando o `approval-gate` do prumo-secops recusa um comando Bash, o mod regista o pedido, abre o painel `prumo · aprovação` e notifica. A pessoa escolhe `Só esta` (5 minutos), `10 minutos` ou `Negar`; a escolha escreve `~/.prumo/approvals/<id>` (`level=`, `expires=`, `scope=`) e o modelo recebe uma mensagem a dizer que pode repetir exatamente o comando (ou que foi negado). Os pedidos pendentes (máximo 20) aparecem na linha de estado.

Dependência do contrato do approval-gate: o mod lê da mensagem de bloqueio o nível (`[prumo-secops/approval-gate] Operação N<k> detectada:`) e calcula ele próprio o id do comando que mostra à pessoa (sha256 do comando, com quebras de linha e tabs trocados por espaço, como o gate). O painel só abre se a mensagem trouxer `approval-id: <esse id>`, e o ficheiro escreve-se sempre com esse id: um id que só apareça no texto (na pré-visualização do comando ou no output de outro comando) nunca é o que fica aprovado. Isto exige o **prumo-secops 1.0.0 ou superior**. Sem ele o painel não abre e a aprovação continua a ser a do `PRUMO_APPROVE`.

A mensagem ao modelo cita o comando numa só linha e sem crases, para o texto do agente não se ler como sendo da pessoa. O gate só aceita um ficheiro com `expires` até 10 minutos, o máximo que o mod escreve.

**Integridade da aprovação: registo e ficheiro.** Ao decidir, o mod grava primeiro a decisão no átomo `approvals` da sessão (`id`, nível, `scope`, `expires`, `used`) e só depois escreve `approvals/<id>`. Antes de cada comando Bash chegar ao approval-gate, o mod calcula o id que o gate lhe vai dar (o mesmo sha256) e, se `approvals/<id>` existir, exige um registo que bata: mesmo id e nível, por expirar e, em `Só esta`, por usar (fica gasto nesse momento; o gate apaga o ficheiro quando o aceita). Sem registo, o ficheiro é apagado e o comando recusado com `aprovação não reconhecida: o ficheiro não foi criado pelo diálogo do prumo-guard`; com um registo expirado ou já gasto, o mesmo, com `aprovação expirada ou já usada`. Um ficheiro escrito pelo agente (por exemplo por um symlink para `~/.prumo` criado com um caminho relativo) deixa de valer enquanto o mod estiver ativo. Se a verificação falhar antes de o comando seguir, o `.catch` recusa-o.

O comando que o painel mostra nunca esconde a cauda: acima dos 400 caracteres mostra-se o início **e** o fim, com o meio marcado como omitido e a contagem total, e a aprovação cobre sempre o comando inteiro (o id é do comando todo).

Depois de o comando correr, o mod varre um `approvals/<id>` que tenha surgido sem registo humano na janela entre a sua verificação e a leitura do approval-gate (que corre noutro processo): apaga-o para não autorizar o comando seguinte e avisa o modelo. A verificação de cada comando já apaga um ficheiro sem registo, por isso um forjado não persiste além de um comando.

Riscos residuais (BACKLOG B12): sem o prumo-guard instalado, o approval-gate sozinho continua a confiar no ficheiro (até 10 minutos); o `self-guard` do prumo-base continua best effort no Bash para escritas por caminho relativo depois de um `cd` e para um symlink para `~/.prumo` criado sem a literal `.prumo`; o registo é da sessão, por isso uma aprovação dada noutra sessão do Claude Code para o mesmo comando não serve nesta (o ficheiro é apagado); e a janela de **um único comando** entre a verificação do mod e a leitura do gate noutro processo não fica fechada — a barreira efetiva para esse comando é o prompt de permissão do Bash.

### Redação de segredos e PII

Antes de o conteúdo chegar ao modelo, os valores sensíveis são trocados por `[prumo:CLASSE]`. Aplica-se a resultados de ferramentas, mensagens de ferramentas, anexos, contexto de hooks e entregas (`session.append`) e ao texto que a pessoa escreve (`prompt.submit`, desligável com `redact.prompt`).

- Segredos (sempre): chave privada, JWT, token do Vault, chave AWS, token GitHub, token Slack, `Bearer`, pares `password/secret/token/api_key=valor`, credenciais em URL.
- PII (ligada por omissão, mas não em `Read`, `Grep`, `Glob` e `NotebookRead` salvo `redact.readPii`): email, IBAN PT, cartão de cidadão, NIF (com validação do dígito de controlo) e telefone PT.
- IPs internos (10.x, 172.16-31.x, 192.168.x): só com `redact.internalIps`.
- Padrões próprios em `redact.json` (ver abaixo).
- Guarda contra corrupção: um `Write`, `Edit` ou `MultiEdit` que traga marcadores `[prumo:...]` para um ficheiro existente e apagaria os valores reais é recusado. Os ficheiros do próprio prumo-guard estão isentos.
- Se a redação falhar, o resultado é retido em vez de passar em claro.

Estado: `/prumo-guard-redact on|off` (só pela pessoa) liga ou desliga durante a sessão.

### Painel do loop

Acima do prompt, enquanto houver loop do ralph, subagentes, fase, testes ou pausa: iteração do ralph (`.claude/ralph-loop.local.md`), fase, percentagem de contexto, custo em USD, limites de taxa, subagentes ativos com a duração e o último resumo de testes (passam/falham). A ferramenta `loop_phase` deixa o modelo declarar a fase (`plano`, `implementação`, `testes`, `revisão`, `outro`).

### Travão do loop

Põe o loop em pausa (estado, aviso, notificação) e anula o re-prompt do ralph no `Stop` quando:

- o custo desde o início do loop atinge `brake.usdBudget` (USD);
- os tokens acumulados atingem `brake.tokenBudget` (0 desliga);
- a mesma chamada de ferramenta repete o mesmo resultado `brake.repeatLimit` vezes seguidas (0 desliga);
- o mesmo teste falha com a mesma assinatura `brake.repeatLimit` vezes seguidas;
- edições ao mesmo ficheiro se desfazem umas às outras 3 vezes.

A pausa não interrompe o turno em curso: só impede o ralph de lançar o seguinte. Acima de 120% de `brake.usdBudget` o mod corta também o turno em curso (`$.turn.abort`), uma vez por turno, mesmo que o loop já esteja em pausa. Declarar a fase com `loop_phase` não conta como repetição. Se a cadeia do `Stop` falhar, o veto em pausa aplica-se na mesma (`.catch`).

`/prumo-guard-resume` rearma o travão e recomeça a contagem; `/prumo-guard-stop` apaga o `.claude/ralph-loop.local.md` e termina o loop. Ambos só aceitam a tecla Enter da pessoa.

### Trilho CEF

Cada chamada de ferramenta gera uma linha CEF (veredicto `allow`, `deny`, `blocked` ou `withheld`, hook que decidiu, hash do input, iteração do loop) escrita em lotes a cada 5 s em `~/.prumo/log/cef.log` e, se `PRUMO_WAZUH_HOST` (ou `WAZUH_HOST`) estiver definido, enviada por UDP (porta `WAZUH_PORT`, 514 por omissão). Desliga-se com `cef.enabled: false`. Enquanto o trilho está ativo o mod escreve `~/.prumo/run/cef-mod.<sessão>`, e o `post-tool-cef-wazuh.sh` do prumo-secops sai cedo para não duplicar o registo. Depois de um `/clear` ou de um resume o processo continua com outro id: o mod passa o marker e as linhas para o id novo na chamada seguinte. O despachante é o primeiro hook registado, por isso as recusas do próprio prumo-guard (guarda de marcadores, `run_with_secret`) também entram no trilho, como `deny`. No fim da sessão o mod espera pelo lote em escrita antes de tirar o marker.

### run_with_secret

**Desligado por omissão.** Só a pessoa o liga, com `secretExec.enabled: true` no `guard.json`; até lá a ferramenta não é registada e uma chamada é recusada.

Ferramenta `mcp__prumo-guard__run_with_secret`: corre um comando com segredos do Vault injetados como variáveis de ambiente; o mod não põe o valor na conversa. Entrada: `argv` (comando já partido, sem shell), `secrets` (`NOME_DA_VARIAVEL` → `caminho/kv#campo`) e `cwd` opcional (por omissão, o da sessão).

**O controlo é a aprovação humana de cada chamada.** Cada chamada tem um id: sha256 de `run_with_secret`, uma quebra de linha e o JSON `{argv, secrets, cwd}` (o `argv` que corre, referências ordenadas por nome, `cwd` efetivo). Sem `~/.prumo/approvals/<id>` válido, o mod abre o painel `prumo · aprovação` com um pedido N2 e recusa; o painel mostra o `argv` que corre (com as opções acrescentadas abaixo) em JSON, as referências e o `cwd`, nunca os valores. A chamada exige o ficheiro **e** o registo que o diálogo gravou no átomo `approvals`; um ficheiro sem registo por gastar é apagado e a chamada recusada (`aprovação não reconhecida: ...`). **Cada aprovação serve uma só chamada**, também com `10 minutos`: quando a repetição exata corre, o registo fica gasto e o ficheiro é apagado. Um ficheiro expirado, de outro nível, com `expires` para lá de 10 minutos ou com outro `scope` é apagado e não serve. Uma chamada mais longa do que os 400 caracteres que o painel mostra é recusada. A aprovação vale também em modo `lab`, e o comando corre no `cwd` aprovado.

**O cliente corre sem a sua configuração.** `HOME`, `XDG_CONFIG_HOME` e `XDG_DATA_HOME` apontam para um diretório novo e vazio (`mktemp -d`, apagado no fim, também quando o cliente falha), e cada cliente leva as opções que desligam os ficheiros de configuração: `curl -q` como primeiro argumento, `psql -X` com `PSQLRC=/dev/null`, `mysql --no-defaults` como primeiro argumento, `gh` com `GH_CONFIG_DIR` dentro do diretório temporário. Um `~/.curlrc`, `~/.psqlrc`, `~/.my.cnf` ou configuração do `gh` escritos pelo agente já não mudam o que uma chamada aprovada faz (por exemplo, `variable = %TOKEN` com `expand-header` mandava o segredo em base64 num cabeçalho).

Um binário aprovado pode correr código com o segredo no ambiente (configuração do repositório, meta-comandos, plugins), e o que ele imprimir volta à conversa. O mascaramento troca o valor por `[SEGREDO:NOME]` na forma crua (com ou sem a quebra de linha final), na codificada em URL e em hex e base64; transformações arbitrárias (aos pedaços, invertido) passam — a barreira contra exfiltração codificada é o checkArgv, não o mascaramento. As recusas abaixo são defesa em profundidade e não substituem a aprovação.

- Allowlist por omissão: `psql`, `mysql`, `curl`, `gh`. O `secret-exec.json` pode alargá-la (decisão da pessoa).
- `git`, `docker`, `kubectl` e `mongosh` são recusados mesmo listados em `allow`, salvo `"allowRisky": true` no `secret-exec.json`: correm código a partir de configuração que o agente consegue escrever (`core.fsmonitor` no `.git/config` do `cwd`, `--eval`, plugins).
- Recusa shells e interpretadores (`bash`, `python`, `node`, `env`, `sudo`, ...) e caminhos em `argv[0]`.
- Recusa as formas conhecidas com que os clientes correm código, leem configuração de fora ou lêem o ambiente: no `psql` e no `mysql`, qualquer `\!` num argumento, `system`/`source` no início de uma instrução (também colados a `-e`/`--execute=` do mysql), `psql \getenv`, `psql -f` (também em cluster, `-qf`/`-Atf`/`-1f`), `\o |`, `\i`, `mysql source` e `--pager`; `curl -K`/`--config`, `--variable` e `--expand-*` (também abreviados como `--conf`/`--va`, e em cluster como `-aK`/`-sK`); `gh alias|extension` e `gh --jq`/`-q` com a builtin `env`/`$ENV`; e, com `allowRisky`, `git -c`, `--config-env`, `--exec-path`, `--upload-pack`, `ext::` e subcomandos como `config`, `rebase`, `submodule`, `docker run|exec|build|compose|cp` e `--config`, `kubectl exec|run|debug|attach|cp` e `--kubeconfig`. A deteção de cluster pára na primeira opção curta que leva valor, por isso `curl -HKey: v` não é confundido com `-K`.
- Recusa nomes de variável que mudam o que o processo carrega ou corre (`PATH`, `IFS`, `BASH_ENV`, `ENV`, `HOME`, `LD_*`, `DYLD_*`, `GIT_*`, `NODE_*`, `PRUMO_*`, ...), referências sem `caminho#campo`, e argumentos e `cwd` em `~/.prumo` ou nos `settings.json` do Claude Code.
- Corre os mesmos PreToolUse que um Bash atravessaria, com um payload sintético: `self-guard`, `secret-read` e `workspace` do prumo-base e `agent-readonly` do prumo-secops (com o tipo do subagente; um subagente de tipo desconhecido é recusado). Depois da aprovação da chamada passa pelo `approval-gate`, com a mesma verificação do registo para o ficheiro dele; se o gate pedir a sua aprovação (um comando N1–N3), abre um segundo pedido, e a aprovação da chamada só se gasta quando o comando corre.
- Todas as recusas e pedidos de aprovação voltam ao modelo como erro (e ao trilho CEF como `deny`), e o comando não corre.
- Lê cada campo com o `vault-read-field.sh` do prumo-base (prumo-base 1.0.0 ou superior).

### Agentes escondidos

`agents.hidden` retira agentes da oferta ao modelo (ver secção abaixo).

### Idade das memórias

Os resultados do `mempalace_search` ganham uma linha `[prumo-guard] idade das memórias: #1 há N dias ...`, com `(antigo: confirmar antes de usar)` acima de `mempalace.staleDays` dias.

### friday-state

Writer do `friday-state` no processo, desligado por omissão (ver secção abaixo).

## Comandos

| Comando | O que faz | Só pela pessoa |
|---|---|---|
| `/prumo-guard` | Estado: modo, redação (e valores redigidos), aviso de `redact.json` inválido, orçamento, repetição, caminho do `guard.json` | não |
| `/prumo-guard-mode prod\|dev\|lab` | Muda o modo operacional (`~/.prumo/mode`; `lab` escreve também o marker `lab-mode`) | sim |
| `/prumo-guard-redact on\|off` | Liga ou desliga a redação nesta sessão | sim |
| `/prumo-guard-approvals` | Abre o painel de aprovações pendentes | não |
| `/prumo-guard-resume` | Rearma o travão | sim |
| `/prumo-guard-stop` | Termina o loop do ralph | sim |
| `/prumo-guard-agents [hide\|show <agente>]` | Lista ou altera os agentes escondidos | só para alterar |

"Só pela pessoa" quer dizer que o comando só atua se vier do compositor (tecla Enter); chamado pelo modelo devolve um aviso e não faz nada.

## Configuração

### `~/.prumo/guard.json`

Caminho: `$PRUMO_HOME/guard.json` (`~/.prumo/guard.json` por omissão). Cada secção funde-se com os defaults; ficheiro ausente ou JSON inválido usa os defaults.

| Campo | Default | Efeito |
|---|---|---|
| `redact.enabled` | `true` | Redação ligada ao arrancar a sessão |
| `redact.prompt` | `true` | Redige também o que a pessoa escreve |
| `redact.readPii` | `false` | Aplica PII a resultados de `Read`, `Grep`, `Glob` |
| `redact.internalIps` | `false` | Redige IPs privados |
| `brake.usdBudget` | `20` | Orçamento em USD por loop (0 desliga) |
| `brake.tokenBudget` | `0` | Orçamento de tokens (0 desliga) |
| `brake.repeatLimit` | `4` | Repetições seguidas que acionam o travão (0 desliga) |
| `workspace.extraRoots` | `[]` | Raízes extra de escrita; lidas pelo hook `workspace` do prumo-base, não pelo mod |
| `friday.enabled` | `false` | Writer do friday-state |
| `agents.hidden` | `[]` | Agentes escondidos do modelo |
| `mempalace.staleDays` | `90` | Idade a partir da qual uma memória é marcada como antiga |
| `cef.enabled` | `true` | Trilho CEF |
| `secretExec.enabled` | `false` | Liga o `run_with_secret` (só com `true`) |

O `self-guard` do prumo-base bloqueia as escritas do agente neste ficheiro (no Bash, best effort: indirecções em vários passos escapam-lhe); quem o altera é a pessoa, ou `/prumo-guard-agents` pela pessoa.

### `~/.prumo/redact.json`

Padrões extra de redação:

```json
{ "patterns": [ { "name": "PROCESSO-INTERNO", "regex": "PI-\\d{6}", "flags": "g" } ] }
```

`name` só aceita `A-Z`, `0-9` e `-` e aparece como `[prumo:NOME]`; `flags` é opcional e o `g` é acrescentado se faltar. Um padrão inválido é ignorado e a pessoa recebe um aviso. Um ficheiro ilegível, com JSON inválido ou sem uma lista em `patterns` desliga todos os padrões da organização: a pessoa recebe o aviso `redact.json inválido — padrões da organização desligados`, que também aparece no `/prumo-guard`. As classes por omissão continuam ativas.

### `~/.prumo/secret-exec.json`

Configura o `run_with_secret` (que só corre com `secretExec.enabled: true` no `guard.json`); todos os campos são opcionais:

| Campo | Default |
|---|---|
| `allow` | `psql`, `mysql`, `curl`, `gh` (ficheiro ausente) |
| `allowRisky` | `false`; com `true`, `git`, `docker`, `kubectl` e `mongosh` listados em `allow` passam a correr |
| `readerPath` | `lib/vault-read-field.sh` da versão mais recente do prumo-base na cache |
| `gatePath` | `hooks/pre-tool-approval-gate.sh` da versão mais recente do prumo-secops na cache |

Ficheiro ilegível, JSON inválido, `allow` que não seja uma lista de nomes ou `allowRisky` que não seja `true`/`false`: o `run_with_secret` recusa tudo até a pessoa o corrigir (com um aviso), em vez de cair nos defaults.

## O que o `/prumo-mod-audit` mostra

`bash secops/lib/mod-audit.sh guard` conta hooks "gating" (que podem negar ou alterar) sem `.catch`: sem `.catch`, se o hook falhar o motor segue o caminho por omissão (deixa passar). Medido em 2026-10-14: 17 sem `.catch` e 5 com (`session.append` da redação, `tool.call` de `Write|Edit|MultiEdit`, `tool.call` do `run_with_secret`, `tool.call` do Bash da aprovação, que apaga e recusa um ficheiro de aprovação forjado, e `classic.Stop`, onde o travão anula o re-prompt do ralph em pausa).

Dos 17, 15 só observam ou acrescentam informação e a falha deles não abre nada: os 10 `classic.*` do friday-state, o despachante `tool.call`, `agent.spawn`, o `tool.call` do `loop_phase`, o `tool.call` do Bash do painel de testes e o `session.append` da idade das memórias. Os dois restantes **decidem e falham aberto**: o `prompt.submit` da redação (se falhar, o prompt segue sem redação) e o `agent.offer` (se falhar, o agente fica visível). Estão registados no BACKLOG.

## Estrutura

- `hooks/hooks.json` → `{ "modules": ["./register.tsx"] }`
- `hooks/register.tsx` → ponto de entrada; chama o `register<Nome>(on)` de cada funcionalidade e tem o único `session.start`, que espera pelas funções `start<Nome>($)`
- `hooks/observers.ts` → despachante: um só hook sem matcher por evento partilhado (`tool.call`, `turn.start`, `turn.complete`, `session.measure`, `session.end`, `agent.spawn`, `classic.Stop`), com a ordem friday, painel, travão, auditoria; registado antes de todos os outros, para ser o hook mais exterior
- `hooks/config.ts` → `loadConfig($)` lê `$PRUMO_HOME/guard.json` e funde com `DEFAULTS`
- `types/index.d.ts` → contrato de estado `PluginState['prumo-guard']`

## Desenvolvimento

```bash
claude plugin validate guard
claude plugin test guard
bash guard/smoke.sh
```

`guard/.claude-plugin/types/` é gerado pelo motor ao carregar o mod (ignorado pelo git e pelo `package.sh`).

## friday-state no processo

Desligado por omissão (`friday.enabled: false`). Passagem manual:

1. Pôr `"friday": { "enabled": true }` no `~/.prumo/guard.json` (ação humana).
2. Numa sessão nova, comparar as linhas do mod com as do hook para o mesmo `session_id` (o `friday-state.sh` continua ativo nesta fase, por isso as duas fontes escrevem no mesmo ficheiro e a comparação faz-se por evento).
3. Diferença conhecida: nas linhas `PreToolUse` do mod, `p` vem `null`.
4. Só depois de a FRIDAY aceitar as linhas do mod: remover as 12 entradas `friday-state.sh` do `~/.claude/settings.json`.

## Agentes escondidos do modelo

`agents.hidden` no `guard.json` (nomes completos `plugin:agente` ou só o nome) retira o agente da oferta ao modelo. O comando `/prumo-guard-agents [hide|show <agente>]` lista e altera a lista; só aceita a tecla Enter da pessoa.

Aviso: esconder um agente impede o modelo de o lançar mesmo quando um comando o pede. Por exemplo, o `/prumo-incident-spread` lança o `prumo-ir-saas-01`; se este estiver escondido, o lançamento falha.

# prumo-guard

Mod Claude Code (function hooks em TypeScript) · guardrails do kit prumo · v0.1.0

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

Dependência do contrato do approval-gate: o mod lê da mensagem de bloqueio a linha `[prumo-secops/approval-gate] Operação N<k> detectada:` e a linha `approval-id: <64 hex>`, e escreve o ficheiro que o gate lê. Isto exige o **prumo-secops 0.11.0 ou superior**. Sem ele o painel não abre e a aprovação continua a ser a do `PRUMO_APPROVE`.

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

`/prumo-guard-resume` rearma o travão e recomeça a contagem; `/prumo-guard-stop` apaga o `.claude/ralph-loop.local.md` e termina o loop. Ambos só aceitam a tecla Enter da pessoa.

### Trilho CEF

Cada chamada de ferramenta gera uma linha CEF (veredicto `allow`, `deny`, `blocked` ou `withheld`, hook que decidiu, hash do input, iteração do loop) escrita em lotes a cada 5 s em `~/.prumo/log/cef.log` e, se `PRUMO_WAZUH_HOST` (ou `WAZUH_HOST`) estiver definido, enviada por UDP (porta `WAZUH_PORT`, 514 por omissão). Desliga-se com `cef.enabled: false`. Enquanto o trilho está ativo o mod escreve `~/.prumo/run/cef-mod.<sessão>`, e o `post-tool-cef-wazuh.sh` do prumo-secops sai cedo para não duplicar o registo.

### run_with_secret

Ferramenta `mcp__prumo-guard__run_with_secret`: corre um comando com segredos do Vault injetados como variáveis de ambiente, sem o valor entrar na conversa. Entrada: `argv` (comando já partido, sem shell), `secrets` (`NOME_DA_VARIAVEL` → `caminho/kv#campo`) e `cwd` opcional. O output volta com os valores trocados por `[SEGREDO:NOME]` (inclui a forma sem espaço final e a codificada em URL).

- Recusa shells e interpretadores (`bash`, `python`, `node`, `env`, `sudo`, ...), caminhos em `argv[0]` e comandos fora da allowlist.
- Passa o comando pelo `approval-gate` do prumo-secops; se o gate pedir aprovação, abre o painel como na aprovação por comando.
- Lê cada campo com o `vault-read-field.sh` do prumo-base (0.14.0 ou superior).

### Agentes escondidos

`agents.hidden` retira agentes da oferta ao modelo (ver secção abaixo).

### Idade das memórias

Os resultados do `mempalace_search` ganham uma linha `[prumo-guard] idade das memórias: #1 há N dias ...`, com `(antigo: confirmar antes de usar)` acima de `mempalace.staleDays` dias.

### friday-state

Writer do `friday-state` no processo, desligado por omissão (ver secção abaixo).

## Comandos

| Comando | O que faz | Só pela pessoa |
|---|---|---|
| `/prumo-guard` | Estado: modo, redação (e valores redigidos), orçamento, repetição, caminho do `guard.json` | não |
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

O `self-guard` do prumo-base impede o agente de escrever este ficheiro; só a pessoa (ou `/prumo-guard-agents`, pela pessoa) o altera.

### `~/.prumo/redact.json`

Padrões extra de redação:

```json
{ "patterns": [ { "name": "PROCESSO-INTERNO", "regex": "PI-\\d{6}", "flags": "g" } ] }
```

`name` só aceita `A-Z`, `0-9` e `-` e aparece como `[prumo:NOME]`; `flags` é opcional e o `g` é acrescentado se faltar. Um padrão inválido é ignorado e a pessoa recebe um aviso.

### `~/.prumo/secret-exec.json`

Configura o `run_with_secret`; todos os campos são opcionais:

| Campo | Default |
|---|---|
| `allow` | `psql`, `mysql`, `curl`, `gh`, `git`, `docker`, `kubectl`, `redis-cli`, `mongosh` |
| `readerPath` | `lib/vault-read-field.sh` da versão mais recente do prumo-base na cache |
| `gatePath` | `hooks/pre-tool-approval-gate.sh` da versão mais recente do prumo-secops na cache |

## O que o `/prumo-mod-audit` mostra

`bash secops/lib/mod-audit.sh guard` conta hooks "gating" (que podem negar ou alterar) sem `.catch`: sem `.catch`, se o hook falhar o motor segue o caminho por omissão (deixa passar). Medido em 2026-10-14: 19 sem `.catch` e 3 com (`session.append` da redação, `tool.call` de `Write|Edit|MultiEdit` e `tool.call` do `run_with_secret`).

Dos 19, 17 só observam ou acrescentam informação e a falha deles não abre nada: os 10 `classic.*` do friday-state, `classic.Stop`, o despachante `tool.call`, `agent.spawn`, o `tool.call` do `loop_phase`, o `tool.call` do Bash do painel de testes, `tool.call` do Bash da aprovação e o `session.append` da idade das memórias. Os dois restantes **decidem e falham aberto**: o `prompt.submit` da redação (se falhar, o prompt segue sem redação) e o `agent.offer` (se falhar, o agente fica visível). Estão registados no BACKLOG.

## Estrutura

- `hooks/hooks.json` → `{ "modules": ["./register.tsx"] }`
- `hooks/register.tsx` → ponto de entrada; chama o `register<Nome>(on)` de cada funcionalidade e tem o único `session.start`, que espera pelas funções `start<Nome>($)`
- `hooks/observers.ts` → despachante: um só hook sem matcher por evento partilhado (`tool.call`, `turn.start`, `turn.complete`, `session.measure`, `session.end`, `agent.spawn`, `classic.Stop`), com a ordem friday, painel, travão, auditoria
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

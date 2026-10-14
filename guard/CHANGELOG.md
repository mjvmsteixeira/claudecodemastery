# Changelog — prumo-guard

Formato: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versionamento: [SemVer](https://semver.org/spec/v2.0.0.html).

## v1.0.0 — 2026-10-14

**Primeira release do prumo-guard.** O `run_with_secret` está desligado por omissão e pede aprovação humana a cada chamada; o travão pausa em cada disparo e só corta o turno acima de 120% do orçamento em USD.

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
- `run_with_secret` pede aprovação humana a cada chamada: id = sha256 de `run_with_secret\n` + JSON `{argv, secrets ordenados por nome, cwd}`, ficheiro `approvals/<id>` (N2; `once` apagado quando corre, `ttl` até 10 minutos, o resto apagado e recusado). O painel mostra o `argv` inteiro, as referências e o `cwd`, nunca os valores; uma chamada que não caiba nos 400 caracteres do painel é recusada. O comando corre no `cwd` aprovado, e o approval-gate continua a correr depois.
- Allowlist por omissão reduzida a `psql`, `mysql`, `curl`, `gh`. `git`, `docker`, `kubectl` e `mongosh` recusam mesmo listados, salvo `"allowRisky": true` no `secret-exec.json`. No `psql` e no `mysql`, qualquer `\!` num argumento e `system` no início de uma instrução recusam.
- O controlo é a aprovação humana de cada chamada: um binário aprovado pode correr código com o segredo no ambiente, e o mascaramento cobre só a forma crua e a codificada em URL. Antes, `git status` num repositório com `core.fsmonitor`, `mongosh --eval` ou `psql \!` corriam código com o segredo e devolviam-no codificado, sem aprovação.

### Notes
- API de mods em early access.
- `/prumo-mod-audit` mostra 18 hooks sem `.catch` e 4 com; dois dos 18 decidem e falham abertos (`prompt.submit` e `agent.offer`). Ver README.

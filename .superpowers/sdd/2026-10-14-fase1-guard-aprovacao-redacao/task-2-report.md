# Task 2 — relatório

Commit: ver `git log -1` em feat/prumo-guard (`feat(guard): diálogo de aprovação por comando sobre o approval-gate`), não pushed.

## Ficheiros
Criados: guard/hooks/approval-parse.ts, guard/hooks/approval.tsx, guard/tests/approval-parse.test.ts, guard/tests/approval.test.ts. Alterado: guard/hooks/register.tsx (import + `registerApproval(on)` antes do `session.start`).

## Evidência
- RED: `claude plugin test guard` antes da implementação -> parser: "cannot import ../hooks/approval-parse.ts"; fluxo: 3 fail ("no implementation for ui.render" / context vazio); 6 pass (Task 1), 4 fail.
- GREEN: `claude plugin test guard` -> 12 pass, 0 fail (3 parser + 3 aprovação + 6 config).
- `claude plugin validate guard` -> "Validation passed", 0 avisos. Linha informativa: "gating hook without .catch: tool.call{tool=Bash}". Este hook não nega nada (devolve o resultado do core ou o enriquece com `context`), por isso dispensa `.catch`.
- tsc 5.6.3 (tsconfig temporário no scratchpad) exit 0. `./scripts/validate.sh` 0 erro(s)/0 aviso(s). `bash guard/smoke.sh` verde.

## Adaptações à API real
1. `ToolCallResult.context` é `readonly string[]`: o hook devolve `context: [MODEL_NOTE]`.
2. A `$` do teste (`Engine`) não tem o noun `state`: `$.state.get` não existe. O estado `pending` é observado com `on('state.set', { plugin, key }, (_$, e, next) => ...)` a registar `e.value` e a chamar `next(e)` (o fundo do kit guarda o valor). As asserções (id/level; vazio após "once"; 1 restante após "deny") mantêm-se.
3. Stubs de teste no formato `OpEventResult`: `clock.now -> { value: 1_000_000 }`, `ui.open -> { value: { isPlaced: true } }`, `ui.notify -> { value: { isSent: true, channel: 'terminal_bell' } }`, `ui.close`/`fs.write -> { value: undefined }`; `mock.env(on, { HOME: '/h' })` em vez de `on('env.get')`.
4. `session.append`: o handler do teste tem de chamar `next(e)` (fundo do kit grava a linha); regista o texto para asserção. Adicionei asserções extra (expires=1300 com clock 1_000_000 ms, mensagem "aprovado"/"negou", nenhum write no deny).
5. `$.ui.mount` exige `props` completos de `Pane`: `{ title, isFocused, bodyColumns, placement, scroll: { offset, bodyRows }, view: {} }` em vez de `{}`.
6. "dois pendentes": o painel mostra o último pedido, logo "deny" decide o mais recente (cccc...) e fica o primeiro (bbbb...); o teste afirma isso.

## Concerns
- Estado só observável via `state.set` nos testes; o cap `.slice(-20)` não tem teste.
- `requestApproval` exportado para a Fase 3 mas só exercitado via o hook `tool.call`.

## Fix round 1 (T2-review)

Só testes alterados (guard/tests/approval.test.ts); sem mudança de comportamento.
- Novo teste 'ttl': scope=ttl, expires=1000+600, mensagem 'durante 10 minutos'.
- Três testes negativos: resultado normal com texto de recusa, erro de outro hook, recusa sem id de 64 hex; nenhum chama state.set 'pending' nem ui.open.
- Stubs de ui.open/ui.notify/ui.close registam argumentos (`ui.notify` usa `text`, não `message`); asserções: open com 'prumo-guard-approval', notify com nível, close após o último pendente e não com um ainda pendente.
- Mutações verificadas (cada uma dá 1 fail): TTL_MS, scope fixo, isError, ui.open, ui.close, ui.notify.

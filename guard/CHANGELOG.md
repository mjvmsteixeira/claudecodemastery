# Changelog — prumo-guard

Formato: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versionamento: [SemVer](https://semver.org/spec/v2.0.0.html).

## v1.0.0 — 2026-10-14

**Primeira release do prumo-guard.** Inclui tudo o que estava na 0.1.0 (abaixo).

**Aviso: a API de mods (function hooks) do Claude Code é early access e pode mudar entre versões do Claude Code.** Nomes de eventos, regras do validador e comportamento dos tiers podem exigir ajustes neste mod.

## v0.1.0 — 2026-10-14

### Added
- Scaffold do mod: manifesto, `hooks.json` com `modules`, `register.tsx` com um só `session.start`, configuração (`guard.json`) com defaults, contrato de estado `prumo-guard`, testes e smoke.
- Aprovação humana por comando: painel `prumo · aprovação` sobre o contrato do `approval-gate` do prumo-secops 0.11.0 (`approvals/<id>`, 5 minutos ou 10 minutos).
- Redação de segredos e PII em `session.append` e `prompt.submit` (NIF, CC e IBAN com validação), padrões próprios em `redact.json` e guarda contra marcadores `[prumo:...]` em escritas.
- Painel do loop (iteração do ralph, fase, contexto, custo, subagentes, testes) e ferramenta `loop_phase`.
- Travão do loop: orçamento USD e de tokens, repetição de chamadas, de falhas de teste e de edições desfeitas, veto ao re-prompt do ralph; `/prumo-guard-resume` e `/prumo-guard-stop`.
- Trilho CEF com veredicto por chamada, em lote, para `~/.prumo/log/cef.log` e UDP; o secops não duplica quando o mod está ativo.
- `run_with_secret`: comandos com segredos do Vault por variável de ambiente, output mascarado, allowlist em `secret-exec.json`.
- Agentes escondidos do modelo (`agents.hidden`) e `/prumo-guard-agents`.
- Idade das memórias nos resultados do `mempalace_search`.
- Writer do `friday-state` no processo, desligado por omissão (`friday.enabled`).
- Comandos humanos `/prumo-guard`, `/prumo-guard-mode`, `/prumo-guard-redact`, `/prumo-guard-approvals` e entrada na linha de estado.
- Instalação gerida em clientes (`docs/instalacao-gerida.md`).

### Notes
- API de mods em early access.
- `/prumo-mod-audit` mostra 19 hooks sem `.catch` e 3 com; dois dos 19 decidem e falham abertos (`prompt.submit` e `agent.offer`). Ver README.

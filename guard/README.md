# prumo-guard

Mod Claude Code (function hooks em TypeScript) · guardrails do kit prumo · v0.1.0

Aprovação humana por comando, redação de segredos e PII antes do modelo, painel do loop autónomo e travão de orçamento. Recomenda `prumo-base` e `prumo-secops` (usa os seus hooks como classificadores).

## Instalação

```
/plugin install prumo-guard@prumo
```

Equivalente na shell:

```bash
claude plugin install prumo-guard@prumo
```

## Estrutura

- `hooks/hooks.json` → `{ "modules": ["./register.tsx"] }`
- `hooks/register.tsx` → ponto de entrada; cada funcionalidade exporta `register<Nome>(on)` e é chamada daqui
- `hooks/config.ts` → `loadConfig($)` lê `$PRUMO_HOME/guard.json` (default `~/.prumo/guard.json`) e funde com `DEFAULTS`
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

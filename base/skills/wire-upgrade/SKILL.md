---
name: wire-upgrade
description: Verifica versões dos plugins Wire (base/secops/devkit) — compara versão instalada com a remota no marketplace jump2new. Dispara em "há updates dos plugins wire?", "actualiza os plugins", "wire upgrade", "que versão tenho?", "preciso de actualizar?". Read-only — não auto-instala, emite linhas /plugin install para colar.
---

# wire-upgrade

Skill-trigger que delega para `/wire-upgrade`. Verifica se há versões mais recentes dos plugins Wire no marketplace remoto.

## Trigger

- `"há updates?"`, `"updates wire?"`, `"actualiza os plugins"`, `"wire upgrade"`
- `"qual a minha versão?"`, `"versão wire-base?"`, `"estou actualizado?"`
- `"que versão está disponível?"`, `"sai já v0.2.0?"`

## Acção

Invocar `/wire-upgrade`. O command:

1. Detecta versões instaladas em `~/.claude/plugins/cache/*/wire-*/*/`.
2. Fetch das versões remotas via raw GitHub (`raw.githubusercontent.com/mjvmsteixeira/claudecodemastery/main/<plugin>/.claude-plugin/plugin.json`).
3. Compara via `sort -V` (semver-aware).
4. Para cada plugin com update disponível, emite a linha `/plugin install <plugin>@jump2new` para o utilizador colar.
5. Se tudo estiver up to date, reporta-o e sugere `/wire-doctor` como próxima sanity check.

Read-only — não executa o install (Claude Code não permite `/plugin install` a partir de slash commands).

## Fronteira

- Não auto-instala. O utilizador é quem cola as linhas.
- Se a raw GitHub estiver inacessível (offline, VPN), reporta-o em vez de assumir tudo desactualizado.
- Para uma sessão num laptop totalmente novo (zero plugins instalados), usar `/wire-onboard` primeiro.
- Não substitui ler o `CHANGELOG.md` antes de actualizar — `/wire-upgrade` aponta para os caminhos dos changelogs.

---
name: prumo-upgrade
description: Verifica versões dos plugins prumo (base/secops/devkit) — compara versão instalada com a remota no marketplace prumo. Dispara em "há updates dos plugins prumo?", "actualiza os plugins", "prumo upgrade", "que versão tenho?", "preciso de actualizar?". Read-only — não auto-instala, emite linhas /plugin install para colar.
---

# prumo-upgrade

Skill-trigger que delega para `/prumo-upgrade`. Verifica se há versões mais recentes dos plugins prumo no marketplace remoto.

## Trigger

- `"há updates?"`, `"updates prumo?"`, `"actualiza os plugins"`, `"prumo upgrade"`
- `"qual a minha versão?"`, `"versão prumo-base?"`, `"estou actualizado?"`
- `"que versão está disponível?"`, `"sai já v0.2.0?"`

## Acção

Invocar `/prumo-upgrade`. O command:

1. Detecta versões instaladas em `~/.claude/plugins/cache/*/prumo-*/*/`.
2. Fetch das versões remotas via raw GitHub (`raw.githubusercontent.com/mjvmsteixeira/claudecodemastery/main/<plugin>/.claude-plugin/plugin.json`).
3. Compara via `sort -V` (semver-aware).
4. Para cada plugin com update disponível, emite a linha `/plugin install <plugin>@prumo` para o utilizador colar.
5. Se tudo estiver up to date, reporta-o e sugere `/prumo-doctor` como próxima sanity check.

Read-only — não executa o install (Claude Code não permite `/plugin install` a partir de slash commands).

## Fronteira

- Não auto-instala. O utilizador é quem cola as linhas.
- Se a raw GitHub estiver inacessível (offline, VPN), reporta-o em vez de assumir tudo desactualizado.
- Para uma sessão num laptop totalmente novo (zero plugins instalados), usar `/prumo-onboard` primeiro.
- Não substitui ler o `CHANGELOG.md` antes de actualizar — `/prumo-upgrade` aponta para os caminhos dos changelogs.

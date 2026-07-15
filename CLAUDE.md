# CLAUDE.md

Guidance para Claude Code ao trabalhar neste repositório.

## O que é este repositório

Um **marketplace privado de plugins Claude Code** (`prumo`), não uma aplicação. Ships **quatro** plugins escritos em Markdown + Bash — não há compilador, test runner nem manifest de dependências. "Build" = zipar um directório num `.plugin`; "correr" = instalar no Claude Code e exercitar commands/skills/hooks.

```
.claude-plugin/marketplace.json   ← declaração do marketplace (lista os plugins)
base/     ← prumo-base   · foundacional (instalar PRIMEIRO)
secops/   ← prumo-secops · SecOps SaaS (recomenda prumo-base)
devkit/   ← prumo-devkit · toolkit de auditoria (recomenda prumo-base)
design/   ← prumo-design · orquestrador de design (standalone)
```

## Relações entre plugins

**`prumo-base`** é foundacional: libs partilhadas em `lib/` (`prumo-common.sh` — mode/scope/log/backup/fail-or-warn; `vault-env.sh` — função `V()` para Vault nativo ou Docker), vault-toolkit (5 `/vault-*` + bootstraps), setup/diagnóstico (`/prumo-onboard`, `/prumo-doctor`, `/prumo-mode`, `/prumo-smoke`, `/prumo-style`, `/prumo-upgrade`, `/prumo-context-pack`) e hooks SessionStart (auto-unseal) + PreToolUse (audit-guard).

**`prumo-secops`** recomenda prumo-base (soft). `secops/hooks/_lib.sh` procura `*/prumo-base/*/lib/prumo-common.sh` no cache; sem ele usa stubs fail-closed em prod. 6 agents `prumo-*-01`, 10 commands, 6 skills, cadeia PreToolUse/PostToolUse/Stop.

**`prumo-devkit`** recomenda prumo-base (soft) — só `/ngrok-expose` o consome (authtoken via Vault). Audits read-only por defeito; apply opt-in com gates.

**`prumo-design`** é standalone quanto a outros plugins prumo; depende da stack nativa de design do Claude (frontend-design + Artifact + design-sync).

## Dois CLAUDE.md de runtime — não confundir com este

`secops/CLAUDE.md` e `devkit/CLAUDE.md` são conteúdo *shipped dentro dos plugins* (contexto de runtime para quem os usa). Editar como conteúdo de plugin, não como guidance do repo. O `secops/CLAUDE.md` descreve o ambiente de produção da empresa Wire (SaaS eGovernment) — os tokens `wire*` aí são domínio real, **nunca** renomear para prumo.

## Convenções

- **Modo operacional** (`PRUMO_OPERATING_MODE` ou `~/.prumo/mode`; default `prod`): `prod` fail-closed (`exit 2`), `dev` warn-only, `lab` bypass (requer `~/.prumo/lab-mode`). Gerir com `/prumo-mode`.
- Hooks devem bloquear via `prumo_fail_or_warn`/`prumo_require` (respeitam o modo), excepto negação humana explícita no approval-gate (fail-closed intencional).
- **Fail-closed com allowlist de diagnóstico** no `pre-tool-vault-ttl.sh` — preservar sempre (remover cria diagnose-deadlock).
- **Vault é o broker de credenciais** — nunca introduzir segredos estáticos ou `.env` em conteúdo de plugin.
- **`recommends` é convenção nossa** — o Claude Code não a consome; os hooks `check-recommends.sh` lêem-na manualmente.
- Hooks novos: `chmod +x hooks/*.sh`.

## Package & validação

```bash
./scripts/package.sh <plugin|all>   # → /tmp/<nome>.plugin
./scripts/validate.sh               # checks estáticos; correr antes de release
```

## .gitignore em whitelist-mode

Ignora tudo (`/*`) e re-inclui só o whitelisted. **Ficheiro novo na raiz não é trackado** sem entrada `!`. `docs/` fica intencionalmente fora do git (specs/planos locais).

## Naming

`marketplace.json` é a source of truth: marketplace `prumo`, plugins `prumo-base`, `prumo-secops`, `prumo-devkit`, `prumo-design`. Install: `/plugin install prumo-<x>@prumo`. Rebranding wire→prumo em 2026-07-06 (ver CHANGELOG.md).

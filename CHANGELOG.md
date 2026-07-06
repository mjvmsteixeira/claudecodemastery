# Changelog — marketplace prumo

Histórico agregado do marketplace. Cada plugin mantém o seu `CHANGELOG.md` próprio com detalhe completo (`base/`, `secops/`, `devkit/`, `craft/`); este ficheiro regista os marcos ao nível do ecossistema — releases coordenadas, plugins novos, mudanças de branding e de infra do repo.

Estado actual: **prumo-base 0.5.0 · prumo-secops 0.5.0 · prumo-devkit 0.4.0 · prumo-craft 0.2.0**

## 2026-07-06

- **Rebranding total: `jump2new` + `wire-*` → `prumo`.** Marketplace renomeado para `prumo`; plugins passam a `prumo-base` 0.5.0, `prumo-secops` 0.5.0, `prumo-devkit` 0.4.0, `prumo-craft` 0.2.0. Comandos `/wire-*` → `/prumo-*`, env `WIRE_*` → `PRUMO_*`, estado `~/.wire/` → `~/.prumo/` (migração automática), lib `wire-common.sh` → `prumo-common.sh`. O domínio Wire de produção (produtos, hostnames, AppRoles, Wazuh/Zabbix) fica intacto. Owner passa a mjvmst. Upgrade exige uninstall dos plugins `wire-*@jump2new` e install dos `prumo-*@prumo`.
- Correcções da deep analysis de 2026-07-06 absorvidas: descrição do marketplace com os 4 plugins, READMEs alinhados com manifests, formato de changelog unificado, `CLAUDE.md` de dev guidance criado dentro do repo, tags git por plugin.

## 2026-05-26

- **wire-base v0.4.0** — `/wire-style`: bloco de output conciso ("talk-normal") injectável/removível em CLAUDE.md, idempotente e versionado.
- **wire-devkit v0.3.0** — skill `chrome-live`: sessão Chrome real via CDP, gateada; documentada a limitação Chrome 136+ e a proveniência do `cdp.mjs`.
- Validação: shellcheck estendido a `skills/**/scripts/*.sh`; supressão de falsos-positivos em hooks/lib.

## 2026-05-19

- **Novo plugin: wire-craft v0.1.0** — tooling generativo (`html-plan`, HTML anti-AI-slop em 2 fases). Standalone, zero deps externas. O marketplace passa a ter 4 plugins.
- **wire-secops v0.4.0 "Honest"** — cadeia de hooks tornada funcional (approval-gate via `WIRE_APPROVE`, pii-redact fail-closed, hooks a parsear JSON do stdin em vez de texto cru) + 20 templates `references/` nas skills. Upgrade a partir de v0.2.x/v0.3.0 exige `uninstall` antes de `install`.
- **wire-base v0.3.0 / wire-secops v0.3.0** — bootstraps Vault: `/wire-vault-bootstrap` + `/wire-vault-kv-migrate` (base) e `/wire-secops-bootstrap` (secops: policies + AppRoles + Keychain numa corrida).

## 2026-05-15

- **wire-devkit v0.2.2 + wire-base v0.2.1** — audits read-only por defeito; hook PreToolUse `audit-guard` no base dá defense-in-depth ao devkit.
- **v0.2.0 (base)** — `/wire-upgrade`, `/wire-vault-policy`, `/wire-smoke`; packaging unificado em `scripts/package.sh`; CI GitHub Actions (`validate.sh` + package dry-run).
- Comandos de setup/diagnóstico no base: `/wire-onboard`, `/wire-doctor`, `/wire-mode`, `/wire-context-pack`; skill `vault-toolkit`; `CHANGELOG.md` por plugin.
- Hooks do secops passam a consumir `wire-common.sh` do wire-base (com fallback fail-closed); `recommends` + hooks SessionStart `check-recommends` em secops/devkit.
- **Rebranding: `wiremaze` → `wire`** em todo o repo; licença dos plugins fixada em "Proprietary - Uso interno jump2new".
- Initial commit do marketplace **jump2new** (wire-base, wire-secops, wire-devkit a v0.1.0).

# Changelog — marketplace prumo

Histórico agregado do marketplace. Cada plugin mantém o seu `CHANGELOG.md` próprio com detalhe completo (`base/`, `secops/`, `devkit/`, `craft/`); este ficheiro regista os marcos ao nível do ecossistema — releases coordenadas, plugins novos, mudanças de branding e de infra do repo.

Estado actual: **prumo-base 0.5.0 · prumo-secops 0.5.0 · prumo-devkit 0.5.1 · prumo-craft 0.5.0** (tag `v0.5.1`)

## 2026-07-12 · `v0.5.1` · prumo-devkit 0.5.1

**security-scan v2.** Eleva a skill `security-scan` do devkit de checklist-grep para motor com análise AST (Semgrep primário + fallback grep), verificação adversarial de findings (Passo 3c), secrets via `gitleaks`/`trufflehog --only-verified` + entropia, deteção de tooling (Passo 0, soft-deps), 4 references novas auto-load por stack (CI/CD supply-chain, container, OWASP API/LLM Top 10), mapeamento CWE e um eval-harness determinístico próprio (fixtures→`expected.jsonl`) ligado ao `validate.sh` com skip honesto. Disciplina read-only/safe-apply intacta. Detalhe em `devkit/CHANGELOG.md`.

## 2026-07-07 · release coordenado `v0.5.0`

Versão unificada dos 4 plugins em **0.5.0** com uma tag única de marketplace `v0.5.0`. Fecha o ciclo de features AI (Fases 01-04) e uma ronda de remediação de segurança sobre os hooks.

- **Features AI (branch `eval-harness`):** eval-harness de regressão dos hooks (corpus rotulado + runner + matriz de confusão + selftest), guardrail semântico via Ollama local no `second-opinion` (zona-cinzenta, anti-injeção, veredicto JSON), telemetria dos guardrails (`/prumo-telemetry` + doctor), e loop de feedback nos audits do devkit (reconciliador determinístico com fingerprint semântico + accept/auto-promoção).
- **Remediação de segurança (full-audit):** corrigida uma família de bypass nos classificadores dos hooks — a classe de fronteira de palavra não cobria `(`, backtick, newline e `&`. Fixes: **CRÍTICO** `vault-ttl` (newline/`&` contornavam a exigência de `VAULT_TOKEN`), **alto** `audit-guard` (`$()`/subshell/backtick + `curl|bash`) e `approval-gate` (N1/N2/N3), `second-opinion`, sanitização no `audit-accept`, integridade de source no `cdp-guard`, e um falso-verde no próprio `validate.sh`. +10 casos de regressão no corpus (70/70 verde).
- **Documentação/consistência:** 4 templates de skill em falta criados; prefixos de log uniformizados; cobertura dos `smoke.sh` alinhada; descrições do marketplace com `chrome-live`.

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

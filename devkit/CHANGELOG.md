# Changelog — wire-devkit

Formato: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versionamento: [SemVer](https://semver.org/spec/v2.0.0.html).

## [0.3.0] — 2026-05-26

Iteração **live-browser**: traz inspecção/interacção da sessão Chrome real (autenticada) ao devkit, gateada pelo modelo de segurança Wire, e liga-a às audits.

### Added

- **Skill `chrome-live` (+ command `/chrome-live`)** — conduz o Chrome já aberto via Chrome DevTools Protocol (WebSocket, sem extensão nem Puppeteer). Motor: `cdp.mjs` **vendorado** do [chrome-cdp-skill](https://github.com/pasky/chrome-cdp-skill) (MIT © pasky; licença preservada em `skills/chrome-live/scripts/NOTICE`). Verbos: `list shot snap html net` (read-only) · `eval evalraw click clickxy type nav open loadall` (active) · `stop`.
- **`skills/chrome-live/scripts/cdp-guard.sh`** — wrapper de gating obrigatório (nunca chamar `node cdp.mjs` directo). Classifica verbos read-only vs active; verbos activos (executam JS / mudam estado de página autenticada) são **fail-closed em `prod`** (exigem `WIRE_CHROME_LIVE_ACTIVE=1`), bloqueados em **contexto de audit** sem `WIRE_AUDIT_APPLY=1`, e warn-only em `dev`. Preflight Node 22+ (`exit 69`). Sourceia `wire-common.sh` do `wire-base` se presente; fallback fail-closed se ausente. Invocações audit-tracked via `wire_log`.
- **`skills/chrome-live/references/verbs.md`** — referência de verbos + receitas read-only para audits.
- **Integração `ux-audit` e `security-scan`** — nova etapa "3b. Verificação ao vivo (opcional)": detectam o `cdp.mjs` e, com uma tab aberta, enriquecem findings com o DOM renderizado real (ux: landmarks/headings/contraste; sec: cookies/HttpOnly, handlers inline, CSP meta, autocomplete). **Aditivo** — sem Chrome/tab, degradam para a análise estática habitual.
- **`smoke.sh`** — asserts de `chrome-live` (skill, command, scripts) + check Node 22+.

### Notes

- Única dependência **não-bash** do devkit: Node 22+ (built-in WebSocket). Assumido explicitamente.
- Requer o utilizador activar `chrome://inspect/#remote-debugging` (toggle + modal "Allow debugging" 1×/tab).
- `eval`/`evalraw` executam JS arbitrário numa página autenticada — daí o gating fail-closed em prod e o bloqueio em contexto de audit. Para uso desktop interactivo, o MCP `claude-in-chrome` continua preferível; o valor do `chrome-live` é headless/CI/remoto + auditabilidade.

## [0.2.2] — 2026-05-15

Iteração de **defense-in-depth + extensão a todas as audit skills + prevenção de regressão**.
Resolve os 9 gaps identificados no follow-up à v0.2.1 (auditoria do empty-shell wireSTUDIO).

### Added

- **`shared/safe-apply.md`** — fonte de verdade para os 3 gates universais que toda a skill que possa mutar ficheiros tem de executar antes de aplicar correcções:
  - **Gate 1 — modo operacional**: lê `WIRE_OPERATING_MODE` (ou `~/.wire/mode`); em `dev` degrada apply para report-only (em dev, código "morto" pode ser activado on-demand — a skill não tem competência para decidir).
  - **Gate 2 — sample/empty-shell detection**: marcadores canónicos no projecto (`.dev-shell`, `SAMPLE.md`, `.empty-shell`, `.audit-profile=dev-shell`), pistas no `CLAUDE.md` da raiz (`<!-- wire-audit: dev-shell -->`, `empty shell`, `sample app`, `dev only`, etc.), ou `WIRE_AUDIT_PROFILE`. Se positivo, degrada apply para report-only com aviso.
  - **Gate 3 — acções destrutivas pedem confirmação humana individual**: apagar/mover ficheiros, mexer em `.gitignore`/`.env*`/`config/initializers/`/`spec/`/`test/`/`filter_parameter_logging.rb`/`backtrace_silencers.rb`/workflows CI, drop/alter/truncate de tabelas, ou updates major de deps — diff antes/depois + prompt `[s/N/skip-all]` (default `N`).

### Changed

- **`full-audit/SKILL.md`** Fase 4 agora invoca explicitamente os gates de `safe-apply.md` antes de aplicar; se algum gate falhar, degrada para report-only com explicação clara. Removida a duplicação local da lógica de "modo dev / sample".
- **`security-scan/SKILL.md`** Correcções: `auto-fix-safe` deixa de incluir mutação de `.gitignore`/`.gitattributes`/`.env*` — esses passam pelo Gate 3 mesmo em modo "safe". Texto claro do que sobra como auto-fixable: updates de patch sem breaking changes e adição de headers de segurança em falta.
- **`code-quality/SKILL.md`**, **`infra-audit/SKILL.md`**, **`performance-audit/SKILL.md`**, **`ux-audit/SKILL.md`** — todas referenciam `shared/safe-apply.md` na sua secção "Correcções" e listam explicitamente os tipos de mutação que passam pelo Gate 3 (apagar imports/dead-code, editar `Dockerfile`/`*.tf`/playbooks, optimizações que mudam comportamento observável, copy/idioma/visual). Resposta default em prompts de correcção: `n`.
- **`scripts/validate.sh`** — nova secção que falha o build se qualquer `SKILL.md` ou `commands/*.md` tem no `description:` do frontmatter um anti-padrão de auto-fix (`sem perguntar|corrige TODOS|auto-?fix de tudo|automaticamente sem|without asking|without confirmation`). Previne a regressão que originou o incidente.
- **`devkit/CLAUDE.md`** — nova secção "Safety convention" para futuros contribuidores: documenta a regra read-only-por-defeito, a obrigação de referenciar `shared/safe-apply.md` em qualquer skill mutante, o check do validate.sh e a integração com o `wire-base` PreToolUse audit-guard.
- **`plugin.json` description** e **`marketplace.json` entry** comunicam agora "read-only por defeito" e a relação com o `wire-base` audit-guard.

### Depends on

- **`wire-base@jump2new ≥ 0.2.1`** (recomendado, não obrigatório) — para ganhar o PreToolUse audit-guard como segunda linha de defesa. Sem ele, a disciplina é só contractual (skills); com ele, é também enforced (hook bloqueia em runtime).

## [0.2.1] — 2026-05-15

### Fixed

- **`full-audit` deixa de auto-corrigir por defeito.** A description e o command anterior prometiam "fora do modo CI, corrige TODOS os issues automaticamente sem perguntar" — contrato perigoso que autorizava sub-agentes a apagar ficheiros, remover initializers/middleware e mexer em `.gitignore`/`filter_parameter_logging.rb` mesmo em ambientes de dev/empty-shell. Incidente real: auditoria num dev shell removeu código intencionalmente "morto" (activado on-demand em dev).
  - Novo default: **report-only**. Sem `--apply`, a skill gera só o relatório consolidado e nada toca em ficheiros.
  - Correcção opt-in via `--apply` (flag no command, parâmetro `apply` na skill). Mesmo com `apply`:
    - Cada sub-audit respeita os seus próprios safeguards (ex.: `security-scan` continua a exigir `--auto-fix-safe`).
    - Acções destrutivas (apagar/mover ficheiros, mexer em `.env`/secrets, remover initializer/middleware, alterar `.gitignore`) pedem confirmação humana individual — não são auto-classificáveis como "low-risk".
    - Em `WIRE_OPERATING_MODE=dev` ou em projectos marcados como sample/empty-shell (CLAUDE.md sinaliza ou `.dev-shell`/`SAMPLE.md` na raiz), `apply` degrada para report-only com aviso.
  - `--ci` continua a não corrigir nada e passa a ser explicitamente incompatível com `--apply`.
- **Description da skill `full-audit`** reescrita para reflectir o contrato real (read-only por defeito, apply opt-in) — o description é o que sub-agentes lêem antes de qualquer outra coisa, por isso a promessa tinha de ser corrigida na fonte e não só na metodologia.
- **Phase 2 (recolha) agora é estritamente read-only.** O orquestrador é instruído a prefixar cada Agent dispatch com "Modo de recolha pura — não aplicar correcções, não perguntar 'queres que corrija?'". Garante que sub-agentes que lêem a sua própria SKILL.md (ex.: `code-quality`) não decidem aplicar fixes "low-risk" durante a recolha — a correcção fica concentrada na Fase 4 e só com `--apply`.

### Notes

- As outras 5 skills (`security-scan`, `code-quality`, `infra-audit`, `performance-audit`, `ux-audit`) já eram read-only por defeito — ficam intactas.
- Migração para utilizadores: quem corria `/full-audit` à espera de auto-fix tem agora de adicionar `--apply` explicitamente. Recomendado fazer dry-run primeiro (sem flag) para confirmar o que seria aplicado.

## [0.2.0] — 2026-05-15

### Added

- **`smoke.sh`** — sanity check read-only chamado pelo `/wire-smoke` do `wire-base`. Testa: plugin.json válido, ficheiros `shared/*` presentes (scoring, ci-mode, report-format), 8 skills + 7 commands + 1 agent na árvore esperada, wire-base detectado na cache (para /ngrok-expose), ollama/qwen3-coder e ngrok CLI presentes. Funciona em cache (post-install) e source tree (dev/CI).

## [0.1.0] — 2026-05-15

Versão inicial do plugin no marketplace `jump2new`.

### Added

- **6 audit skills** no modelo B+C (brain `SKILL.md` + references com progressive disclosure + thin command wrapper):
  - `full-audit` — orquestrador paralelo (corre as outras 4-5 audits, consolida, scoring unificado, auto-fix fora de `--ci`). Integração MemPalace opcional.
  - `security-scan` — OWASP Top 10, secrets/credentials, IaC, dependências vulneráveis multi-stack. Absorve o antigo `/dep-audit`.
  - `infra-audit` — Docker, Kubernetes, systemd, reverse proxy, Ansible, Terraform, CI/CD.
  - `ux-audit` — WCAG 2.1 AA, 10 heurísticas de Nielsen, responsividade, design system.
  - `code-quality` — dead code, arquitectura, complexidade ciclomática, cobertura de testes (expandido ao nível dos audits maduros).
  - `performance-audit` — bundle size, N+1 queries, I/O bloqueante, queries lentas, resource leaks (N+1 movido do code-quality original).
- **Agent `local-reviewer`** + skill-trigger fina — segunda opinião de code review via Ollama qwen3-coder local, read-only, sem cloud.
- **Command + skill `ngrok-expose`** — túnel ngrok HTTPS público com authtoken obtido do Vault via `wire-base` (`find` dinâmico do `lib/vault-env.sh`).
- **`shared/scoring.md`**, **`shared/ci-mode.md`**, **`shared/report-format.md`** — convenções cross-cutting (rubrica X.X/10 unificada, JSON/SARIF + exit codes em `--ci`, formato canónico de relatório). Referenciadas por todas as skills via `${CLAUDE_PLUGIN_ROOT}/shared/`.
- **Hook SessionStart** `check-recommends.sh` — avisa se `wire-base` em falta.

### Depends on

- **`wire-base@jump2new`** (recomendado) — `/ngrok-expose` precisa do `lib/vault-env.sh`. Os 5 audits e o `local-reviewer` funcionam standalone.

### Optional runtime

- **Ollama local** (qwen3-coder) — para o `local-reviewer`. Degrada para análise própria se indisponível.
- **MemPalace** (`.mempalace/` no projecto auditado) — `/full-audit` enriquece com histórico de issues se disponível.

### Notes

- O modo `--ci` produz JSON sempre, SARIF adicional nos audits de código (`security-scan`, `code-quality`), exit code `0`/`1`/`2` conforme severidade máxima encontrada — para usar em pre-commit hooks e pipelines.
- Versão inicial após reset do histórico git ("clean slate") do repositório do marketplace.

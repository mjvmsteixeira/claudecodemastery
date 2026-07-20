# Changelog — prumo-secops

Formato: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versionamento: [SemVer](https://semver.org/spec/v2.0.0.html).

## v0.5.3 — 2026-07-20

**`/prumo-secops-bootstrap`: o split do HCL partia-se quando corrido como slash command.** O Passo 5 usava `match($0, …)`/`substr($0, …)` em awk para separar as 7 policies do `vault-policies.hcl`.

- **Bug — variáveis posicionais nuas são substituídas pelo harness.** Num slash command, `$0` é substituído pelos argumentos da invocação *antes* de o bloco correr: `match($0, /wire-[a-z-]+/)` chegava ao awk como `match(--plan, …)`, que é aritmética sobre uma variável indefinida, não a linha. O split produzia 0 ficheiros e o command abortava com "Split do HCL produziu 0 ficheiros, esperados 7". `${1:---plan}` (com chavetas) sobrevive à substituição; `$0` não — daí o defeito passar despercebido no Passo 1.
- **Corrigido** com um loop `while IFS= read -r line` em bash puro, sem variáveis de campo do awk e portanto sem colisão possível com placeholders do harness. Verificado contra o `vault-policies.hcl` real: 7 ficheiros, todos com os `path` blocks intactos.
- Só este ficheiro usava o padrão em todo o marketplace.

## v0.5.2 — 2026-07-17

**Portabilidade Linux: `pii-redact` deixa de fazer fail-open sem `shasum`.** Descoberto ao investigar uma falha de CI (que era outra: ver abaixo). O hook usava `shasum` (script perl) no caminho de bloqueio, **antes** do `exit`. Com `set -e`, num Linux sem perl (`shasum` ausente → 127), o hook saía 127 em vez de 2 — a PII detectada **não era bloqueada** (fail-OPEN). O CI (ubuntu-latest tem perl) nunca deu por isso. Fallback para `sha256sum` (coreutils) e, em último caso, um marcador; o bloqueio nunca aborta por falta da ferramenta de hash. Verificado em container sem `shasum`: 18/18 casos de PII bloqueiam.

Nota: o `telemetry-test` do eval-harness (que fez o CI ficar vermelho) foi corrigido à parte — usava `\t` em `grep`, que o GNU grep não interpreta como tab (o BSD grep do macOS interpretava). Não é conteúdo de plugin, não altera versão.

## v0.5.1 — 2026-07-16

**Os gates deixam de treinar evasão.** Origem: o `pii-redact` bloqueava o trailer `Co-Authored-By:` que o system prompt do Claude Code exige em **todos** os commits, e a única saída era ofuscar o email em shell — passando pelo gate sem deixar rasto na telemetria. Um gate que treina evasão destrói o audit trail que existe para produzir.

- **`pre-tool-pii-redact.sh` — allowlist estrutural.** Trailers git (`Co-Authored-By`, `Signed-off-by`, `Reviewed-by`, `Acked-by`, `Tested-by`, `Reported-by`) e remotes SSH scp-style (`git@host:`) deixam de ser lidos como email de titular. Substituição por token e não por linha (o trailer tanto vem em heredoc como em `-m` inline). Risco residual aceite e documentado: um email formatado como trailer bem-formado passa; PII *fora* do trailer continua classificada (`pii-16`).
- **`pre-tool-pii-redact.sh` — respeita `PRUMO_OPERATING_MODE`.** Bloqueava com `exit 2` cru, pelo que `/prumo-mode dev` não tinha efeito nenhum sobre ele — era o único classificador do plugin fora da convenção do repo sem excepção documentada. Passa a bloquear via `prumo_fail_or_warn`.
- **`pre-tool-pii-redact.sh` — bypass audit-tracked a sério.** O caminho `PRUMO_PII_DISABLE=1` saía com `exit 0` sem registar nada: a telemetria dizia `allow`, indistinguível de input limpo, contra o que o `CLAUDE.md` afirmava em dois sítios. Passa a registar decisão `bypass`, como o `second-opinion` já fazia.
- **`pre-tool-pii-redact.sh` — falso positivo na regex de telefone.** Faltava âncora à esquerda: a regex podia começar a meio de uma corrida de dígitos e bastava-lhe o `\b` final, pelo que qualquer inteiro de 10+ dígitos cujos últimos 9 comecem em 2/3/9 disparava `telefone-PT` (ids, epochs em ms, contagens de bytes).
- **`pre-tool-approval-gate.sh` — remediação seguível.** A mensagem mandava `PRUMO_APPROVE=Nx <comando>`, impossível de cumprir: um hook PreToolUse corre no processo do Claude Code, antes do comando e noutro ambiente, por isso o prefixo inline aplica-se ao filho e nunca ao hook. Sem outra saída documentada o gate era intransponível dentro da sessão. Passa a apontar para `settings.json` → `env`, com aviso explícito de que autoriza o nível inteiro na sessão e não o comando.
- **`CLAUDE.md`:** corrigida a afirmação de audit-tracking; documentado que as variáveis de gate não aceitam prefixo inline; acrescentado o alcance real do `pii-redact` (dispara depois de o modelo já ter emitido o texto e não gate `Read`/`Grep` — impede persistência/transmissão, não a entrada em contexto).

Sem alterações de comportamento em produção para input com PII genuína: `prod` continua fail-closed.

## v0.5.0 — 2026-07-07

**Guardrail semântico + fix de segurança CRÍTICO** (adicionado à linha 0.5.0 em 2026-07-07):

- **SECURITY (CRÍTICO) — `pre-tool-vault-ttl.sh`:** corrigido bypass total da exigência de `VAULT_TOKEN`. `HAS_CHAIN` não detectava `&` simples nem newline como separadores de statement — `echo hi & vault write …` e `echo hi\nvault write …` passavam pelo allowlist `^echo` sem token enquanto o bash real executava a segunda instrução. Agora ambos são bloqueados (fail-closed).
- **SECURITY (alto) — `pre-tool-approval-gate.sh`:** mesma classe de fronteira alargada com `(`/backtick; `rm`/`truncate` embrulhados em `$()`/backtick voltam a disparar N1/N2/N3 e o `approvals.log`.
- **Guardrail semântico (Fase 02) — `pre-tool-second-opinion.sh`:** classificação via Ollama local na zona-cinzenta (ofuscação que a regex não apanha), comando como dado não-confiável (anti-injeção), veredicto JSON, conservador (em dúvida bloqueia), bypass audit-tracked. Fronteira `eval`/`bash -c` alargada; guard `jq` fail-closed.
- **Telemetria (Fase 03):** hooks instrumentados via `prumo_telemetry_init`; `_lib.sh` com stubs no-op quando o base falta.
- **Templates:** criados `cncs-template.md` + `template-cliente.md` (IR), `template-relatorio.md` (isolamento) e `painel-template.md` (monitoring), antes referenciados mas inexistentes.
- Consistência: prefixos de log uniformizados para `[prumo-secops/<hook>]`; default de `PRUMO_LOG_DIR` centralizado no `_lib.sh`.

**BREAKING — rebranding wire → prumo** (2026-07-06). O plugin passa a chamar-se `prumo-secops` no marketplace `prumo`.

- Renomeados: comandos `/wire-*` → `/prumo-*`, skills e agents `wire-*` → `prumo-*`, env vars `WIRE_*` → `PRUMO_*`
- Intocado (domínio de produção): produtos wirepaper/wireforms/wiredesk, hostnames `wire-*`, AppRoles e policies Vault (`wire-monitor`, …), entradas Keychain (`-a wire-secops`), regras Wazuh e templates Zabbix
- `hooks/_lib.sh` passa a descobrir `prumo-base`/`lib/prumo-common.sh` no cache (requer prumo-base ≥ 0.5.0)
- Upgrade: `/plugin uninstall wire-secops@jump2new` seguido de `/plugin install prumo-secops@prumo`

## [0.4.0] - 2026-05-19 ("Honest")

### ⚠ Upgrade · OBRIGATÓRIO uninstall + reinstall

v0.4.0 corrige **três hooks que estavam funcionalmente partidos em v0.3.x** (timeouts ignorados, approval-gate broken stdin, pii-redact no-op). **Cache antiga lado-a-lado da nova provoca comportamento inconsistente.** Faz sempre:

```
/plugin uninstall wire-secops@jump2new
/plugin install wire-secops@jump2new
```

Recarrega a sessão Claude Code para os hooks novos entrarem em vigor.

### ⚠ Behavior change · hooks deixam de ser bypassed

Em v0.3.x, alguns workflows podiam estar a depender de operações destrutivas passarem silenciosamente (hooks broken). Em v0.4.0:

- `pre-tool-approval-gate.sh` bloqueia ops destrutivas até **`WIRE_APPROVE=N1/N2/N3`** ser exportada
- `pre-tool-pii-redact.sh` bloqueia tool calls com PII detectado (NIF, IBAN PT, CC PT, email, telefone PT 9 dígitos)
- `/wire-vault-doctor` exige `VAULT_ADDR` explícita (sem fallback silencioso para localhost)
- Hooks usam `${WIRE_LOG_DIR:-$HOME/.wire/log}` em vez de `/var/log/` root-owned

Se tinhas workflows que dependiam de bypass, agora precisam de autorização explícita. Vê secção "Variáveis de ambiente do plugin" em `CLAUDE.md`.

### Adicionado

- **20 templates `references/*.md`** em todas as 6 skills (progressive disclosure funcional):
  - `wire-ir-multitenant/references/`: severity-matrix, timeline-template, distribuicao-classificacao
  - `wire-compliance-provider/references/`: mapping-nis2, mapping-iso27001, anexoII-template, dpia-template, caiq-pre-filled
  - `wire-saas-monitoring/references/`: wazuh-rules, wazuh-fortigate-pairs, zabbix-canonical-templates, runbook-correlacao
  - `wire-tenant-isolation/references/`: template-cliente, queries-evidencia, painel-template
  - `wire-release-safety/references/`: canary-plan-template, rollback-template, changelog-template
  - `wire-cliente-dossier/references/`: dossier-template, sla-calculation
- **Convenção `WIRE_*` env vars** documentada em `CLAUDE.md` ("Variáveis de ambiente do plugin")
- **`/wire-vault-doctor`** fail-fast quando `VAULT_ADDR` não exportada (mensagem pedagógica com prod e dev endpoints)
- **`smoke.sh`** cobertura expandida: hooks.json schema, vault-policies.hcl policies count, negative allowlist test, references count per skill
- **Skills · bloco "Pré-requisitos"** em 4 skills explicita Vault AppRole + env vars + cross-links a `references/*.md`

### Corrigido

- **Hook input parsing (crítico)**: o Claude Code entrega aos hooks de tipo `command` um **JSON via stdin** (`{"tool_name":"Bash","tool_input":{"command":"..."}}`), não o comando cru. Os hooks liam `${1:-$(cat)}` e faziam grep sobre o JSON inteiro — a allowlist do `vault-ttl` (patterns ancorados a `^`) nunca batia, bloqueando **todos** os comandos diagnósticos em runtime (diagnose-deadlock). Adicionado parser partilhado `hook_tool_payload` em `_lib.sh`; os 4 hooks PreToolUse extraem `.tool_input.command` (Bash) / `.tool_input.{file_path,content,old_string,new_string}` (Write/Edit). `post-tool-cef-wazuh.sh` parseia o evento JSON em vez de env vars `CLAUDE_TOOL_*` (que não existem). Retro-compatível com texto cru (CLI/testes)
- **Hook timeout schema**: `timeout_ms` → `timeout` em segundos em todas as 7 entradas de `hooks.json` (Claude Code schema)
- **`pre-tool-approval-gate.sh`** reescrito — env var `WIRE_APPROVE=N1/N2/N3` (substitui `read` interactivo broken). Aceita combinações de flags (`-rfv`, `-fr`), trailing args (`cap production deploy --branch X`), SQL comments (`DROP/**/TABLE`), `git push -f`, payloads multi-line, `--force-with-lease`
- **`pre-tool-pii-redact.sh`** reescrito — fail-closed-on-detected-PII com regex calibradas (NIF, IBAN PT 25 chars, CC PT, email, **telefone PT 9 dígitos** — corrigido de 8). Skip binary content portable (BSD grep compatible)
- **`pre-tool-second-opinion.sh`** — `OLLAMA_HOST` e `OLLAMA_MODEL` env vars (consistente com doctor), JSON construído via `jq --arg` (sem injection), verdict regex aceita preamble LLM-comum
- **`pre-tool-vault-ttl.sh`** — `rm` allowlist tightened, exclui `$HOME/<x>` excepto `$HOME/.wire/`
- **`post-tool-cef-wazuh.sh`** — log path `${WIRE_LOG_DIR:-$HOME/.wire/log}/cef.log` (em vez de `/var/log/` root-owned); `shasum -a 256` em vez de `sha256sum` (macOS-compat); namespace `WIRE_WAZUH_HOST`; graceful fallback se LOG_DIR unwritable
- **`post-tool-vault-revoke.sh`** — source de `VAULT_*` env via `find ... | sort -V` (em vez de glob lexicográfico); Linux-only `shred` guarded
- **`/wire-vault-doctor`** — temp files via `mktemp` (não `/tmp/*.json` fixos); `wire-secops-login` dead refs substituídos por instruções concretas de AppRole login (Keychain → `vault write auth/approle/login`)
- **`/wire-ollama-doctor`** — `wire-secops-login` ref substituída; default `OLLAMA_MODEL=qwen3-coder:30b`
- **`/wire-stack-doctor`** — env vars críticas (`WIRE_WAZUH_HOST`, `FORTIGATE_HOST`, `ZABBIX_URL`) com fail-fast `: "${X:?msg}"`; GitHub URL agora parseado de `marketplace.json` em vez de hardcoded
- **`/wire-secops-bootstrap`** — TLS fail-fast (HTTPS sem CA cert é hard-fail, não silent fallback)
- **`vault-policies.hcl`** — comment "Seis AppRoles" → "Sete AppRoles (6 + Cowork external)"; justificações inline para `sys/audit-hash/*` (wire-ir) e `sys/policies/acl/*` (wire-tenant)
- **`CLAUDE.md`** — commands section actualizada para 10 commands (inclui `/wire-secops-bootstrap`); AppRoles table marca Cowork como external; backends list expandida com `secret/data/db/schemas/*` e `sys/policies/acl/*`
- **`README.md`** — nova tabela "Commands (resumo)" com 10 entries; links `/wire-vault-bootstrap` annotados como `(wire-base)`
- **Skills curl inline** — 4 skills (`wire-saas-monitoring`, `wire-ir-multitenant`, `wire-tenant-isolation`, `wire-cliente-dossier`) com bloco "Pré-requisitos" + exemplo curl directo com auth Vault (sem wrappers fantasma)
- **Agents** — `wire-monitor-01` perde `WebFetch` (read-only enforcement explícito); `wire-tenant-01` ganha capability "metadata fetch para dossiers"; hardcoded paths substituídos por env vars (`WIRE_FORENSICS_DIR`, `WIRE_EPHEMERAL_KEY_DIR`, `WIRE_RAILS_DEPLOY_BASE`)
- **Cosign clarification** — `wire-deploy-01.md` explicita que cosign aplica-se a containers (Vault HA, Wazuh); apps Rails Capistrano usam checksum equivalente (CTRL-W-R-008b a definir na Wire SaaS)
- **Typo**: "deligar" → "desligar" em `wire-release-safety/SKILL.md`

### Removido

- `WebFetch` tool grant de `wire-monitor-01` (não usado; remoção de scope desnecessário)

### Fonte

- Plano: `docs/superpowers/plans/2026-05-19-wire-secops-v0.4/`
- Spec: `docs/superpowers/specs/2026-05-19-wire-secops-v0.4-honest-design.md`
- Audit base: 2 subagents paralelos sobre `secops/` (9 Critical + 12 Important findings); code reviewer encontrou +5 bugs de bypass durante implementação, todos resolvidos

---

## v0.3.0 — 2026-05-19

### ⚠ Upgrade · OBRIGATÓRIO desinstalar a versão antiga antes de instalar v0.3.0

O hook `pre-tool-vault-ttl.sh` ganhou patterns novos na allowlist. Se a cache do v0.2.x ficar lado-a-lado da v0.3.0, o hook antigo pode bloquear comandos que a v0.3.0 já allowlistou — comportamento inconsistente.

```
/plugin uninstall wire-secops@jump2new
/plugin install wire-secops@jump2new
```

Recarrega a sessão Claude Code para o hook novo entrar em vigor. `/plugin list` deve mostrar `wire-secops · 0.3.0 · user` (uma entrada apenas).

### Adicionado

- **`/wire-secops-bootstrap`** — provisiona conteúdo Wire-specific no Vault assumindo infra base já provisionada. Inclui: 7 policies wire-* via split do `vault-policies.hcl` shipado, 7 AppRoles com TTLs hardcoded (espelham comentários do HCL), `transit/keys/forensics`, `ssh/config/ca`, `ssh/roles/wire-srv-role` + `ssh/roles/wire-ir-role`. Popula macOS Keychain + `~/vault/approle-credentials.json` (chmod 600) por cada AppRole. Idempotente, `--plan` (default) / `--apply`. Marca rotações de secret-id como `⟳` no plano para confirmação explícita.

### Alterado

- `hooks/pre-tool-vault-ttl.sh`: adicionados 3 patterns à `ALLOWLIST_PATTERNS` (`wire-vault-bootstrap`, `wire-secops-bootstrap`, `wire-vault-kv-migrate`) para resolver o chicken-and-egg de bootstrap (precisa de root pre-AppRole). Defesa em profundidade: cada comando valida policy='root' internamente; allowlist sozinha não autoriza nada destrutivo.

- `smoke.sh`: asserts do novo command + presença dos 3 patterns no hook.

### Adicionado (validate.sh)

- Nova secção 7c em `scripts/validate.sh` que verifica a presença dos 3 patterns na allowlist do hook.

### Fonte

Plano: `docs/superpowers/plans/2026-05-19-wire-vault-bootstraps/`.
Resolve findings #3 e parte de #4 do `/wire-vault-doctor`.

## [0.2.0] — 2026-05-15

### Added

- **`smoke.sh`** — sanity check read-only chamado pelo `/wire-smoke` do `wire-base`. Testa: plugin.json válido, `_lib.sh` expõe `wire_fail_or_warn` (real ou stub), wire-base detectado na cache, hooks executáveis, allowlist do `pre-tool-vault-ttl.sh` passa um `ls` sem token, `CLAUDE.md` presente, ollama/qwen3-coder disponíveis. Funciona em cache (post-install) e source tree (dev/CI).

## [0.1.0] — 2026-05-15

Versão inicial do plugin no marketplace `jump2new`.

### Added

- **6 agents** `wire-*-01`: `wire-monitor-01` (Wazuh+Fortigate+Zabbix), `wire-ir-saas-01` (IR multi-tenant), `wire-tenant-01` (isolamento), `wire-srv-saas-01` (servidores Rails nativos), `wire-deploy-01` (release gate Capistrano), `wire-compliance-01` (NIS2 + RGPD).
- **6 skills** `wire-*`: `wire-tenant-isolation`, `wire-saas-monitoring` (correlação Wazuh↔Fortigate↔Zabbix), `wire-ir-multitenant`, `wire-release-safety`, `wire-compliance-provider`, `wire-cliente-dossier`.
- **9 commands** `/wire-*`:
  - Operação: `/wire-saas-health`, `/wire-tenant-audit`, `/wire-incident-spread`, `/wire-release-gate`, `/wire-cliente-dossier`, `/wire-compliance-snapshot`.
  - Diagnóstico: `/wire-stack-doctor`, `/wire-vault-doctor`, `/wire-ollama-doctor`.
- **Hook chain**:
  - SessionStart: `check-recommends.sh` — avisa se `wire-base` em falta.
  - PreToolUse Bash: `vault-ttl` (allowlist + TTL ≥ 60s), `pii-redact` (NIF/email/IBAN/CC/IP), `approval-gate` (N1/N2/N3), `second-opinion` (Ollama qwen3-coder local).
  - PreToolUse Write|Edit: `pii-redact`.
  - PostToolUse: `cef-wazuh` (emissão CEF → Wazuh SIEM).
  - Stop: `vault-revoke` (revoga token AppRole).
- **`vault-policies.hcl`** — policies HCL para AppRoles `wire-{monitor,ir,tenant,srv,deploy,compliance,cowork-reporting}` e SSH roles `wire-{srv,ir}-role`.
- **`hooks/_lib.sh`** — shim que carrega `wire-common.sh` do `wire-base` (via find no plugin cache) ou define stubs de fallback prod-fail-closed.

### Depends on

- **`wire-base@jump2new`** (recomendado). Os hooks usam `wire_log`/`wire_mode`/`wire_fail_or_warn` da `wire-common.sh` para respeitarem `WIRE_OPERATING_MODE` (prod=block, dev=warn, lab=silent). Sem o base, os hooks correm com stubs de fallback (prod-fail-closed).

### Notes

- O hook `pre-tool-vault-ttl.sh` mantém o padrão "fail-open para diagnóstico, fail-closed para ops privilegiadas" — allowlist explícita para doctors, health checks e ops sobre ficheiros locais.
- Versão inicial após reset do histórico git ("clean slate") do repositório do marketplace.

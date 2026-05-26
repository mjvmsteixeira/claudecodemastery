# wire-base

Plugin-base do ecossistema Wire para Claude Code · v0.3.0

---

## Dependências

Nenhuma. É a **fundação** do ecossistema — outros plugins Wire (`wire-secops`, `wire-devkit`) dependem deste.

---

## O que faz

Plugin foundacional. 15 commands e 11 skills que assentam em convenções partilhadas, mais um hook `SessionStart` que deixa o teu Vault local operacional sem fricção e um hook `PreToolUse` (`audit-guard`) que dá defense-in-depth ao `wire-devkit`.

| Componente | Tipo | Domínio |
|------------|------|---------|
| **mempalace-doctor** | skill | Saúde do tool MemPalace (vector DB com drawers/HNSW/KG em `~/.mempalace/`) |
| **claude-deep-audit** | skill | Auditoria profunda Claude Code via 10 sub-agentes paralelos (CLAUDE.md, settings, skills, hooks, MCPs, memory, plugins, x-refs) |
| **vault-toolkit** | 5 commands + skill + hook | `/vault-list`, `/vault-set`, `/vault-audit`, `/vault-backup`, `/vault-integrate` · skill thin que roteia intenções "segredos"→command · auto-unseal no SessionStart |
| **wire-vault-bootstrap** | command | `/wire-vault-bootstrap [--plan\|--apply]` · provisiona infra Vault genérica idempotente (audit em `/vault/audit/audit.log`, kv-v2 em `secret/`, approle auth, transit, ssh engines). Refuse-and-redirect para `wire-vault-kv-migrate` se detectar kv-v1 com dados. Valida `policies includes "root"` antes de qualquer escrita. **Novidade v0.3.0.** |
| **wire-vault-kv-migrate** | command | `/wire-vault-kv-migrate [--plan\|--backup\|--apply]` · migra `secret/` de kv-v1 para kv-v2 destrutivo em 3 etapas (walk recursivo → backup JSONL chmod 600 → re-import via HTTP API). `--apply` exige backup <24h e env `WIRE_VAULT_MIGRATE_CONFIRM=migrate-now` (gate explícito anti-acidente). **Novidade v0.3.0.** |
| **wire-onboard** | command + skill | `/wire-onboard` · setup wizard end-to-end do ecossistema Wire (base/secops/devkit) · detecta gaps, emite linhas de install, sugere smoke tests · idempotente |
| **wire-doctor** | command + skill | `/wire-doctor` · meta-doctor read-only · orquestra mempalace-doctor + claude-deep-audit + /vault-audit + /wire-vault-doctor em paralelo, consolida num relatório de saúde do setup local |
| **wire-mode** | command + skill | `/wire-mode [prod\|dev\|lab\|status]` · lê/escreve `~/.wire/mode` e gere marker `~/.wire/lab-mode` · controla fail-closed vs warn-only vs bypass nos hooks downstream |
| **wire-style** | command + skill | `/wire-style [on\|off\|status] [--user]` · injecta/remove um bloco de output conciso ("talk-normal", MIT) num `CLAUDE.md`, delimitado por marcadores, idempotente e versionado · scope projecto por default, `--user` para o global · backup automático antes de escrever. **Novidade v0.4.0.** |
| **wire-context-pack** | command + skill | `/wire-context-pack <ir\|release\|audit\|all>` · cheat-sheet curado cross-plugin para primar sessões IR / release / audit · lista skills, commands, Vault paths, AppRoles, logs, one-liners |
| **wire-upgrade** | command + skill | `/wire-upgrade` · compara versões instaladas vs. remotas (raw GitHub) · emite linhas `/plugin install` para colar |
| **wire-vault-policy** | command + skill | `/wire-vault-policy <nome> [--kv-read \|--kv-write \|--transit-key \|--ssh-role]` · gera template HCL parametrizado em `$VAULT_HOME/policies/` |
| **wire-smoke** | command + skill | `/wire-smoke [base\|secops\|devkit\|all]` · orquestra os `smoke.sh` shippados em cada plugin · sanity check read-only de install correctness (~2s/plugin) |
| **lib/wire-common.sh** | bash lib | `wire_mode`, `wire_scope`, `wire_log`, `wire_backup`, `wire_fail_or_warn` — source-able por outros plugins |
| **lib/vault-env.sh** | bash lib | `V` (native/docker abstraction), `vault_ready`, `vault_unseal`, `vault_container_up`, `vault_arrange_up` |
| **hooks/pre-tool-audit-guard.sh** | PreToolUse hook | Defense-in-depth para o `wire-devkit`: bloqueia operações destrutivas (`rm` fora de `/tmp`, `git rm`, SQL `DROP/ALTER/TRUNCATE`, Edit/Write a `.gitignore`/`.env*`/`config/initializers/`/`spec/`/`test/`/workflows CI/`filter_parameter_logging.rb`) durante contexto de audit (marker `~/.wire/audit-active` ou `WIRE_AUDIT_ACTIVE=1`) a menos que a skill aprove com `WIRE_AUDIT_APPLY=1`. Em prod fail-closed, em dev warn-only. Silencioso fora de contexto de audit. |

Os três domínios são **independentes** mas **conscientes uns dos outros** — cada SKILL.md tem secção "Ver também" e "Integração" que evita duplicação e dirige o utilizador à ferramenta certa.

---

## Skill triggers · qual usar quando

| Sintoma do utilizador | Skill / Command que dispara |
|-----------------------|------------------------------|
| "setup wire", "instalar plugins wire", "estou novo no wire" | `/wire-onboard` |
| "saúde do setup", "doutor wire", "diagnóstico geral" | `/wire-doctor` |
| "muda para dev", "modo prod", "wire mode" | `/wire-mode` |
| "torna o Claude conciso", "modo conciso", "tira o filler" | `/wire-style on` |
| "prepara contexto IR / release / audit", "cheat-sheet" | `/wire-context-pack <scope>` |
| "há updates dos plugins wire?", "estou actualizado?" | `/wire-upgrade` |
| "cria policy vault para X", "nova approle" | `/wire-vault-policy <nome>` |
| "smoke test wire", "instalei e funciona?" | `/wire-smoke [plugin]` |
| "provisiona vault do zero", "audit + kv-v2 + transit + ssh" | `/wire-vault-bootstrap` |
| "secret/ está em kv-v1, migra para v2" | `/wire-vault-kv-migrate` |
| "audita o meu CLAUDE.md", "deep audit", "review my config" | `claude-deep-audit` |
| "diagnóstico mempalace", "saúde do palace", "repair drawers" | `mempalace-doctor` |
| "que segredos tem este projecto?" | `/vault-list` |
| "integra este projecto com o Vault" | `/vault-integrate` |
| "verifica PLACEHOLDERs e policy" | `/vault-audit` |
| "backup encriptado dos segredos" | `/vault-backup` |
| "actualiza este segredo" | `/vault-set` |
| "o servidor Vault está saudável?" | `/wire-vault-doctor` (vive em `wire-secops`) |

A regra: **mempalace-doctor** ≠ **claude-deep-audit** ≠ **vault-doctor**. Domínios distintos, descrições explícitas para evitar mis-triggering.

---

## Vault · preserva o que já tens

O `vault-toolkit` foi desenhado para se integrar com instalações existentes **sem migrar nada**. Detecção automática em `lib/vault-env.sh`:

```
VAULT_HOME → primeiro de: ~/vault, ~/.vault (default ~/vault)
VAULT_ADDR → https://127.0.0.1:8200 (override via env)
VAULT_INIT → $VAULT_HOME/vault-init.json (lê unseal_keys_b64 + root_token)
VAULT_MODE → "native" se houver `vault` CLI, senão "docker"
```

Se já tens `~/vault/` com `docker-compose.yml`, `vault-init.json`, `policies/`, `approle-credentials.json`, `tls/`, `ops-vault.sh` — **tudo continua a funcionar exactamente como antes**. O toolkit nunca toca em ficheiros existentes, só:

- Lê `vault-init.json` para o auto-unseal
- Escreve **novas** policies em `$VAULT_HOME/policies/<projecto>-policy.hcl`
- Acrescenta entries a `$VAULT_HOME/approle-credentials.json` (via `jq` merge, preserva existentes)
- Escreve backups em `$VAULT_HOME/backups/projects/<projecto>-<timestamp>.json.enc` (subdir nova, não conflita)

### Flow típico de sessão

Quando arrancas uma sessão Claude Code:

1. **Hook `SessionStart`** (`vault-session-check.sh`) corre automaticamente
2. Em modo docker: se container parado, decide baseado em `wire_mode`:
   - `prod` (default): silencioso, espera que arranques manualmente (`./ops-vault.sh` ou `docker compose up -d`)
   - `dev` / `lab` ou com `WIRE_VAULT_AUTO_UP=1`: `docker compose up -d` + `sleep 5`
3. Tenta auto-unseal lendo as 3 primeiras `unseal_keys_b64` de `vault-init.json`
4. Se conseguiu: emite nota de contexto com paths dos segredos (`secret/projects/<nome>/`, `secret/ai/`, etc.)
5. Se falhou: emite warning a sugerir `./ops-vault.sh unseal` ou `/wire-vault-doctor`

O comando manual continua a funcionar exactamente como antes:

```bash
cd ~/vault
docker compose up -d            # arranca o container (volumes persistem)
./ops-vault.sh unseal           # unseal com keys de vault-init.json
./ops-vault.sh status           # confirmar sealed=false
```

---

## Modo dev / prod / lab

Variável `WIRE_OPERATING_MODE` (lida pelo `lib/wire-common.sh`):

| Valor | Semântica | Quando usar |
|-------|-----------|-------------|
| `prod` | Default. Fail-closed. Vault obrigatório. Auto-up off. | Operação real. |
| `dev` | Warn-only em hooks; auto-up do Vault permitido. | Formação, demos, desenvolvimento do plugin. |
| `lab` | Bypass total · exige marker `~/.wire/lab-mode`. | Exploração de novos hooks, eval de skills. |

Configurar:

```bash
# Persistente
mkdir -p ~/.wire && echo dev > ~/.wire/mode

# Por sessão (override)
export WIRE_OPERATING_MODE=dev

# Lab mode (precisa de marker explícito)
touch ~/.wire/lab-mode && echo lab > ~/.wire/mode
```

Plugins downstream (como `wire-secops`) **respeitam** este sinal via `wire_fail_or_warn` — os hooks do secops fazem `source` da `wire-common.sh` (via shim `_lib.sh`) e bloqueiam em prod, avisam em dev, são silenciosos em lab.

---

## Arquitectura

```
base/
├── .claude-plugin/
│   └── plugin.json
├── README.md
├── lib/
│   ├── wire-common.sh                  # mode, scope, log, backup, require, fail-or-warn
│   └── vault-env.sh                   # V(), vault_ready, vault_unseal, vault_arrange_up
├── hooks/
│   ├── hooks.json                     # SessionStart → vault-session-check.sh; PreToolUse → pre-tool-audit-guard.sh
│   ├── vault-session-check.sh         # auto-unseal + context injection
│   └── pre-tool-audit-guard.sh        # defense-in-depth para wire-devkit (bloqueia destrutivos sem WIRE_AUDIT_APPLY=1)
├── commands/                          # 15 commands
│   ├── vault-audit.md                 # /vault-audit
│   ├── vault-backup.md                # /vault-backup
│   ├── vault-integrate.md             # /vault-integrate
│   ├── vault-list.md                  # /vault-list
│   ├── vault-set.md                   # /vault-set
│   ├── wire-onboard.md                # /wire-onboard
│   ├── wire-doctor.md                 # /wire-doctor
│   ├── wire-mode.md                   # /wire-mode [prod|dev|lab|status]
│   ├── wire-style.md                  # /wire-style [on|off|status] [--user]        (v0.4.0)
│   ├── wire-context-pack.md           # /wire-context-pack <ir|release|audit|all>
│   ├── wire-upgrade.md                # /wire-upgrade
│   ├── wire-smoke.md                  # /wire-smoke [base|secops|devkit|all]
│   ├── wire-vault-policy.md           # /wire-vault-policy <nome> [--kv-read|...]
│   ├── wire-vault-bootstrap.md        # /wire-vault-bootstrap [--plan|--apply]      (v0.3.0)
│   └── wire-vault-kv-migrate.md       # /wire-vault-kv-migrate [--plan|--backup|--apply] (v0.3.0)
└── skills/                            # 11 skills
    ├── mempalace-doctor/
    │   ├── SKILL.md
    │   └── references/
    │       └── etapas.md              # detalhe operacional dos 7 passos
    ├── claude-deep-audit/
    │   ├── SKILL.md
    │   └── references/
    │       └── subagent-briefings.md  # briefings dos 10 sub-agentes paralelos
    ├── vault-toolkit/SKILL.md
    ├── wire-onboard/SKILL.md
    ├── wire-doctor/SKILL.md
    ├── wire-mode/SKILL.md
    ├── wire-style/SKILL.md
    ├── wire-context-pack/SKILL.md
    ├── wire-upgrade/SKILL.md
    ├── wire-smoke/SKILL.md
    └── wire-vault-policy/SKILL.md
```

---

## Co-existência com `wire-secops`

| Concern | `wire-base` | `wire-secops` |
|---------|-----------------|-------------------|
| Auto-unseal Vault local | ✓ (SessionStart) | — |
| TTL gating de tool calls | — | ✓ (PreToolUse) |
| Integração segredos por projecto | ✓ (`/vault-*`) | — |
| Diagnóstico do servidor Vault | — | ✓ (`/wire-vault-doctor`) |
| Health da plataforma SaaS Wire | — | ✓ (`/wire-saas-health`) |
| IR multi-tenant | — | ✓ (`/wire-incident-spread`) |
| Audit Claude Code | ✓ (`claude-deep-audit`) | — |
| Audit MemPalace | ✓ (`mempalace-doctor`) | — |

**Ordem de instalação recomendada:**

1. `wire-base` primeiro (skills foundacionais + Vault tools + helpers bash)
2. `wire-secops` depois (assume `lib/wire-common.sh` existe — opt-in)

Os hooks dos dois plugins têm **lifecycle complementar**, não conflitam:

- `SessionStart` (wire-base) → unseal Vault, injecta contexto
- `PreToolUse: Bash` (wire-secops) → valida TTL antes de operação privilegiada
- `PreToolUse: Write|Edit` (wire-secops) → redact PII
- `PostToolUse` (wire-secops) → emit CEF → Wazuh
- `Stop` (wire-secops) → revoga tokens AppRole

---

## Co-existência com `wire-devkit`

| Concern | `wire-base` | `wire-devkit` |
|---------|-------------|---------------|
| Disciplina contractual de audit (read-only por defeito, gates de safe-apply) | — | ✓ (`shared/safe-apply.md` + skills) |
| Enforcement em runtime (bloquear destrutivos durante audit context) | ✓ (PreToolUse `pre-tool-audit-guard.sh`) | — |
| Lifecycle do contexto de audit (set/unset marker `~/.wire/audit-active`, `WIRE_AUDIT_APPLY=1`) | — (apenas reage ao sinal) | ✓ (skills marcam Fase 4) |
| Hook PreToolUse silencioso fora de audit (no-op) | ✓ | — |

**Defense-in-depth resultante:** com os dois plugins, ganham-se três camadas — contractual (o `description:` da skill comunica a regra), procedural (a metodologia da skill segue os 3 gates), enforced (o hook bloqueia em runtime mesmo se a skill falhar). Sem o `wire-base`, ficam só as duas primeiras.

---

## Validação estática

Antes de tagar uma release ou de empacotar, correr o validador na raiz do repo:

```bash
./scripts/validate.sh                  # corre tudo (com shellcheck se instalado)
./scripts/validate.sh --skip-shellcheck # sem shellcheck
./scripts/validate.sh --plugin base    # limita a um plugin
```

Verifica: JSON dos manifestos, hooks executáveis, hooks.json sem referências mortas, frontmatter (`name`+`description`) em skills/commands/agents, e (opcional) shellcheck sobre `hooks/*.sh` e `lib/*.sh`.

---

## Princípios

1. **Audit primeiro, mostra, pergunta, age.** Cada skill é read-only por defeito; auto-fix exige confirmação explícita por mensagem.
2. **Detecta, não migra.** Vault existente em `~/vault/`? Mempalace em `~/.mempalace/`? O plugin adapta-se ao que existe, não impõe estrutura.
3. **Reversível.** Cada acção destrutiva produz backup datado em `~/.wire/backups/` ou path equivalente.
4. **Idempotente.** Re-correr não duplica nem corrompe.
5. **Mode-aware.** Hooks e skills respeitam `WIRE_OPERATING_MODE` quando relevante (auto-up do Vault, severidade de fails, verbosidade).
6. **Standalone-friendly.** Cada skill funciona sem as outras; cross-references são opt-in.

---

## Instalação

```bash
# 1 · Instalar via marketplace jump2new
/plugin marketplace add mjvmsteixeira/claudecodemastery
/plugin install wire-base@jump2new

#    (alternativa · empacotar localmente)
cd base
zip -r /tmp/wire-base.plugin . -x "*.DS_Store" "*.bak.*"
/plugin install /tmp/wire-base.plugin

# 2 · (Opcional) Configurar modo
mkdir -p ~/.wire && echo dev > ~/.wire/mode    # ou: prod

# 3 · Sanity check
/plugin list                                  # verificar wire-base v0.3.0
ls ~/.claude/plugins/wire-base/           # estrutura completa

# 5 · Primeiros usos
/vault-list                                   # se já tens ~/vault/
"diagnóstico mempalace"                       # se já tens ~/.mempalace/
"audit claude code config"                    # qualquer projecto
```

---

## Roadmap

- ~~`wire-doctor` · meta-doctor que orquestra mempalace-doctor + claude-deep-audit + /vault-audit + /wire-vault-doctor numa única corrida~~ — **feito em v0.1.0**
- ~~`wire-mode` · slash command interactivo para mudar `WIRE_OPERATING_MODE` com marker file~~ — **feito em v0.1.0**
- ~~`wire-onboard` · setup wizard end-to-end~~ — **feito em v0.1.0**: `/wire-onboard` + skill thin detectam plugins na cache, guiam instalação dos gaps e sugerem smoke tests
- ~~`wire-context-pack` · prepara contexto cross-plugin para sessões IR / release / audit~~ — **feito em v0.1.0**: cheat-sheet por scope (`ir | release | audit | all`), marca itens de plugins em falta
- ~~Integração com `wire-secops` · refactor de `pre-tool-vault-ttl.sh` para usar `wire_fail_or_warn` (mode-aware)~~ — **feito em v0.1.0**: os 6 hooks do secops sourceiam `wire-common.sh` via shim `_lib.sh` com fallback stubs
- ~~`wire-vault-bootstrap` + `wire-vault-kv-migrate` · automatizar provisionamento Vault que estava só documentado em CLAUDE.md~~ — **feito em v0.3.0**: dois comandos idempotentes em `wire-base` que resolvem findings #1, #2 e parte de #4 do `/wire-vault-doctor` (audit device, kv-v2, transit/ssh engines, com refuse-and-redirect para migração destrutiva)

---

© 2026 Wire · jump2new · Uso interno

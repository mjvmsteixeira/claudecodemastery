# prumo-base

Plugin-base do ecossistema prumo para Claude Code · v1.0.0

---

## Dependências

Nenhuma. É a **fundação** do ecossistema — outros plugins prumo (`prumo-secops`, `prumo-devkit`) dependem deste.

---

## O que faz

Plugin foundacional. 15 commands e 11 skills que assentam em convenções partilhadas, mais um hook `SessionStart` que deixa o teu Vault local operacional sem fricção e um hook `PreToolUse` (`audit-guard`) que dá defense-in-depth ao `prumo-devkit`.

| Componente | Tipo | Domínio |
|------------|------|---------|
| **memory-doctor** | skill | Auditoria e governança do setup de memória em 3 camadas disjuntas (episódica/MemPalace, estrutural/Graphify, humana/docs). Inventaria e provisiona, arbitra colisões, propõe a regra de encaminhamento. Absorve o antigo `mempalace-doctor`. |
| **claude-deep-audit** | skill | Auditoria profunda Claude Code via 10 sub-agentes paralelos (CLAUDE.md, settings, skills, hooks, MCPs, memory, plugins, x-refs) |
| **vault-toolkit** | 5 commands + skill + hook | `/vault-list`, `/vault-set`, `/vault-audit`, `/vault-backup`, `/vault-integrate` · skill thin que roteia intenções "segredos"→command · auto-unseal no SessionStart |
| **prumo-vault-bootstrap** | command | `/prumo-vault-bootstrap [--plan\|--apply]` · provisiona infra Vault genérica idempotente (audit em `/vault/audit/audit.log`, kv-v2 em `secret/`, approle auth, transit, ssh engines). Refuse-and-redirect para `prumo-vault-kv-migrate` se detectar kv-v1 com dados. Valida `policies includes "root"` antes de qualquer escrita. **Novidade v0.3.0.** |
| **prumo-vault-kv-migrate** | command | `/prumo-vault-kv-migrate [--plan\|--backup\|--apply]` · migra `secret/` de kv-v1 para kv-v2 destrutivo em 3 etapas (walk recursivo → backup JSONL chmod 600 → re-import via HTTP API). `--apply` exige backup <24h e env `PRUMO_VAULT_MIGRATE_CONFIRM=migrate-now` (gate explícito anti-acidente). **Novidade v0.3.0.** |
| **prumo-onboard** | command + skill | `/prumo-onboard` · setup wizard end-to-end do ecossistema prumo (base/secops/devkit/design) · detecta gaps, distingue o Vault broker-pessoal do parque da organização, pergunta pelo estilo de output, sugere smoke tests · idempotente |
| **prumo-doctor** | command + skill | `/prumo-doctor` · meta-doctor read-only · orquestra memory-doctor + claude-deep-audit + /vault-audit + /prumo-vault-doctor em paralelo, consolida num relatório de saúde do setup local |
| **prumo-mode** | command + skill | `/prumo-mode [prod\|dev\|lab\|status]` · mostra o modo (`~/.prumo/mode`, marker `~/.prumo/lab-mode`) e como o alterar (ação humana: `/prumo-guard-mode` ou o terminal) · controla fail-closed vs warn-only vs bypass nos hooks downstream |
| **prumo-style** | command + skill | `/prumo-style [on\|off\|status] [--user]` · injecta/remove um bloco de output conciso ("talk-normal", MIT) num `CLAUDE.md`, delimitado por marcadores, idempotente e versionado · scope projecto por default, `--user` para o global · backup automático antes de escrever. **Novidade v0.4.0.** |
| **prumo-context-pack** | command + skill | `/prumo-context-pack <ir\|release\|audit\|all>` · cheat-sheet curado cross-plugin para primar sessões IR / release / audit · lista skills, commands, Vault paths, AppRoles, logs, one-liners |
| **prumo-upgrade** | command + skill | `/prumo-upgrade` · compara versões instaladas vs. remotas (raw GitHub) · emite linhas `/plugin install` para colar |
| **prumo-vault-policy** | command + skill | `/prumo-vault-policy <nome> [--kv-read \|--kv-write \|--transit-key \|--ssh-role]` · gera template HCL parametrizado em `$VAULT_HOME/policies/` |
| **prumo-smoke** | command + skill | `/prumo-smoke [base\|secops\|devkit\|all]` · orquestra os `smoke.sh` shippados em cada plugin · sanity check read-only de install correctness (~2s/plugin) |
| **lib/prumo-common.sh** | bash lib | `prumo_mode`, `prumo_scope`, `prumo_log`, `prumo_backup`, `prumo_fail_or_warn` — source-able por outros plugins |
| **lib/vault-env.sh** | bash lib | `V` (native/docker abstraction), `vault_ready`, `vault_unseal`, `vault_container_up`, `vault_arrange_up` |
| **hooks/pre-tool-audit-guard.sh** | PreToolUse hook | Defense-in-depth para o `prumo-devkit`: bloqueia operações destrutivas (`rm` fora de `/tmp`, `git rm`, SQL `DROP/ALTER/TRUNCATE`, Edit/Write a `.gitignore`/`.env*`/`config/initializers/`/`spec/`/`test/`/workflows CI/`filter_parameter_logging.rb`) durante contexto de audit (marker `~/.prumo/audit-active` ou `PRUMO_AUDIT_ACTIVE=1`) a menos que a skill aprove com `PRUMO_AUDIT_APPLY=1`. Em prod fail-closed, em dev warn-only. Silencioso fora de contexto de audit. |
| **hooks/pre-tool-self-guard.sh** | PreToolUse hook | Bloqueia em **todos os modos**: o agente não escreve `~/.prumo/{mode,lab-mode,audit-active,org.json,guard.json,redact.json,secret-exec.json}` nem `~/.prumo/approvals/` e `~/.prumo/rules/`, nem muda `env.PRUMO_*`, `enabledPlugins` `prumo-*`, `permissions.defaultMode` ou `disableAllHooks` nos `.claude/settings*.json`. No Bash é best effort: apanha redirecções, verbos de escrita (incluindo `curl -o`, `wget -O`, `rsync`, `scp`), `cd`/variável para `~/.prumo` e `ln` com `.prumo` num argumento (relativo ou absoluto); indirecções em vários passos (`cd ~ && cd .prumo`, um link criado por outra via) escapam. Com o prumo-guard ativo, um ficheiro de aprovação que o diálogo não gravou é apagado e recusado; sem ele, o approval-gate confia no ficheiro. |
| **hooks/pre-tool-secret-read.sh** | PreToolUse hook | `Read`/`Grep`/`Bash` sobre ficheiros de segredos (`.env*`, `.envrc`, chaves, `vault-init.json`, `token-cache`, ...). Bloqueia em prod e dev; em lab o bypass fica registado. |
| **hooks/pre-tool-workspace.sh** | PreToolUse hook | Escritas só dentro das raízes de trabalho e de `~/.prumo/guard.json` → `workspace.extraRoots`. Respeita o modo. |

Os três domínios são **independentes** mas **conscientes uns dos outros** — cada SKILL.md tem secção "Ver também" e "Integração" que evita duplicação e dirige o utilizador à ferramenta certa.

---

## Skill triggers · qual usar quando

| Sintoma do utilizador | Skill / Command que dispara |
|-----------------------|------------------------------|
| "setup prumo", "instalar plugins prumo", "estou novo no prumo" | `/prumo-onboard` |
| "saúde do setup", "doutor prumo", "diagnóstico geral" | `/prumo-doctor` |
| "muda para dev", "modo prod", "prumo mode" | `/prumo-mode` |
| "torna o Claude conciso", "modo conciso", "tira o filler" | `/prumo-style on` |
| "prepara contexto IR / release / audit", "cheat-sheet" | `/prumo-context-pack <scope>` |
| "há updates dos plugins prumo?", "estou actualizado?" | `/prumo-upgrade` |
| "cria policy vault para X", "nova approle" | `/prumo-vault-policy <nome>` |
| "smoke test prumo", "instalei e funciona?" | `/prumo-smoke [plugin]` |
| "provisiona vault do zero", "audit + kv-v2 + transit + ssh" | `/prumo-vault-bootstrap` |
| "secret/ está em kv-v1, migra para v2" | `/prumo-vault-kv-migrate` |
| "audita o meu CLAUDE.md", "deep audit", "review my config" | `claude-deep-audit` |
| "memory doctor", "saúde da memória", "as ferramentas de memória colidem" | `memory-doctor` |
| "que segredos tem este projecto?" | `/vault-list` |
| "integra este projecto com o Vault" | `/vault-integrate` |
| "verifica PLACEHOLDERs e policy" | `/vault-audit` |
| "backup encriptado dos segredos" | `/vault-backup` |
| "actualiza este segredo" | `/vault-set` |
| "o servidor Vault está saudável?" | `/prumo-vault-doctor` (vive em `prumo-secops`) |

A regra: **memory-doctor** ≠ **claude-deep-audit** ≠ **vault-doctor**. Domínios distintos, descrições explícitas para evitar mis-triggering.

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

### Inbox do prumo-guard

O `lib/vault-write-field.sh` (1.1.0) grava um campo lido do stdin em `secret/inbox/…` (`kv put -cas=0`, nunca sobrescreve) e serve a captura do prumo-guard 1.4.0: os segredos colados no chat ficam em `secret/inbox/<projeto>/<id>` (campo `value`). Identidade: o `vault-write-field.sh` faz o seu próprio login AppRole como `agent-claude`, com as credenciais de `${PRUMO_VAULT_CREDS:-$HOME/vault/approle-credentials.json}` (`role_id` e `secret_id` seguem por stdin, nunca em argv), e guarda o token em `~/.prumo/inbox-token-cache` (modo 600, TTL de 600 s, separado do `token-cache` dos outros hooks). Não usa o token do cache dos hooks, nem o do ambiente, nem o token raiz do `vault-init.json`: sem credenciais `agent-claude` ou com o login a falhar, termina com erro e o segredo fica só redigido. Por isso a role do projeto (a do nome da pasta) não precisa de `prumo-inbox`: só a `agent-claude`. A `agent-claude` precisa de `create` em `secret/data/inbox/*` (KV v2; com `-cas=0` a gravação só cria, por isso `update` não é necessário). Política mínima, a juntar à que a role já tem:

```hcl
path "secret/data/inbox/*" {
  capabilities = ["create"]
}
```

Pré-requisito: a captura só funciona depois de anexar à role `agent-claude` uma policy com este HCL.

A pessoa cria o ficheiro `prumo-inbox-policy.hcl` com o HCL acima (ou passa-o no stdin) e, com um token de administração, corre:

```bash
vault policy write prumo-inbox prumo-inbox-policy.hcl     # ou: vault policy write prumo-inbox -   (HCL no stdin)
vault read auth/approle/role/agent-claude                  # ver token_policies atuais
vault write auth/approle/role/agent-claude token_policies="claude-policy,prumo-inbox"
```

`token_policies` substitui a lista inteira: manter as policies que a role já tenha e acrescentar `prumo-inbox` (o exemplo parte de `claude-policy`). Sem a `prumo-inbox` a role não tem permissão e a captura cai no caminho «não guardado».

Roles por projeto: não precisam de `prumo-inbox`; o escritor usa sempre a `agent-claude`, qualquer que seja a pasta do projeto.

Um token em cache emitido antes de alterar as policies só ganha a permissão no próximo login (apagar `~/.prumo/inbox-token-cache` ou esperar os 600 s).

Detalhe da captura em `guard/README.md`. O `vault kv put` faz uma pré-verificação em `sys/internal/ui/mounts`, que precisa da policy `default` no token. A promoção para o caminho definitivo faz-se com `/vault-set --from` (`lib/vault-promote.sh`) e pede `read` na inbox e `create`/`patch` no destino ao token da pessoa.

Listar e limpar a inbox faz-se com o token da pessoa (o AppRole não lê): o `/vault-audit` e o `/vault-list` listam-na (`lib/vault-inbox-list.sh`, só metadados) e `vault kv metadata delete secret/inbox/<projeto>/<id>` apaga uma entrada (N2). Um timeout de gravação pode deixar uma entrada órfã. A captura de `command.run` apanha também os argumentos de comandos de outros plugins e built-in.

### Ciclo completo: colar, guardar, promover, auditar

1. **Colar:** a pessoa cola o segredo no chat; o prumo-guard grava-o em `secret/inbox/<projeto>/<id>` (campo `value`) antes de o redigir, e o modelo só vê a referência. Funciona em qualquer projeto: o escritor faz login como `agent-claude`, qualquer que seja a pasta.
2. **Promover:** `/vault-set --from secret/inbox/<projeto>/<id>#value <destino> <campo>` corre o `lib/vault-promote.sh`, que lê a inbox com o token da pessoa (o AppRole não lê), escreve no destino com `-cas` (`-cas=0` se o destino não existe, `-cas=<versão>` se existe), confirma por hash, reverte se não conferir e só então apaga a entrada da inbox. O valor não passa pelo chat, argv, ficheiros nem logs. O approval-gate do prumo-secops 1.0.3 classifica a corrida do script como N2 e a pessoa aprova o pedido.
3. **Auditar:** `/vault-audit` (secção «Inbox») e `/vault-list` mostram as entradas da inbox do projeto só com metadados (caminho, data, idade), sem valores, e destacam as com mais de 7 dias. A listagem é o `lib/vault-inbox-list.sh` (`kv list` e `kv metadata get`).
4. **Apagar:** `vault kv metadata delete secret/inbox/<projeto>/<id>` só por decisão da pessoa; é N2 no gate. O gate cobre também as formas `-mount=secret`. Caminhos com `//`, `/./` ou `dir/../` são normalizados em voltas até não mudar nada, até 64 níveis de aninhamento (`a/b/c/../../../inbox/x` é `inbox/x`; `..` nunca conta como `dir`); acima disso, um comando que ainda tenha `../` e `inbox` é N2 por falha segura. Com `-mount=secret`, `./inbox/x`, `/inbox/x` e um `../` que sobre à cabeça (`../inbox/x`, `x/../../inbox/x`) contam como inbox, por falha segura; `-mount=secret projects/x` e `secret/inbox/../projects/x` (que sai da inbox) continuam livres.

**Fronteira de confiança.** O N2 protege o valor só enquanto está na inbox. Depois da promoção, o valor fica tão legível como qualquer outro em `secret/projects/*`: quem tem `read` no destino (o token da pessoa, um AppRole cuja policy cubra esse caminho) lê-o com um `kv get` sem aprovação N2, como aos restantes segredos do projeto. Escolher o destino é escolher quem o lê.

Limites conhecidos da redação: tokens colados a uma letra ou dígito não são redigidos; palavras-passe em URL que contenham `/`; parte local de email com mais de 64 caracteres; nomes de pasta com emoji ou Unicode raro podem alterar o segmento da inbox; o gate de aprovação é best-effort contra ofuscação (variáveis, `eval`, base64, codificação em percentagem); uma palavra-passe que termine em `.` antes de um espaço ou do fim é guardada sem o ponto.

### Flow típico de sessão

Quando arrancas uma sessão Claude Code:

1. **Hook `SessionStart`** (`vault-session-check.sh`) corre automaticamente
2. Em modo docker: se container parado, decide baseado em `prumo_mode`:
   - `prod` (default): silencioso, espera que arranques manualmente (`./ops-vault.sh` ou `docker compose up -d`)
   - `dev` / `lab` ou com `PRUMO_VAULT_AUTO_UP=1`: `docker compose up -d` + `sleep 5`
3. Tenta auto-unseal lendo as 3 primeiras `unseal_keys_b64` de `vault-init.json`
4. Se conseguiu: emite nota de contexto com paths dos segredos (`secret/projects/<nome>/`, `secret/ai/`, etc.)
5. Se falhou: emite warning a sugerir `./ops-vault.sh unseal` ou `/prumo-vault-doctor`

O comando manual continua a funcionar exactamente como antes:

```bash
cd ~/vault
docker compose up -d            # arranca o container (volumes persistem)
./ops-vault.sh unseal           # unseal com keys de vault-init.json
./ops-vault.sh status           # confirmar sealed=false
```

---

## Modo dev / prod / lab

Variável `PRUMO_OPERATING_MODE` (lida pelo `lib/prumo-common.sh`):

| Valor | Semântica | Quando usar |
|-------|-----------|-------------|
| `prod` | Default. Fail-closed. Vault obrigatório. Auto-up off. | Operação real. |
| `dev` | Warn-only em hooks; auto-up do Vault permitido. | Formação, demos, desenvolvimento do plugin. |
| `lab` | Bypass total · exige marker `~/.prumo/lab-mode`. | Exploração de novos hooks, eval de skills. |

Configurar:

```bash
# Persistente
mkdir -p ~/.prumo && echo dev > ~/.prumo/mode

# Por sessão (override)
export PRUMO_OPERATING_MODE=dev

# Lab mode (precisa de marker explícito)
touch ~/.prumo/lab-mode && echo lab > ~/.prumo/mode
```

Plugins downstream (como `prumo-secops`) **respeitam** este sinal via `prumo_fail_or_warn` — os hooks do secops fazem `source` da `prumo-common.sh` (via shim `_lib.sh`) e bloqueiam em prod, avisam em dev, são silenciosos em lab.

---

## Arquitectura

```
base/
├── .claude-plugin/
│   └── plugin.json
├── README.md
├── lib/
│   ├── prumo-common.sh                  # mode, scope, log, backup, require, fail-or-warn
│   └── vault-env.sh                   # V(), vault_ready, vault_unseal, vault_arrange_up
├── hooks/
│   ├── hooks.json                     # SessionStart → vault-session-check.sh; PreToolUse → self-guard, audit-guard, workspace, memory-scope, secret-read
│   ├── vault-session-check.sh         # auto-unseal + context injection
│   ├── pre-tool-audit-guard.sh        # defense-in-depth para prumo-devkit (bloqueia destrutivos sem PRUMO_AUDIT_APPLY=1)
│   ├── pre-tool-self-guard.sh         # o agente não muda modo, aprovações nem PRUMO_* (todos os modos)
│   ├── pre-tool-secret-read.sh        # Read/Grep/Bash de ficheiros de segredos
│   └── pre-tool-workspace.sh          # escrita só dentro das raízes de trabalho
├── commands/                          # 15 commands
│   ├── vault-audit.md                 # /vault-audit
│   ├── vault-backup.md                # /vault-backup
│   ├── vault-integrate.md             # /vault-integrate
│   ├── vault-list.md                  # /vault-list
│   ├── vault-set.md                   # /vault-set
│   ├── prumo-onboard.md                # /prumo-onboard
│   ├── prumo-doctor.md                 # /prumo-doctor
│   ├── prumo-mode.md                   # /prumo-mode [prod|dev|lab|status]
│   ├── prumo-style.md                  # /prumo-style [on|off|status] [--user]        (v0.4.0)
│   ├── prumo-context-pack.md           # /prumo-context-pack <ir|release|audit|all>
│   ├── prumo-upgrade.md                # /prumo-upgrade
│   ├── prumo-smoke.md                  # /prumo-smoke [base|secops|devkit|all]
│   ├── prumo-vault-policy.md           # /prumo-vault-policy <nome> [--kv-read|...]
│   ├── prumo-vault-bootstrap.md        # /prumo-vault-bootstrap [--plan|--apply]      (v0.3.0)
│   └── prumo-vault-kv-migrate.md       # /prumo-vault-kv-migrate [--plan|--backup|--apply] (v0.3.0)
└── skills/                            # 11 skills
    ├── memory-doctor/
    │   ├── SKILL.md
    │   └── references/
    │       ├── camada-episodica.md    # MemPalace — inventário, thresholds, 7 etapas
    │       ├── camada-estrutural.md   # Graphify
    │       └── camada-humana.md       # Obsidian/docs
    ├── claude-deep-audit/
    │   ├── SKILL.md
    │   └── references/
    │       └── subagent-briefings.md  # briefings dos 10 sub-agentes paralelos
    ├── vault-toolkit/SKILL.md
    ├── prumo-onboard/SKILL.md
    ├── prumo-doctor/SKILL.md
    ├── prumo-mode/SKILL.md
    ├── prumo-style/SKILL.md
    ├── prumo-context-pack/SKILL.md
    ├── prumo-upgrade/SKILL.md
    ├── prumo-smoke/SKILL.md
    └── prumo-vault-policy/SKILL.md
```

---

## Co-existência com `prumo-secops`

| Concern | `prumo-base` | `prumo-secops` |
|---------|-----------------|-------------------|
| Auto-unseal Vault local | ✓ (SessionStart) | — |
| TTL gating de tool calls | — | ✓ (PreToolUse) |
| Integração segredos por projecto | ✓ (`/vault-*`) | — |
| Diagnóstico do servidor Vault | — | ✓ (`/prumo-vault-doctor`) |
| Health da plataforma SaaS multi-tenant | — | ✓ (`/prumo-saas-health`) |
| IR multi-tenant | — | ✓ (`/prumo-incident-spread`) |
| Audit Claude Code | ✓ (`claude-deep-audit`) | — |
| Audit MemPalace | ✓ (`memory-doctor`) | — |

**Ordem de instalação recomendada:**

1. `prumo-base` primeiro (skills foundacionais + Vault tools + helpers bash)
2. `prumo-secops` depois (assume `lib/prumo-common.sh` existe — opt-in)

Os hooks dos dois plugins têm **lifecycle complementar**, não conflitam:

- `SessionStart` (prumo-base) → unseal Vault, injecta contexto
- `PreToolUse: Bash` (prumo-secops) → valida TTL antes de operação privilegiada
- `PreToolUse: Write|Edit` (prumo-secops) → redact PII
- `PostToolUse` (prumo-secops) → emit CEF → Wazuh
- `Stop` (prumo-secops) → revoga tokens AppRole

---

## Co-existência com `prumo-devkit`

| Concern | `prumo-base` | `prumo-devkit` |
|---------|-------------|---------------|
| Disciplina contractual de audit (read-only por defeito, gates de safe-apply) | — | ✓ (`shared/safe-apply.md` + skills) |
| Enforcement em runtime (bloquear destrutivos durante audit context) | ✓ (PreToolUse `pre-tool-audit-guard.sh`) | — |
| Lifecycle do contexto de audit (set/unset marker `~/.prumo/audit-active`, `PRUMO_AUDIT_APPLY=1`) | — (apenas reage ao sinal) | ✓ (skills marcam Fase 4) |
| Hook PreToolUse silencioso fora de audit (no-op) | ✓ | — |

**Defense-in-depth resultante:** com os dois plugins, ganham-se três camadas — contractual (o `description:` da skill comunica a regra), procedural (a metodologia da skill segue os 3 gates), enforced (o hook bloqueia em runtime mesmo se a skill falhar). Sem o `prumo-base`, ficam só as duas primeiras.

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
3. **Reversível.** Cada acção destrutiva produz backup datado em `~/.prumo/backups/` ou path equivalente.
4. **Idempotente.** Re-correr não duplica nem corrompe.
5. **Mode-aware.** Hooks e skills respeitam `PRUMO_OPERATING_MODE` quando relevante (auto-up do Vault, severidade de fails, verbosidade).
6. **Standalone-friendly.** Cada skill funciona sem as outras; cross-references são opt-in.

---

## Instalação

```bash
# 1 · Instalar via marketplace prumo
/plugin marketplace add mjvmsteixeira/claudecodemastery
/plugin install prumo-base@prumo

#    (alternativa · empacotar localmente)
cd base
zip -r /tmp/prumo-base.plugin . -x "*.DS_Store" "*.bak.*"
/plugin install /tmp/prumo-base.plugin

# 2 · (Opcional) Configurar modo
mkdir -p ~/.prumo && echo dev > ~/.prumo/mode    # ou: prod

# 3 · Sanity check
/plugin list                                  # verificar prumo-base v1.0.0
ls ~/.claude/plugins/prumo-base/           # estrutura completa

# 5 · Primeiros usos
/vault-list                                   # se já tens ~/vault/
"diagnóstico mempalace"                       # se já tens ~/.mempalace/
"audit claude code config"                    # qualquer projecto
```

---

## Roadmap

- ~~`prumo-doctor` · meta-doctor que orquestra memory-doctor + claude-deep-audit + /vault-audit + /prumo-vault-doctor numa única corrida~~ — **feito em v0.1.0**
- ~~`prumo-mode` · slash command interactivo para mudar `PRUMO_OPERATING_MODE` com marker file~~ — **feito em v0.1.0**
- ~~`prumo-onboard` · setup wizard end-to-end~~ — **feito em v0.1.0**: `/prumo-onboard` + skill thin detectam plugins na cache, guiam instalação dos gaps e sugerem smoke tests
- ~~`prumo-context-pack` · prepara contexto cross-plugin para sessões IR / release / audit~~ — **feito em v0.1.0**: cheat-sheet por scope (`ir | release | audit | all`), marca itens de plugins em falta
- ~~Integração com `prumo-secops` · refactor de `pre-tool-vault-ttl.sh` para usar `prumo_fail_or_warn` (mode-aware)~~ — **feito em v0.1.0**: os 6 hooks do secops sourceiam `prumo-common.sh` via shim `_lib.sh` com fallback stubs
- ~~`prumo-vault-bootstrap` + `prumo-vault-kv-migrate` · automatizar provisionamento Vault que estava só documentado em CLAUDE.md~~ — **feito em v0.3.0**: dois comandos idempotentes em `prumo-base` que resolvem findings #1, #2 e parte de #4 do `/prumo-vault-doctor` (audit device, kv-v2, transit/ssh engines, com refuse-and-redirect para migração destrutiva)

---

© 2026 prumo · Uso interno

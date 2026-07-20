---
name: prumo-onboard
description: Setup wizard end-to-end do ecossistema prumo — detecta plugins instalados (base/secops/devkit/design), guia a instalação dos que faltam, pergunta pelo estilo de output e sugere smoke tests por plugin. Idempotente.
allowed-tools: Bash, Read
---

# /prumo-onboard

Setup wizard do ecossistema prumo. Detecta o estado actual, guia a instalação dos plugins em falta e propõe um smoke test por plugin. Não executa `/plugin install` directamente (Claude Code não permite a partir de um command) — emite as linhas exactas para o utilizador colar.

## Passo 1 — Detectar plugins instalados

### Migração wire → prumo

Se o cache tiver plugins da era wire (`ls ~/.claude/plugins/cache | grep -E "wire-(base|secops|devkit|craft)"` devolve resultados), emitir antes de tudo:

    Instalações antigas detectadas — migrar primeiro:
    /plugin uninstall wire-base@jump2new
    /plugin uninstall wire-secops@jump2new
    /plugin uninstall wire-devkit@jump2new
    /plugin uninstall wire-craft@jump2new
    (depois instalar os equivalentes prumo-*@prumo)

Só listar as linhas de uninstall dos que existirem de facto no cache.

```bash
echo "=== Detectando plugins prumo instalados ==="
for p in prumo-base prumo-secops prumo-devkit prumo-design; do
  manifest=$(find ~/.claude/plugins/cache -path "*/${p}/*/.claude-plugin/plugin.json" 2>/dev/null \
             | sort -V | tail -1)
  if [ -n "$manifest" ]; then
    version=$(jq -r .version "$manifest" 2>/dev/null || echo "?")
    cache_dir=$(dirname "$(dirname "$manifest")")
    echo "  ✓ $p · v$version · $cache_dir"
  else
    echo "  ✗ $p · NÃO INSTALADO"
  fi
done
```

### Versões — instalado não é o mesmo que actualizado

O wizard é idempotente e feito para re-correr. Um plugin detectado imprime `✓` mas isso **não** diz nada sobre a versão: num setup desactualizado tudo aparece verde. Se o Passo 1 encontrou pelo menos um plugin instalado, propor a verificação (read-only, não instala nada):

```
Sugerido · confirmar que os plugins instalados estão actualizados:
  /prumo-upgrade

Compara a versão em cache com a do marketplace remoto e emite as linhas
/plugin install a colar. Não auto-instala.
```

## Passo 2 — Gaps de instalação

Para cada plugin **não instalado** detectado no Passo 1, imprimir o bloco correspondente. O utilizador cola as duas linhas no Claude Code.

**Se `prumo-base` em falta** (instalar **primeiro** — outros plugins assumem-no):

```
/plugin marketplace add mjvmsteixeira/claudecodemastery
/plugin install prumo-base@prumo
```

O `prumo-base` traz: `vault-toolkit` (5 commands `/vault-*`), skills `memory-doctor` e `claude-deep-audit`, hook `SessionStart` de auto-unseal do Vault local, libs partilhadas (`lib/vault-env.sh`, `lib/prumo-common.sh`).

**Se `prumo-secops` em falta** (precisa do base):

```
/plugin install prumo-secops@prumo
```

Traz: 6 agents `prumo-*-01`, 6 skills, 9 commands `/prumo-*`, cadeia de hooks PreToolUse/PostToolUse/Stop, `vault-policies.hcl`. Específico do contexto SaaS multi-tenant.

**Se `prumo-devkit` em falta** (independente do base; só `/ngrok-expose` precisa):

```
/plugin install prumo-devkit@prumo
```

Traz: 6 audits no modelo B+C (full-audit, security-scan, infra-audit, ux-audit, code-quality, performance-audit), agente `local-reviewer` e `/ngrok-expose`.

**Se `prumo-design` em falta** (standalone — não depende dos outros plugins prumo):

```
/plugin install prumo-design@prumo
```

Traz: `/product-design`, orquestrador em dois modos (mockup e system) sobre a stack nativa de design do Claude (frontend-design + Artifact + design-sync).

Se a marketplace `mjvmsteixeira/claudecodemastery` ainda não estiver adicionada (caso `prumo-base` seja o primeiro), incluir o `/plugin marketplace add` antes do primeiro install.

## Passo 2b — Provisionamento do Vault (antes dos smoke tests)

**Ordem importa.** O Passo 3 propõe `/vault-list` como smoke test do `prumo-base`, mas isso pressupõe um Vault já provisionado: kv-v2 montado em `secret/`, approle auth activo, engines `transit/` e `ssh/`. Numa máquina limpa esse smoke test falha por desenho, e a mensagem de erro não diz que o problema é o Vault nunca ter sido bootstrapped.

Detectar o estado antes de sugerir o que quer que seja:

```bash
echo "=== Vault — estado do provisionamento ==="
if [ ! -d "${HOME}/vault" ]; then
  echo "  ✗ ~/vault ausente — sem instância local; saltar este passo"
elif ! command -v docker >/dev/null 2>&1 && ! command -v vault >/dev/null 2>&1; then
  echo "  ~ ~/vault existe mas não há CLI vault nem docker — não dá para verificar"
else
  echo "  ✓ ~/vault presente · correr /prumo-vault-bootstrap --plan para o estado real"
fi
```

O bootstrap é **idempotente** e o default é `--plan` (read-only, não escreve). A ordem correcta:

```
1. /prumo-vault-bootstrap --plan     # o que falta provisionar (não escreve)
2. /prumo-vault-bootstrap --apply    # audit device, kv-v2, approle, transit, ssh
```

Requer um token com policy `root`. Se o `--plan` disser que está tudo provisionado, saltar o `--apply`.

**Se `prumo-secops` estiver instalado**, há um segundo bootstrap, específico do parque Wire, que corre **depois** do genérico:

```
3. /prumo-secops-bootstrap --plan
4. /prumo-secops-bootstrap --apply   # 7 policies wire-*, 7 AppRoles, transit/keys/forensics, ssh roles
```

Os nomes `wire-*` são objectos reais do Vault de produção, não branding — não renomear (ver `secops/CLAUDE.md`).

Se `~/vault` não existir, saltar o passo inteiro: o `vault-toolkit` degrada e os smoke tests do Passo 3 que dependem do Vault devem ser omitidos em vez de sugeridos para falhar.

## Passo 3 — Smoke tests por plugin já instalado

Para os plugins **instalados** no Passo 1, propor `/prumo-smoke` — cada plugin shippa um `smoke.sh` próprio (read-only, ~2s) que confirma libs carregam, hooks executáveis e ferramentas opcionais detectadas:

```
Sugerido · sanity check dos plugins instalados:
  /prumo-smoke          # corre os smokes de todos os plugins instalados
  /prumo-smoke base     # ou só um
```

Exit codes:
- `0` — tudo ok
- `1` — falhas críticas (reinstalar)
- `2` — só warnings (ferramentas opcionais como `ollama`/`ngrok`/`~/vault/` em falta — degradação aceitável)

Smoke tests operacionais (mais pesados) ficam como sugestões secundárias por plugin instalado:

- **`prumo-base`** · `/vault-list` (segredos do projecto actual) · esperado: lista de paths em `secret/projects/<projecto>/*` mais partilhados (`secret/ai`, `secret/tokens`). **Só sugerir se o Passo 2b confirmou Vault provisionado** — sem isso falha por falta de setup, não por avaria.
- **`prumo-secops`** · `/prumo-stack-doctor` · esperado: verde/amarelo/vermelho por componente (Vault, Wazuh, Fortigate, Zabbix). Pode falhar fora da VPN — é normal.
- **`prumo-devkit`** · `/full-audit --ci` num projecto qualquer · esperado: JSON consolidado com counts e exit code 0/1/2.
- **`prumo-design`** · `/product-design` em modo mockup · esperado: um Artifact renderizado. Não tem smoke automatizado (depende da stack nativa de design).

**Se `prumo-secops` estiver instalado**, verificar também o Ollama — o hook `pre-tool-second-opinion` consulta um modelo local antes de comandos sensíveis, e sem daemon ou sem o modelo degrada em silêncio:

```
Sugerido · pré-requisito do guardrail semântico do secops:
  /prumo-ollama-doctor

Verifica daemon, modelo qwen3-coder e latência de inferência.
Verde/amarelo/vermelho com acções concretas.
```

## Passo 4 — Modo operacional

Delegar em `/prumo-mode` — **não** escrever `~/.prumo/mode` à mão. O modo efectivo resulta da precedência `env PRUMO_OPERATING_MODE` > `~/.prumo/mode` > default `prod`, e o modo `lab` exige ainda o marker `~/.prumo/lab-mode`. Um `echo prod > ~/.prumo/mode` ignora as duas coisas e pode reportar um modo que não é o que os hooks vêem.

```
Sugerido · ver e configurar o modo operacional:
  /prumo-mode          # mostra o modo efectivo e a fonte que o determina
  /prumo-mode dev      # warn-only nos hooks; ideal para formação e demos
  /prumo-mode prod     # padrão; hooks fail-closed em violações

O modo é lido pelo prumo_mode() da prumo-common.sh e respeitado por todos os
hooks do prumo-secops via prumo_fail_or_warn.
```

Se `/prumo-mode` sem argumentos disser que a fonte é o default (ficheiro ausente), propor fixar explicitamente — um modo implícito é o que faz alguém pensar que está em `dev` quando os hooks estão a bloquear em `prod`.

## Passo 4b — Estilo de output (perguntar, nunca assumir)

O `prumo-base` traz `/prumo-style`, que injecta regras de output num `CLAUDE.md`. **Escreve num ficheiro do utilizador — por isso o onboarding pergunta, nunca aplica sozinho.**

```bash
STYLE_P="${PWD}/CLAUDE.md"; STYLE_U="${HOME}/.claude/CLAUDE.md"
echo "=== Estilo de output (/prumo-style) ==="
for f in "$STYLE_P" "$STYLE_U"; do
  if grep -Eo 'prumo-style BEGIN v[0-9][0-9]* profile=[a-z][a-z]*' "$f" 2>/dev/null | head -1 | grep -q .; then
    echo "  ✓ $f · $(grep -Eo 'prumo-style BEGIN v[0-9][0-9]* profile=[a-z][a-z]*' "$f" | head -1 | sed 's/prumo-style BEGIN //')"
  elif grep -q '<!-- \(prumo\|wire\)-style BEGIN' "$f" 2>/dev/null; then
    echo "  ~ $f · bloco legacy (v1/wire) — /prumo-style on migra para v2"
  else
    echo "  ✗ $f · sem bloco"
  fi
done
```

Se **nenhum** dos dois tiver bloco, perguntar ao utilizador qual o perfil — não decidir por ele:

```
Queres activar o estilo de output conciso? Dois perfis:
  /prumo-style on                   # normal · 9 regras de concisão (uso corrente)
  /prumo-style on --profile focus   # normal + 4 regras de execução multi-passo
                                    # (estado a cada turno, trabalho visível,
                                    #  acção seguinte, estimativas concretas)
Scope default é o projecto. Acrescenta --user para o global.
```

Duas verificações antes de sugerir `--user`:

1. Se o `~/.claude/CLAUDE.md` já tiver regras de estilo próprias (secção de tom/comunicação), **avisar do risco de duplicação** e sugerir scope projecto.
2. Se houver bloco legacy (`~`), dizer que `on` migra para v2 sem duplicar, preservando o perfil.

Nunca correr `/prumo-style on` a partir deste command — é o utilizador que decide o scope e o perfil.

## Passo 5 — Relatório final

Imprimir resumo: quantos plugins instalados (X/4), próximas acções pendentes (se houver), e ponteiro para os CHANGELOGs:

```
=== RESUMO ===
Plugins prumo instalados: X/4  (versões actualizadas: sim/não/não verificado)
Vault provisionado: <sim/não/sem ~/vault>  (secops bootstrap: sim/não/n.a.)
Modo operacional: <prod/dev/lab> (fonte: env/ficheiro/default)
Estilo de output: <normal/focus/nenhum> (projecto · user)
Próximas acções: [lista de items dos passos 2 e 3 que ficaram pendentes]

CHANGELOGs:
  ~/.claude/plugins/cache/*/prumo-base/*/CHANGELOG.md
  ~/.claude/plugins/cache/*/prumo-secops/*/CHANGELOG.md
  ~/.claude/plugins/cache/*/prumo-devkit/*/CHANGELOG.md
  ~/.claude/plugins/cache/*/prumo-design/*/CHANGELOG.md
```

## Passo 6 — Health check final (closes the loop)

Se **todos os plugins recomendados** detectados no Passo 1 estiverem instalados (4/4 ou os 2 hard-required: base + secops), sugerir corrida imediata do `/prumo-doctor` para fechar o ciclo com diagnóstico real:

```
Próximo · sanity check completo do setup:
  /prumo-doctor

Read-only · orquestra memory-doctor + claude-deep-audit + /vault-audit
+ /prumo-vault-doctor (se secops instalado) em paralelo, consolida num
relatório único.
```

Se houver gaps (X/4 < 2), saltar este passo — fazer o doctor antes de ter o ecossistema mínimo só gera ruído.

## Notas

- Idempotente — re-correr não reinstala nada, apenas reporta o estado actual.
- Não executa `/plugin install` directamente (Claude Code não o permite a partir de slash commands); imprime as linhas exactas para colar.
- A detecção usa o plugin cache (`~/.claude/plugins/cache`), que é onde o Claude Code instala plugins. Se o utilizador usar um caminho não-standard via `CLAUDE_CONFIG_DIR`, ajustar o glob.

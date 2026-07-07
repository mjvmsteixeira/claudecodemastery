---
name: prumo-onboard
description: Setup wizard end-to-end do ecossistema prumo — detecta plugins instalados (base/secops/devkit), guia a instalação dos que faltam e sugere smoke tests por plugin. Idempotente.
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
for p in prumo-base prumo-secops prumo-devkit; do
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

## Passo 2 — Gaps de instalação

Para cada plugin **não instalado** detectado no Passo 1, imprimir o bloco correspondente. O utilizador cola as duas linhas no Claude Code.

**Se `prumo-base` em falta** (instalar **primeiro** — outros plugins assumem-no):

```
/plugin marketplace add mjvmsteixeira/claudecodemastery
/plugin install prumo-base@prumo
```

O `prumo-base` traz: `vault-toolkit` (5 commands `/vault-*`), skills `mempalace-doctor` e `claude-deep-audit`, hook `SessionStart` de auto-unseal do Vault local, libs partilhadas (`lib/vault-env.sh`, `lib/prumo-common.sh`).

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

Se a marketplace `mjvmsteixeira/claudecodemastery` ainda não estiver adicionada (caso `prumo-base` seja o primeiro), incluir o `/plugin marketplace add` antes do primeiro install.

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

- **`prumo-base`** · `/vault-list` (segredos do projecto actual) · esperado: lista de paths em `secret/projects/<projecto>/*` mais partilhados (`secret/ai`, `secret/tokens`).
- **`prumo-secops`** · `/prumo-stack-doctor` · esperado: verde/amarelo/vermelho por componente (Vault, Wazuh, Fortigate, Zabbix). Pode falhar fora da VPN — é normal.
- **`prumo-devkit`** · `/full-audit --ci` num projecto qualquer · esperado: JSON consolidado com counts e exit code 0/1/2.

## Passo 4 — Configuração opcional do modo operacional

Se nenhum dos plugins detectou problemas, propor configurar `PRUMO_OPERATING_MODE`:

```bash
if [ ! -f ~/.prumo/mode ]; then
  cat <<'EOF'
Próximo opcional · configurar modo operacional dos plugins prumo:
  mkdir -p ~/.prumo
  echo prod > ~/.prumo/mode   # padrão; hooks fail-closed em violações
  # ou:
  echo dev  > ~/.prumo/mode   # warn-only nos hooks; ideal para formação/demos

O modo é lido pelo prumo_mode da prumo-common.sh e respeitado por todos os hooks.
EOF
fi
```

## Passo 5 — Relatório final

Imprimir resumo: quantos plugins instalados (X/3), próximas acções pendentes (se houver), e ponteiro para os CHANGELOGs:

```
=== RESUMO ===
Plugins prumo instalados: X/3
Modo operacional configurado: <prod/dev/lab/não>
Próximas acções: [lista de items dos passos 2 e 3 que ficaram pendentes]

CHANGELOGs:
  ~/.claude/plugins/cache/*/prumo-base/*/CHANGELOG.md
  ~/.claude/plugins/cache/*/prumo-secops/*/CHANGELOG.md
  ~/.claude/plugins/cache/*/prumo-devkit/*/CHANGELOG.md
```

## Passo 6 — Health check final (closes the loop)

Se **todos os plugins recomendados** detectados no Passo 1 estiverem instalados (3/3 ou os 2 hard-required: base + secops), sugerir corrida imediata do `/prumo-doctor` para fechar o ciclo com diagnóstico real:

```
Próximo · sanity check completo do setup:
  /prumo-doctor

Read-only · orquestra mempalace-doctor + claude-deep-audit + /vault-audit
+ /prumo-vault-doctor (se secops instalado) em paralelo, consolida num
relatório único.
```

Se houver gaps (X/3 < 2), saltar este passo — fazer o doctor antes de ter o ecossistema mínimo só gera ruído.

## Notas

- Idempotente — re-correr não reinstala nada, apenas reporta o estado actual.
- Não executa `/plugin install` directamente (Claude Code não o permite a partir de slash commands); imprime as linhas exactas para colar.
- A detecção usa o plugin cache (`~/.claude/plugins/cache`), que é onde o Claude Code instala plugins. Se o utilizador usar um caminho não-standard via `CLAUDE_CONFIG_DIR`, ajustar o glob.

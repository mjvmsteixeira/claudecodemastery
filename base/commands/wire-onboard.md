---
name: wire-onboard
description: Setup wizard end-to-end do ecossistema Wire — detecta plugins instalados (base/secops/devkit), guia a instalação dos que faltam e sugere smoke tests por plugin. Idempotente.
allowed-tools: Bash, Read
---

# /wire-onboard

Setup wizard do ecossistema Wire. Detecta o estado actual, guia a instalação dos plugins em falta e propõe um smoke test por plugin. Não executa `/plugin install` directamente (Claude Code não permite a partir de um command) — emite as linhas exactas para o utilizador colar.

## Passo 1 — Detectar plugins instalados

```bash
echo "=== Detectando plugins Wire instalados ==="
for p in wire-base wire-secops wire-devkit; do
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

**Se `wire-base` em falta** (instalar **primeiro** — outros plugins assumem-no):

```
/plugin marketplace add mjvmsteixeira/claudecodemastery
/plugin install wire-base@jump2new
```

O `wire-base` traz: `vault-toolkit` (5 commands `/vault-*`), skills `mempalace-doctor` e `claude-deep-audit`, hook `SessionStart` de auto-unseal do Vault local, libs partilhadas (`lib/vault-env.sh`, `lib/wire-common.sh`).

**Se `wire-secops` em falta** (precisa do base):

```
/plugin install wire-secops@jump2new
```

Traz: 6 agents `wire-*-01`, 6 skills, 9 commands `/wire-*`, cadeia de hooks PreToolUse/PostToolUse/Stop, `vault-policies.hcl`. Específico do contexto SaaS multi-tenant.

**Se `wire-devkit` em falta** (independente do base; só `/ngrok-expose` precisa):

```
/plugin install wire-devkit@jump2new
```

Traz: 6 audits no modelo B+C (full-audit, security-scan, infra-audit, ux-audit, code-quality, performance-audit), agente `local-reviewer` e `/ngrok-expose`.

Se a marketplace `mjvmsteixeira/claudecodemastery` ainda não estiver adicionada (caso `wire-base` seja o primeiro), incluir o `/plugin marketplace add` antes do primeiro install.

## Passo 3 — Smoke tests por plugin já instalado

Para os plugins **instalados** no Passo 1, propor `/wire-smoke` — cada plugin shippa um `smoke.sh` próprio (read-only, ~2s) que confirma libs carregam, hooks executáveis e ferramentas opcionais detectadas:

```
Sugerido · sanity check dos plugins instalados:
  /wire-smoke          # corre os smokes de todos os plugins instalados
  /wire-smoke base     # ou só um
```

Exit codes:
- `0` — tudo ok
- `1` — falhas críticas (reinstalar)
- `2` — só warnings (ferramentas opcionais como `ollama`/`ngrok`/`~/vault/` em falta — degradação aceitável)

Smoke tests operacionais (mais pesados) ficam como sugestões secundárias por plugin instalado:

- **`wire-base`** · `/vault-list` (segredos do projecto actual) · esperado: lista de paths em `secret/projects/<projecto>/*` mais partilhados (`secret/ai`, `secret/tokens`).
- **`wire-secops`** · `/wire-stack-doctor` · esperado: verde/amarelo/vermelho por componente (Vault, Wazuh, Fortigate, Zabbix). Pode falhar fora da VPN — é normal.
- **`wire-devkit`** · `/full-audit --ci` num projecto qualquer · esperado: JSON consolidado com counts e exit code 0/1/2.

## Passo 4 — Configuração opcional do modo operacional

Se nenhum dos plugins detectou problemas, propor configurar `WIRE_OPERATING_MODE`:

```bash
if [ ! -f ~/.wire/mode ]; then
  cat <<'EOF'
Próximo opcional · configurar modo operacional dos plugins Wire:
  mkdir -p ~/.wire
  echo prod > ~/.wire/mode   # padrão; hooks fail-closed em violações
  # ou:
  echo dev  > ~/.wire/mode   # warn-only nos hooks; ideal para formação/demos

O modo é lido pelo wire_mode da wire-common.sh e respeitado por todos os hooks.
EOF
fi
```

## Passo 5 — Relatório final

Imprimir resumo: quantos plugins instalados (X/3), próximas acções pendentes (se houver), e ponteiro para os CHANGELOGs:

```
=== RESUMO ===
Plugins Wire instalados: X/3
Modo operacional configurado: <prod/dev/lab/não>
Próximas acções: [lista de items dos passos 2 e 3 que ficaram pendentes]

CHANGELOGs:
  ~/.claude/plugins/cache/*/wire-base/*/CHANGELOG.md
  ~/.claude/plugins/cache/*/wire-secops/*/CHANGELOG.md
  ~/.claude/plugins/cache/*/wire-devkit/*/CHANGELOG.md
```

## Passo 6 — Health check final (closes the loop)

Se **todos os plugins recomendados** detectados no Passo 1 estiverem instalados (3/3 ou os 2 hard-required: base + secops), sugerir corrida imediata do `/wire-doctor` para fechar o ciclo com diagnóstico real:

```
Próximo · sanity check completo do setup:
  /wire-doctor

Read-only · orquestra mempalace-doctor + claude-deep-audit + /vault-audit
+ /wire-vault-doctor (se secops instalado) em paralelo, consolida num
relatório único.
```

Se houver gaps (X/3 < 2), saltar este passo — fazer o doctor antes de ter o ecossistema mínimo só gera ruído.

## Notas

- Idempotente — re-correr não reinstala nada, apenas reporta o estado actual.
- Não executa `/plugin install` directamente (Claude Code não o permite a partir de slash commands); imprime as linhas exactas para colar.
- A detecção usa o plugin cache (`~/.claude/plugins/cache`), que é onde o Claude Code instala plugins. Se o utilizador usar um caminho não-standard via `CLAUDE_CONFIG_DIR`, ajustar o glob.

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

Para cada plugin **instalado** no Passo 1, sugerir o smoke test correspondente. Não executar automaticamente — descrever o resultado esperado:

**`wire-base`:**

```bash
# Vault local — listar segredos do projecto actual
echo "Sugerido: corre /vault-list"
echo "Esperado: lista de segredos em secret/projects/<projecto> + partilhados (secret/ai, secret/tokens)."
echo "Se o Vault estiver sealed, o hook SessionStart já tentou unseal; ver mensagem do hook."
```

**`wire-secops`:**

```bash
echo "Sugerido: corre /wire-stack-doctor"
echo "Esperado: diagnóstico global da stack (Vault, Wazuh, Fortigate, Zabbix) com verde/amarelo/vermelho por componente."
echo "Pode falhar se não estiveres na rede onde a stack vive — é normal num laptop fora da VPN."
```

**`wire-devkit`:**

```bash
echo "Sugerido: corre /full-audit --ci em qualquer projecto"
echo "Esperado: JSON consolidado com counts CRITICAL/HIGH/MEDIUM/LOW por audit, exit code 0/1/2 conforme severidade."
echo "Aviso: corre os 5 audits em paralelo; pode demorar 30-90s consoante o projecto."
```

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

## Notas

- Idempotente — re-correr não reinstala nada, apenas reporta o estado actual.
- Não executa `/plugin install` directamente (Claude Code não o permite a partir de slash commands); imprime as linhas exactas para colar.
- A detecção usa o plugin cache (`~/.claude/plugins/cache`), que é onde o Claude Code instala plugins. Se o utilizador usar um caminho não-standard via `CLAUDE_CONFIG_DIR`, ajustar o glob.

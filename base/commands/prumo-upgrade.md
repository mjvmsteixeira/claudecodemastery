---
name: prumo-upgrade
description: Verifica se há versões mais recentes dos plugins prumo (base/secops/devkit) no marketplace remoto. Compara versão instalada (cache local) com a remota (raw GitHub). Read-only — não auto-instala, emite as linhas /plugin install para colar.
allowed-tools: Bash, Read
---

# /prumo-upgrade

Verifica se há updates dos plugins prumo instalados. Read-only — só reporta. Para actualizar, o utilizador cola as linhas de install emitidas.

## Passo 1 — Detectar versões locais

```bash
echo "=== Versões instaladas localmente ==="
declare -A LOCAL_VER
for p in prumo-base prumo-secops prumo-devkit; do
  manifest=$(find ~/.claude/plugins/cache -path "*/${p}/*/.claude-plugin/plugin.json" 2>/dev/null \
             | sort -V | tail -1)
  if [ -n "$manifest" ]; then
    v=$(jq -r .version "$manifest" 2>/dev/null || echo "?")
    LOCAL_VER[$p]="$v"
    echo "  ✓ $p · v$v"
  else
    LOCAL_VER[$p]="(não instalado)"
    echo "  ✗ $p · não instalado"
  fi
done
```

## Passo 2 — Fetch das versões remotas

Raw GitHub é a fonte de verdade do marketplace `prumo`:

```bash
echo
echo "=== Versões remotas (raw GitHub · main) ==="
declare -A REMOTE_VER
RAW_BASE="https://raw.githubusercontent.com/mjvmsteixeira/claudecodemastery/main"

for p in base secops devkit; do
  plugin_name="prumo-$p"
  url="$RAW_BASE/$p/.claude-plugin/plugin.json"
  remote_v=$(curl -fsSL --max-time 5 "$url" 2>/dev/null | jq -r .version 2>/dev/null)
  if [ -n "$remote_v" ] && [ "$remote_v" != "null" ]; then
    REMOTE_VER[$plugin_name]="$remote_v"
    echo "  · $plugin_name · v$remote_v"
  else
    REMOTE_VER[$plugin_name]="(unreachable)"
    echo "  ! $plugin_name · raw GitHub inacessível"
  fi
done
```

Se nenhum dos três responder, é provável problema de rede (offline, VPN bloqueando github raw) — abortar com mensagem clara em vez de assumir tudo desactualizado.

## Passo 3 — Comparar e reportar

Para cada plugin com versão local e remota válidas, comparar via `sort -V`:

```bash
echo
echo "=== Diff ==="
UPDATES_AVAILABLE=()

for p in prumo-base prumo-secops prumo-devkit; do
  local_v="${LOCAL_VER[$p]}"
  remote_v="${REMOTE_VER[$p]}"

  # Skips óbvios
  [ "$local_v" = "(não instalado)" ] && { echo "  · $p · skip (não instalado)"; continue; }
  [ "$remote_v" = "(unreachable)" ]  && { echo "  ! $p · skip (raw inacessível)"; continue; }

  # Comparar via sort -V (semver)
  newer=$(printf '%s\n%s\n' "$local_v" "$remote_v" | sort -V | tail -1)

  if [ "$local_v" = "$remote_v" ]; then
    echo "  ✓ $p · v$local_v (up to date)"
  elif [ "$newer" = "$remote_v" ]; then
    echo "  ⬆ $p · v$local_v → v$remote_v · UPDATE DISPONÍVEL"
    UPDATES_AVAILABLE+=("$p")
  else
    # local > remote (dev local, raro)
    echo "  ↯ $p · v$local_v local > v$remote_v remote (dev / pre-release?)"
  fi
done
```

## Passo 4 — Linhas de install para colar

Se houver pelo menos um update, imprimir o bloco de install. Não executar (Claude Code não permite `/plugin install` a partir de um command):

```bash
if [ "${#UPDATES_AVAILABLE[@]}" -gt 0 ]; then
  echo
  echo "=== Para actualizar (cola estas linhas) ==="
  for p in "${UPDATES_AVAILABLE[@]}"; do
    echo "/plugin install $p@prumo"
  done
  echo
  echo "Notas:"
  echo "  · /plugin install actualiza in-place quando a versão remota é mais recente."
  echo "  · Reler CHANGELOG.md de cada plugin para ver o que mudou:"
  for p in "${UPDATES_AVAILABLE[@]}"; do
    echo "      ~/.claude/plugins/cache/*/$p/*/CHANGELOG.md"
  done
fi
```

## Passo 5 — Mensagem final

Caso tudo esteja up to date:

```
=== Tudo actualizado ===
Os 3 plugins prumo (base, secops, devkit) estão na versão mais recente do marketplace prumo.
Próxima sanity check: /prumo-doctor
```

## Notas

- Read-only · nenhum estado é alterado.
- Compara via `sort -V` (semver) — funciona para 0.1.0, 0.2.0-rc1, 1.0.0 etc.
- Se a raw GitHub estiver inacessível (offline, VPN), reporta-o e sai sem decidir nada.
- Tag git e versão no `plugin.json` devem permanecer em sync — o `validate.sh` não força isso ainda.
- Para uma sessão totalmente nova num laptop, preferir `/prumo-onboard`; o `/prumo-upgrade` assume que pelo menos um plugin já está instalado.

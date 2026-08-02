---
name: prumo-upgrade
description: Verifica se há versões mais recentes dos plugins prumo declarados no marketplace.json no marketplace remoto. Compara versão instalada (cache local) com a remota (raw GitHub). Read-only — não auto-instala, emite as linhas /plugin install para colar.
allowed-tools: Bash, Read
---

# /prumo-upgrade

Verifica se há updates dos plugins prumo instalados. Read-only — só reporta. Para actualizar, o utilizador cola as linhas de install emitidas.

## Passo 1 — Detectar versões locais

A lista de plugins **não é escrita aqui** — sai do `marketplace.json` via `prumo_plugins`. Ver a nota no fim do Passo 2 sobre porquê.

```bash
echo "=== Versões instaladas localmente ==="

. "${CLAUDE_PLUGIN_ROOT}/lib/prumo-common.sh" 2>/dev/null || {
  echo "  ✗ lib/prumo-common.sh ilegível — sem ela a lista de plugins não é derivável."
  echo "    Um upgrade-check sobre uma lista adivinhada reporta 'em dia' sobre o que não viu. Abortar."
  exit 1
}

declare -A LOCAL_VER
PLUGIN_PAIRS="$(prumo_plugins pair)"

while IFS=' ' read -r p _dir; do
  [ -n "$p" ] || continue
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
done <<EOF
$PLUGIN_PAIRS
EOF
```

**Heredoc, nunca `for p in $(prumo_plugins)`.** Em zsh a substituição de comando não sofre word-splitting: o loop correria uma vez com a lista inteira como um só item, e reportaria um plugin fantasma chamado `prumo-base prumo-secops …`. O heredoc também evita o subshell de um pipe, que perderia o `LOCAL_VER`.

## Passo 2 — Fetch das versões remotas

Raw GitHub é a fonte de verdade do marketplace `prumo`:

```bash
echo
echo "=== Versões remotas (raw GitHub · main) ==="
declare -A REMOTE_VER
RAW_BASE="https://raw.githubusercontent.com/mjvmsteixeira/claudecodemastery/main"

while IFS=' ' read -r plugin_name dir; do
  [ -n "$dir" ] || continue
  url="$RAW_BASE/$dir/.claude-plugin/plugin.json"
  remote_v=$(curl -fsSL --max-time 5 "$url" 2>/dev/null | jq -r .version 2>/dev/null)
  if [ -n "$remote_v" ] && [ "$remote_v" != "null" ]; then
    REMOTE_VER[$plugin_name]="$remote_v"
    echo "  · $plugin_name · v$remote_v"
  else
    REMOTE_VER[$plugin_name]="(unreachable)"
    echo "  ! $plugin_name · raw GitHub inacessível"
  fi
done <<EOF
$PLUGIN_PAIRS
EOF
```

A directoria vem do `.source` do marketplace, não de remover o prefixo `prumo-` ao nome. São a mesma coisa hoje; é a declaração que manda se um dia deixarem de ser.

Se nenhum responder, é provável problema de rede (offline, VPN a bloquear github raw) — abortar com mensagem clara em vez de assumir tudo desactualizado.

**Porque é que isto é derivado e não escrito.** O `prumo-design` esteve fora dos três loops deste command desde que foi criado, e o sintoma foi o pior possível: reportava *"tudo actualizado"* com toda a confiança sobre **75%** do marketplace. Nada falhou, nada avisou. A mesma omissão aconteceu três vezes em sítios diferentes — daí a lista sair agora do `marketplace.json`, que é a source of truth declarada no `CLAUDE.md` do repo.

Se o `marketplace.json` não for legível, o `prumo_plugins` cai num fallback estático **e avisa em stderr**. Um fallback silencioso reproduziria exactamente o defeito que isto corrige.

## Passo 3 — Comparar e reportar

Para cada plugin com versão local e remota válidas, comparar via `sort -V`:

```bash
echo
echo "=== Diff ==="
UPDATES_AVAILABLE=()

while IFS=' ' read -r p _dir; do
  [ -n "$p" ] || continue
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
done <<EOF
$PLUGIN_PAIRS
EOF
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
Todos os plugins declarados no marketplace.json estão na versão mais recente.
Próxima sanity check: /prumo-doctor
```

## Notas

- Read-only · nenhum estado é alterado.
- Compara via `sort -V` (semver) — funciona para 0.1.0, 0.2.0-rc1, 1.0.0 etc.
- Se a raw GitHub estiver inacessível (offline, VPN), reporta-o e sai sem decidir nada.
- Tag git e versão no `plugin.json` devem permanecer em sync — o `validate.sh` não força isso ainda.
- Para uma sessão totalmente nova num laptop, preferir `/prumo-onboard`; o `/prumo-upgrade` assume que pelo menos um plugin já está instalado.

#!/usr/bin/env bash
# scripts/validate.sh — bateria de checks estáticos sobre os 3 plugins jump2new.
#
# Verifica:
#   1. plugin.json e marketplace.json são JSON válidos
#   2. campos obrigatórios (name, version, description) presentes
#   3. hooks/*.sh têm shebang e bit de execução
#   4. hooks.json referencia ficheiros existentes
#   5. SKILL.md tem frontmatter com 'name' e 'description'
#   6. commands/*.md tem frontmatter com 'name' e 'description'
#   7. (opcional) shellcheck sobre hooks/*.sh e lib/*.sh
#
# Uso:
#   ./scripts/validate.sh                  # corre tudo
#   ./scripts/validate.sh --skip-shellcheck
#   ./scripts/validate.sh --plugin base    # limita a um plugin
#
# Saída:
#   exit 0  — tudo passou
#   exit 1  — encontrados problemas (lista impressa)
#   exit 2  — erro de invocação / ferramenta em falta

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
cd "$REPO_ROOT"

# ──────────────────────── args ────────────────────────
SKIP_SHELLCHECK=0
ONLY_PLUGIN=""
while [ $# -gt 0 ]; do
  case "$1" in
    --skip-shellcheck) SKIP_SHELLCHECK=1; shift ;;
    --plugin) ONLY_PLUGIN="${2:-}"; shift 2 ;;
    -h|--help)
      grep -E '^# ' "$0" | sed 's/^# \{0,1\}//' | head -25
      exit 0
      ;;
    *) echo "validate.sh: argumento desconhecido: $1" >&2; exit 2 ;;
  esac
done

# ──────────────────────── pretty-print ────────────────────────
RED=$'\033[0;31m'; YELLOW=$'\033[0;33m'; GREEN=$'\033[0;32m'; DIM=$'\033[2m'; RESET=$'\033[0m'
[ -t 1 ] || { RED=""; YELLOW=""; GREEN=""; DIM=""; RESET=""; }

ERRORS=0
WARNS=0

fail()  { echo "${RED}✗${RESET} $*"; ERRORS=$((ERRORS+1)); }
warn()  { echo "${YELLOW}!${RESET} $*"; WARNS=$((WARNS+1)); }
pass()  { echo "${GREEN}✓${RESET} $*"; }
info()  { echo "${DIM}·${RESET} $*"; }

section() { echo; echo "── $1 ──"; }

# ──────────────────────── dep checks ────────────────────────
have_jq=1
command -v jq >/dev/null 2>&1 || { warn "jq não encontrado — validação JSON limitada"; have_jq=0; }

have_shellcheck=1
if [ $SKIP_SHELLCHECK -eq 0 ]; then
  command -v shellcheck >/dev/null 2>&1 || {
    warn "shellcheck não encontrado — instala via 'brew install shellcheck' para apanhar mais bugs"
    have_shellcheck=0
  }
fi

# ──────────────────────── inventário ────────────────────────
PLUGINS=("base" "secops" "devkit")
if [ -n "$ONLY_PLUGIN" ]; then
  case " ${PLUGINS[*]} " in
    *" $ONLY_PLUGIN "*) PLUGINS=("$ONLY_PLUGIN") ;;
    *) echo "validate.sh: --plugin $ONLY_PLUGIN não é um dos 3 plugins (base|secops|devkit)" >&2; exit 2 ;;
  esac
fi

# ──────────────────────── 1. marketplace.json ────────────────────────
section "marketplace.json"

MP=".claude-plugin/marketplace.json"
if [ ! -f "$MP" ]; then
  fail "$MP não existe"
else
  if [ $have_jq -eq 1 ]; then
    if jq empty "$MP" 2>/dev/null; then
      pass "$MP é JSON válido"
      MP_NAME=$(jq -r '.name // empty' "$MP")
      [ -z "$MP_NAME" ] && fail "$MP: campo 'name' em falta" || info "name: $MP_NAME"
      MP_PLUGINS=$(jq -r '.plugins[].name' "$MP" 2>/dev/null)
      [ -z "$MP_PLUGINS" ] && fail "$MP: array 'plugins[]' vazio ou em falta" || \
        info "plugins declarados: $(echo "$MP_PLUGINS" | tr '\n' ' ')"
    else
      fail "$MP: JSON inválido (jq não consegue parse)"
    fi
  else
    python3 -c "import json,sys; json.load(open('$MP'))" 2>/dev/null && \
      pass "$MP é JSON válido (via python3)" || fail "$MP: JSON inválido"
  fi
fi

# ──────────────────────── 2. plugin.json ────────────────────────
section "plugin.json (per plugin)"

for p in "${PLUGINS[@]}"; do
  manifest="$p/.claude-plugin/plugin.json"
  if [ ! -f "$manifest" ]; then
    fail "$manifest não existe"
    continue
  fi

  if [ $have_jq -eq 1 ]; then
    if ! jq empty "$manifest" 2>/dev/null; then
      fail "$manifest: JSON inválido"
      continue
    fi
    for field in name version description; do
      val=$(jq -r ".${field} // empty" "$manifest")
      if [ -z "$val" ]; then
        fail "$manifest: campo '$field' em falta ou vazio"
      fi
    done
    n=$(jq -r '.name' "$manifest")
    v=$(jq -r '.version' "$manifest")
    expected_name="wire-$p"
    if [ "$n" != "$expected_name" ]; then
      fail "$manifest: name='$n' não bate com 'wire-$p'"
    fi
    pass "$manifest: $n v$v"
  else
    python3 -c "import json; json.load(open('$manifest'))" 2>/dev/null && \
      pass "$manifest é JSON válido (via python3)" || fail "$manifest: JSON inválido"
  fi
done

# ──────────────────────── 3. hooks ────────────────────────
section "hooks/ (per plugin)"

for p in "${PLUGINS[@]}"; do
  hooks_json="$p/hooks/hooks.json"
  [ ! -f "$hooks_json" ] && { info "$p: sem hooks/ (ok)"; continue; }

  if [ $have_jq -eq 1 ]; then
    if ! jq empty "$hooks_json" 2>/dev/null; then
      fail "$hooks_json: JSON inválido"
      continue
    fi
    # extrai todos os comandos referenciados; troca ${CLAUDE_PLUGIN_ROOT} pelo path do plugin
    referenced=$(jq -r '
      [.hooks[][] | .hooks[]? | select(.type=="command") | .command]
      | unique
      | .[]
    ' "$hooks_json")

    echo "$referenced" | while IFS= read -r cmd; do
      [ -z "$cmd" ] && continue
      # primeiro token (executável); ignora 'bash' / args
      first_tok=$(echo "$cmd" | awk '{print $1}')
      path_tok=$(echo "$cmd" | grep -oE '\${CLAUDE_PLUGIN_ROOT}[^ ]*')
      [ -z "$path_tok" ] && path_tok="$first_tok"
      resolved="${path_tok/\$\{CLAUDE_PLUGIN_ROOT\}/$p}"
      if [ ! -f "$resolved" ]; then
        echo "FAIL-HOOK-MISSING:$resolved"
      fi
    done | while IFS=: read -r tag path; do
      [ "$tag" = "FAIL-HOOK-MISSING" ] && fail "$hooks_json referencia ficheiro inexistente: $path"
    done
  fi

  # bit de execução + shebang em cada .sh
  for sh in "$p"/hooks/*.sh; do
    [ ! -f "$sh" ] && continue
    if [ ! -x "$sh" ]; then
      fail "$sh: sem bit de execução (chmod +x)"
    fi
    if ! head -n1 "$sh" | grep -qE '^#!'; then
      fail "$sh: sem shebang na primeira linha"
    fi
  done

  pass "$p/hooks/ validados"
done

# ──────────────────────── 3b. smoke.sh (per plugin) ────────────────────────
section "smoke.sh (per plugin)"

for p in "${PLUGINS[@]}"; do
  smoke="$p/smoke.sh"
  if [ -f "$smoke" ]; then
    if [ ! -x "$smoke" ]; then
      fail "$smoke: sem bit de execução"
    fi
    if ! head -n1 "$smoke" | grep -qE '^#!'; then
      fail "$smoke: sem shebang"
    fi
    pass "$smoke"
  else
    warn "$p/smoke.sh ausente (sanity-check do plugin não disponível via /wire-smoke)"
  fi
done

# ──────────────────────── 4. lib/*.sh ────────────────────────
section "lib/ (per plugin)"

for p in "${PLUGINS[@]}"; do
  [ ! -d "$p/lib" ] && { info "$p: sem lib/ (ok)"; continue; }
  for sh in "$p"/lib/*.sh; do
    [ ! -f "$sh" ] && continue
    if ! head -n1 "$sh" | grep -qE '^#!'; then
      fail "$sh: sem shebang"
    fi
    # libs não precisam de bit de execução (são sourced), mas é boa prática
    pass "$sh"
  done
done

# ──────────────────────── 5. skills ────────────────────────
section "skills/<name>/SKILL.md (per plugin)"

for p in "${PLUGINS[@]}"; do
  [ ! -d "$p/skills" ] && { info "$p: sem skills/ (ok)"; continue; }
  for sk in "$p"/skills/*/SKILL.md; do
    [ ! -f "$sk" ] && continue
    # frontmatter: as primeiras linhas devem começar com --- e ter name+description
    if ! head -n1 "$sk" | grep -q '^---$'; then
      fail "$sk: sem frontmatter (primeira linha não é '---')"
      continue
    fi
    fm=$(awk '/^---$/{c++; next} c==1' "$sk")
    if ! echo "$fm" | grep -qE '^name:'; then
      fail "$sk: frontmatter sem campo 'name:'"
    fi
    if ! echo "$fm" | grep -qE '^description:'; then
      fail "$sk: frontmatter sem campo 'description:'"
    fi
    # name deve bater com o nome do directório
    dir_name=$(basename "$(dirname "$sk")")
    fm_name=$(echo "$fm" | awk -F': *' '/^name:/{print $2; exit}')
    if [ -n "$fm_name" ] && [ "$fm_name" != "$dir_name" ]; then
      warn "$sk: frontmatter name='$fm_name' difere do directório '$dir_name'"
    fi
  done
  pass "$p/skills/ validadas"
done

# ──────────────────────── 6. commands ────────────────────────
section "commands/*.md (per plugin)"

for p in "${PLUGINS[@]}"; do
  [ ! -d "$p/commands" ] && { info "$p: sem commands/ (ok)"; continue; }
  for cm in "$p"/commands/*.md; do
    [ ! -f "$cm" ] && continue
    if ! head -n1 "$cm" | grep -q '^---$'; then
      fail "$cm: sem frontmatter"
      continue
    fi
    fm=$(awk '/^---$/{c++; next} c==1' "$cm")
    if ! echo "$fm" | grep -qE '^name:'; then
      fail "$cm: frontmatter sem 'name:'"
    fi
    if ! echo "$fm" | grep -qE '^description:'; then
      fail "$cm: frontmatter sem 'description:'"
    fi
    base_name=$(basename "$cm" .md)
    fm_name=$(echo "$fm" | awk -F': *' '/^name:/{print $2; exit}')
    if [ -n "$fm_name" ] && [ "$fm_name" != "$base_name" ]; then
      warn "$cm: frontmatter name='$fm_name' difere do ficheiro '$base_name'"
    fi
  done
  pass "$p/commands/ validados"
done

# ──────────────────────── 7. agents ────────────────────────
section "agents/*.md (per plugin)"

for p in "${PLUGINS[@]}"; do
  [ ! -d "$p/agents" ] && { info "$p: sem agents/ (ok)"; continue; }
  for ag in "$p"/agents/*.md; do
    [ ! -f "$ag" ] && continue
    if ! head -n1 "$ag" | grep -q '^---$'; then
      fail "$ag: sem frontmatter"
      continue
    fi
  done
  pass "$p/agents/ validados"
done

# ──────────────────────── 8. shellcheck (opcional) ────────────────────────
if [ $SKIP_SHELLCHECK -eq 0 ] && [ $have_shellcheck -eq 1 ]; then
  section "shellcheck (hooks + lib)"
  for p in "${PLUGINS[@]}"; do
    for sh in "$p"/hooks/*.sh "$p"/lib/*.sh; do
      [ ! -f "$sh" ] && continue
      if shellcheck -x -e SC1091 "$sh" >/dev/null 2>&1; then
        pass "$sh"
      else
        warn "$sh: shellcheck reportou issues (corre 'shellcheck $sh' para detalhe)"
      fi
    done
  done
fi

# ──────────────────────── resumo ────────────────────────
echo
echo "──────────────────────────────────────────"
echo "Total: ${RED}${ERRORS} erro(s)${RESET} · ${YELLOW}${WARNS} aviso(s)${RESET}"
echo "──────────────────────────────────────────"

[ $ERRORS -gt 0 ] && exit 1
exit 0

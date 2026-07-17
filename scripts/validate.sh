#!/usr/bin/env bash
# scripts/validate.sh — bateria de checks estáticos sobre os 4 plugins prumo.
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
cd "$REPO_ROOT" || { echo "✗ cd para REPO_ROOT falhou: $REPO_ROOT" >&2; exit 2; }

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
PLUGINS=("base" "secops" "devkit" "design")
if [ -n "$ONLY_PLUGIN" ]; then
  case " ${PLUGINS[*]} " in
    *" $ONLY_PLUGIN "*) PLUGINS=("$ONLY_PLUGIN") ;;
    *) echo "validate.sh: --plugin $ONLY_PLUGIN não é um dos 4 plugins (base|secops|devkit|design)" >&2; exit 2 ;;
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
    expected_name="prumo-$p"
    if [ "$n" != "$expected_name" ]; then
      fail "$manifest: name='$n' não bate com 'prumo-$p'"
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

    # NOTA: o loop de deteção corre num pipe (subshell) e só EMITE os paths em
    # falta para stdout — nunca chama fail() lá dentro. O fail() (que incrementa
    # $ERRORS) corre no while alimentado por here-string, que executa no shell
    # principal. Chamar fail() dentro do pipe perdia o incremento de $ERRORS e
    # produzia um falso-verde (exit 0 com hook em falta).
    missing=$(echo "$referenced" | while IFS= read -r cmd; do
      [ -z "$cmd" ] && continue
      # primeiro token (executável); ignora 'bash' / args
      first_tok=$(echo "$cmd" | awk '{print $1}')
      path_tok=$(echo "$cmd" | grep -oE '\${CLAUDE_PLUGIN_ROOT}[^ ]*')
      [ -z "$path_tok" ] && path_tok="$first_tok"
      resolved="${path_tok/\$\{CLAUDE_PLUGIN_ROOT\}/$p}"
      if [ ! -f "$resolved" ]; then
        echo "$resolved"
      fi
    done)
    if [ -n "$missing" ]; then
      while IFS= read -r path; do
        [ -z "$path" ] && continue
        fail "$hooks_json referencia ficheiro inexistente: $path"
      done <<< "$missing"
    fi
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

# ──────────────────────── 3c. convenção: bloquear via prumo_fail_or_warn ────────────────────────
# O CLAUDE.md do repo manda os hooks bloquearem por prumo_fail_or_warn/prumo_require
# (que respeitam PRUMO_OPERATING_MODE), com uma única excepção documentada: o
# approval-gate, fail-closed por desenho. Um `exit 2` cru em qualquer outro hook
# torna o modo inoperante para esse gate — foi assim que o pii-redact ignorou
# `/prumo-mode dev` durante três releases sem ninguém dar por isso.
section "convenção: hooks bloqueiam via prumo_fail_or_warn (respeitam o modo)"

# Excepções: hooks fail-closed por desenho, justificados no CLAUDE.md do repo.
FAILCLOSED_EXEMPT="pre-tool-approval-gate.sh"

for p in "${PLUGINS[@]}"; do
  [ -d "$p/hooks" ] || continue
  for sh in "$p"/hooks/*.sh; do
    [ -f "$sh" ] || continue
    base_sh=$(basename "$sh")
    # _lib.sh define o próprio stub de fail_or_warn — o exit 2 lá dentro é a
    # implementação, não uma violação.
    [ "$base_sh" = "_lib.sh" ] && continue
    # Ignora o `exit 2` que está DENTRO de uma definição local de
    # prumo_fail_or_warn — vários hooks trazem um stub de fallback para quando a
    # lib do prumo-base não carrega, e aí o exit 2 é a implementação da própria
    # convenção (o stub testa prumo_is_dev), não uma violação dela.
    raw_exit=$(awk '
      /^[[:space:]]*prumo_fail_or_warn\(\)/ { in_stub=1; depth=0 }
      in_stub {
        depth += gsub(/\{/, "{"); depth -= gsub(/\}/, "}")
        if (depth <= 0 && /\}/) in_stub=0
        next
      }
      /^[[:space:]]*exit 2([[:space:]]|$)/ { n++ }
      END { print n+0 }
    ' "$sh")
    [ "$raw_exit" -eq 0 ] && continue
    if [ "$base_sh" = "$FAILCLOSED_EXEMPT" ]; then
      info "$sh: exit 2 cru — excepção documentada (fail-closed por desenho)"
    else
      fail "$sh: bloqueia com 'exit 2' cru em vez de prumo_fail_or_warn — ignora PRUMO_OPERATING_MODE (ver CLAUDE.md § Convenções)"
    fi
  done
done

# ──────────────────────── 3d. remediação não promete prefixo inline ────────────────────────
# Um hook PreToolUse corre no ambiente do Claude Code, antes do comando e noutro
# processo: `PRUMO_X=1 <comando>` aplica-se ao filho e nunca ao hook. Uma mensagem
# que mande fazer isso é impossível de seguir, e o efeito prático é o agente
# ofuscar o input até passar — que é o oposto do que um gate auditável quer.
section "remediação dos hooks não promete prefixo inline de env var"

inline_promise=0
for p in "${PLUGINS[@]}"; do
  [ -d "$p/hooks" ] || continue
  for sh in "$p"/hooks/*.sh; do
    [ -f "$sh" ] || continue
    # Ignora linhas de comentário: o idioma aparece lá legitimamente, a explicar
    # porque é que NÃO se usa. Só interessa o que chega ao utilizador.
    if grep -vE '^[[:space:]]*#' "$sh" | grep -qE 'PRUMO_[A-Z_]+=[^[:space:]]+[[:space:]]+<comando>'; then
      fail "$sh: mensagem manda usar 'PRUMO_...=x <comando>' — prefixo inline não chega a um hook PreToolUse; apontar para settings.json → env ou /prumo-mode"
      inline_promise=1
    fi
  done
done
[ $inline_promise -eq 0 ] && pass "nenhum hook promete desbloqueio por prefixo inline"

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
    warn "$p/smoke.sh ausente (sanity-check do plugin não disponível via /prumo-smoke)"
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

# ──────────────────────── 7b. descriptions sem promessas perigosas ────────────────────────
section "descriptions: anti-padrões de auto-fix"

# Padrões que NÃO podem aparecer em frontmatter description: de SKILL.md ou
# commands/*.md. Histórico: a v0.2.0 do wire-devkit prometia "fora do modo CI,
# corrige TODOS os issues automaticamente sem perguntar" no full-audit, o que
# autorizou apagar initializers/middleware num dev shell. Esta verificação previne
# regressão. Ver devkit/CLAUDE.md (Safety convention).
DENY_RE='(sem perguntar|corrige TODOS|auto-?fix de tudo|automaticamente sem|without asking|without confirmation)'

for p in "${PLUGINS[@]}"; do
  for f in "$p"/skills/*/SKILL.md "$p"/commands/*.md; do
    [ ! -f "$f" ] && continue
    fm=$(awk '/^---$/{c++; next} c==1' "$f")
    if echo "$fm" | grep -qiE "$DENY_RE"; then
      hit=$(echo "$fm" | grep -iEo "$DENY_RE" | head -1)
      fail "$f: description contém anti-padrão de auto-fix ('$hit') — ver devkit/CLAUDE.md (Safety convention)"
    fi
  done
done
[ $ERRORS -eq 0 ] && pass "nenhuma description promete auto-fix sem confirmação"

# ──────────────────────── 7c. hook allowlist contém bootstrap patterns ────────────────────────
section "secops/hooks/pre-tool-vault-ttl.sh: allowlist de bootstraps"

ttl_hook="secops/hooks/pre-tool-vault-ttl.sh"
if [ -f "$ttl_hook" ]; then
  missing_allowlist=()
  for pat in prumo-vault-bootstrap prumo-secops-bootstrap prumo-vault-kv-migrate; do
    grep -q "'${pat}'" "$ttl_hook" || missing_allowlist+=("$pat")
  done
  if [ "${#missing_allowlist[@]}" -eq 0 ]; then
    pass "$ttl_hook contém os 3 patterns de bootstrap/migrate"
  else
    fail "$ttl_hook não contém patterns: ${missing_allowlist[*]} (ver plano 2026-05-19-wire-vault-bootstraps)"
  fi
else
  info "$ttl_hook ausente — check skip"
fi

# ──────────────────────── 8. shellcheck (opcional) ────────────────────────
if [ $SKIP_SHELLCHECK -eq 0 ] && [ $have_shellcheck -eq 1 ]; then
  section "shellcheck (hooks + lib + skill scripts)"
  for p in "${PLUGINS[@]}"; do
    for sh in "$p"/hooks/*.sh "$p"/lib/*.sh "$p"/skills/*/scripts/*.sh; do
      [ ! -f "$sh" ] && continue
      if shellcheck -x -e SC1091 "$sh" >/dev/null 2>&1; then
        pass "$sh"
      else
        warn "$sh: shellcheck reportou issues (corre 'shellcheck $sh' para detalhe)"
      fi
    done
  done
fi

# ──────────────────────── 9. eval-harness (regressão dos hooks) ────────────────────────
if [ -z "$ONLY_PLUGIN" ] && [ -x "$REPO_ROOT/scripts/eval/run.sh" ]; then
  section "eval-harness (corpus de regressão dos hooks)"
  # uma só invocação: o exit code decide pass/fail e o JSON dá a contagem
  if harness_json=$("$REPO_ROOT/scripts/eval/run.sh" --json 2>/dev/null); then
    n=$(printf '%s' "$harness_json" | jq -r '.total')
    pass "corpus verde (${n}/${n} casos)"
  else
    fail "corpus com mismatch — corre ./scripts/eval/run.sh para detalhe"
  fi

  # camada B: a lógica de decisão por veredicto (safe/unsafe/uncertain) do
  # guardrail semântico só é exercida pelo live-test com stub — o corpus hermético
  # aponta o Ollama a uma porta morta e curto-circuita no ramo fail-closed antes do
  # parse do enum. Sem isto, uma regressão tipo trocar .verdict por .result passava
  # o gate a verde. Opt-in por python3; salta limpo se ausente.
  if [ -x "$REPO_ROOT/scripts/eval/second-opinion-livetest.sh" ]; then
    if command -v python3 >/dev/null 2>&1; then
      if "$REPO_ROOT/scripts/eval/second-opinion-livetest.sh" >/dev/null 2>&1; then
        pass "second-opinion live-test verde (decisão + anti-injeção)"
      else
        fail "second-opinion live-test falhou — corre ./scripts/eval/second-opinion-livetest.sh"
      fi
    else
      info "second-opinion live-test saltado (sem python3)"
    fi
  fi

  if [ -x "$REPO_ROOT/scripts/eval/telemetry-test.sh" ]; then
    if "$REPO_ROOT/scripts/eval/telemetry-test.sh" >/dev/null 2>&1; then
      pass "telemetria dos guardrails verde (record + summary + hooks + anti-PII)"
    else
      fail "telemetry-test falhou — corre ./scripts/eval/telemetry-test.sh"
    fi
  fi

  if [ -x "$REPO_ROOT/scripts/eval/audit-feedback-test.sh" ]; then
    if "$REPO_ROOT/scripts/eval/audit-feedback-test.sh" >/dev/null 2>&1; then
      pass "audit-feedback verde (fingerprint + ciclo + accept + auto-promoção)"
    else
      fail "audit-feedback-test falhou — corre ./scripts/eval/audit-feedback-test.sh"
    fi
  fi

  # security-scan eval — camada determinística (semgrep/gitleaks vs fixtures).
  # Soft-deps: sem scanners o próprio teste faz skip reportado (exit 0) e aqui vira info,
  # nunca pass falso nem fail. Só falha se um scanner presente não disparar numa fixture.
  if [ -x "$REPO_ROOT/scripts/eval/security-scan-test.sh" ]; then
    if command -v semgrep >/dev/null 2>&1 || command -v gitleaks >/dev/null 2>&1; then
      if "$REPO_ROOT/scripts/eval/security-scan-test.sh" >/dev/null 2>&1; then
        pass "security-scan eval verde (fixtures → findings determinísticos)"
      else
        fail "security-scan eval falhou — corre ./scripts/eval/security-scan-test.sh"
      fi
    else
      info "security-scan eval saltado (semgrep/gitleaks ausentes)"
    fi
  fi
fi

# ──────────────────────── resumo ────────────────────────
echo
echo "──────────────────────────────────────────"
echo "Total: ${RED}${ERRORS} erro(s)${RESET} · ${YELLOW}${WARNS} aviso(s)${RESET}"
echo "──────────────────────────────────────────"

[ $ERRORS -gt 0 ] && exit 1
exit 0

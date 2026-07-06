#!/usr/bin/env bash
# prumo-base · PreToolUse · audit-guard
#
# Defense-in-depth para o devkit: bloqueia operações destrutivas durante contexto de
# audit, a menos que o utilizador tenha aprovado o `apply` explicitamente.
#
# Activa-se quando QUALQUER um destes está verdade:
#   - existe ${HOME}/.prumo/audit-active (marker file criado pela skill antes da Fase 4)
#   - PRUMO_AUDIT_ACTIVE=1
#
# Bloqueia (em prod, warn em dev, bypass em lab) quando o tool call é destrutivo E
# `PRUMO_AUDIT_APPLY=1` NÃO está definido. Quando `apply` está definido, deixa passar
# (a skill já passou pelos Gates 1-3 do shared/safe-apply.md).
#
# Não interfere fora de contexto de audit — é silencioso.

set -euo pipefail

# Carregar helpers (silencioso se a lib não estiver disponível, falback fail-closed)
HELPER="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}/lib/prumo-common.sh"
if [ -r "$HELPER" ]; then
  # shellcheck disable=SC1090
  source "$HELPER"
else
  # Fallback: prod fail-closed
  prumo_log() { :; }
  # shellcheck disable=SC2329  # stub de paridade com a API da lib; não chamado neste hook
  prumo_mode() { echo prod; }
  prumo_is_dev() { [ "${PRUMO_OPERATING_MODE:-prod}" = "dev" ]; }
  prumo_fail_or_warn() {
    local plugin="$1" hook="$2" message="$3"
    if prumo_is_dev; then
      echo "[$plugin/$hook] (dev mode) $message" >&2
    else
      echo "[$plugin/$hook] $message" >&2
      exit 2
    fi
  }
fi

PLUGIN="prumo-base"
HOOK="audit-guard"

# ────────────────────────────────────────────────────────────────────────────
# Gate 0 · estamos em contexto de audit?
# ────────────────────────────────────────────────────────────────────────────
if [ ! -f "${HOME}/.prumo/audit-active" ] && [ "${PRUMO_AUDIT_ACTIVE:-}" != "1" ]; then
  exit 0
fi

# ────────────────────────────────────────────────────────────────────────────
# Gate 1 · apply explicitamente aprovado pela skill?
# ────────────────────────────────────────────────────────────────────────────
if [ "${PRUMO_AUDIT_APPLY:-}" = "1" ]; then
  prumo_log "$PLUGIN" "$HOOK" "audit-apply approved · pass-through"
  exit 0
fi

# ────────────────────────────────────────────────────────────────────────────
# Parse tool input · stdin tem JSON com tool_name + tool_input
# ────────────────────────────────────────────────────────────────────────────
INPUT=$(cat)

# Sem jq não conseguimos fazer parsing fiável — fail-open com aviso
if ! command -v jq >/dev/null 2>&1; then
  prumo_log "$PLUGIN" "$HOOK" "jq não disponível · audit-guard inactivo"
  exit 0
fi

TOOL=$(echo "$INPUT" | jq -r '.tool_name // empty' 2>/dev/null || true)
[ -z "$TOOL" ] && exit 0

# ────────────────────────────────────────────────────────────────────────────
# Padrões destrutivos por tool
# ────────────────────────────────────────────────────────────────────────────
PROTECTED_PATH_REGEX='(^|/)(\.gitignore|\.gitattributes|\.dockerignore|\.env([.-][^/]+)?|filter_parameter_logging\.rb|backtrace_silencers\.rb|inflections\.rb)$|(^|/)(config/initializers|config/environments|spec|test|tests|__tests__|\.github/workflows|\.gitlab-ci|\.circleci|Jenkinsfile)(/|$)'

# Para Bash: padrões de comandos destrutivos (alvo principal: rm fora de /tmp,
# git rm, mv para fora de /tmp, truncate, drop/alter/delete SQL, redirect a paths
# protegidos). NÃO bloqueia comandos read-only (ls, cat, grep, find sem -delete).
BASH_DESTRUCTIVE_REGEX='(^|;|&&|\|\||\|)[[:space:]]*(sudo[[:space:]]+)?(rm[[:space:]]+(-[a-zA-Z]*[rRf][a-zA-Z]*[[:space:]]+)?(/[^[:space:]/]+)*[^/[:space:]]|git[[:space:]]+rm|truncate[[:space:]]+|find[[:space:]].+-delete|find[[:space:]].+-exec[[:space:]]+rm)'
SQL_DESTRUCTIVE_REGEX='(DROP|ALTER|TRUNCATE|DELETE)[[:space:]]+(TABLE|FROM|DATABASE|SCHEMA)'

case "$TOOL" in
  Bash)
    CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null || true)
    [ -z "$CMD" ] && exit 0

    # rm/mv sobre /tmp/* é benigno
    if echo "$CMD" | grep -qE '(^|[[:space:]])(rm|mv)[[:space:]]+(-[^[:space:]]*[[:space:]]+)*/tmp/'; then
      exit 0
    fi

    if echo "$CMD" | grep -qE "$BASH_DESTRUCTIVE_REGEX"; then
      prumo_fail_or_warn "$PLUGIN" "$HOOK" \
"Bash destrutivo durante contexto de audit sem apply aprovado.

Comando: $(echo "$CMD" | head -c 200)

Para destrancar:
  1. A skill deve passar pelos Gates 1-3 de shared/safe-apply.md.
  2. Se aprovado, exportar PRUMO_AUDIT_APPLY=1 antes do tool call.
  3. Para sair de contexto de audit: rm -f ~/.prumo/audit-active."
    fi

    if echo "$CMD" | grep -qiE "$SQL_DESTRUCTIVE_REGEX"; then
      prumo_fail_or_warn "$PLUGIN" "$HOOK" \
"SQL destrutivo durante contexto de audit sem apply aprovado.

Comando: $(echo "$CMD" | head -c 200)

DROP/ALTER/TRUNCATE/DELETE TABLE/FROM nunca são executados num audit a menos que
o utilizador tenha confirmado individualmente. Definir PRUMO_AUDIT_APPLY=1 só após
aprovação humana explícita da query específica."
    fi
    ;;

  Edit|Write|MultiEdit|NotebookEdit)
    PATH_TARGET=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.notebook_path // empty' 2>/dev/null || true)
    [ -z "$PATH_TARGET" ] && exit 0

    if echo "$PATH_TARGET" | grep -qE "$PROTECTED_PATH_REGEX"; then
      prumo_fail_or_warn "$PLUGIN" "$HOOK" \
"Edit/Write a path protegido durante contexto de audit sem apply aprovado.

Alvo: $PATH_TARGET

Paths protegidos por defeito durante audit: .gitignore, .env*, config/initializers,
config/environments, spec/, test/, .github/workflows, filter_parameter_logging.rb e
similares. Para autorizar este edit individualmente:
  1. A skill deve mostrar o diff e confirmar com o utilizador (Gate 3).
  2. Exportar PRUMO_AUDIT_APPLY=1 antes do tool call autorizado."
    fi
    ;;
esac

exit 0

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

# Sem jq não conseguimos fazer parsing fiável do tool_input. Isto é um hook de
# segurança: em prod falha fechado (bloqueia) em vez de ficar inactivo; em
# dev/lab avisa e deixa passar (via prumo_fail_or_warn, que já decide isto pelo
# modo — incluindo quando só os stubs de fallback estão disponíveis, que por
# omissão assumem prod).
if ! command -v jq >/dev/null 2>&1; then
  prumo_fail_or_warn "$PLUGIN" "$HOOK" \
"jq não disponível durante contexto de audit — não é possível fazer parsing
fiável do tool_input. Em modo prod isto bloqueia por segurança (fail-closed);
em dev/lab passa com aviso. Instalar jq para restaurar o parsing normal."
  exit 0
fi

TOOL=$(echo "$INPUT" | jq -r '.tool_name // empty' 2>/dev/null || true)
[ -z "$TOOL" ] && exit 0

# ────────────────────────────────────────────────────────────────────────────
# Padrões destrutivos por tool
# ────────────────────────────────────────────────────────────────────────────
PROTECTED_PATH_REGEX='(^|/)(\.gitignore|\.gitattributes|\.dockerignore|\.env([.-][^/]+)?|filter_parameter_logging\.rb|backtrace_silencers\.rb|inflections\.rb)$|(^|/)(config/initializers|config/environments|spec|test|tests|__tests__|\.github/workflows|\.gitlab-ci|\.circleci|Jenkinsfile)(/|$)|\.prumo/(audit-active|mode|lab-mode)$'

# Para Bash: padrões de comandos destrutivos (alvo principal: rm fora de /tmp,
# git rm, mv para fora de /tmp, truncate, drop/alter/delete SQL, redirect a paths
# protegidos). NÃO bloqueia comandos read-only (ls, cat, grep, find sem -delete).
#
# Cada clause de $CMD (ver split abaixo) é testada isoladamente contra estes
# padrões — por isso não precisam de âncoras de fronteira (^|;|&&|...) embutidas.
#
# RM_BINARY_REGEX aceita: rm nu, \rm (backslash-escape do alias), "command rm",
# sudo rm, e binário com path absoluto (/bin/rm, /usr/bin/rm, /usr/local/bin/rm).
#
# Fronteira de palavra obrigatória: o char imediatamente antes do token "rm"
# (ou dos seus prefixos opcionais) tem de ser início-de-clause, espaço, "/" ou
# "\" — NUNCA uma letra/dígito. Sem isto "rm" batia como substring dentro de
# qualquer palavra terminada em "rm" (terraform, inform, platform, confirm),
# bloqueando comandos totalmente benignos durante contexto de audit.
RM_BINARY_REGEX='(^|[[:space:]]|/|\\)(sudo[[:space:]]+)?(\\)?(command[[:space:]]+)?((/usr)?(/local)?/(s)?bin/)?rm'
# RM_TARGET_REGEX aceita um target normal (qualquer coisa) OU um target raiz nu
# ("/" seguido de espaço/fim-de-string) — o buraco original só cobria o primeiro.
RM_TARGET_REGEX='(-[a-zA-Z]*[rRf][a-zA-Z]*[[:space:]]+)?((/[^[:space:]/]+)*[^/[:space:]]|/([[:space:]]|$))'
# truncate também exige a mesma fronteira (evita bater dentro de "ftruncate" ou
# palavras que terminem em "truncate").
TRUNCATE_REGEX='(^|[[:space:]]|/|\\)(sudo[[:space:]]+)?truncate[[:space:]]+'
BASH_DESTRUCTIVE_REGEX="${RM_BINARY_REGEX}[[:space:]]+${RM_TARGET_REGEX}|(sudo[[:space:]]+)?git[[:space:]]+rm|${TRUNCATE_REGEX}|find[[:space:]].+-delete|find[[:space:]].+-exec[[:space:]]+rm"
SQL_DESTRUCTIVE_REGEX='(DROP|ALTER|TRUNCATE|DELETE)[[:space:]]+(TABLE|FROM|DATABASE|SCHEMA)'

# Indicadores de ofuscação: eval, base64 decode, ${IFS} como separador, e
# bash/sh -c ou pipe directo para um interpretador — usados para esconder um
# comando destrutivo dentro de outro que a regex acima não reconheceria
# literalmente (ex: "bash -c \"rm -rf /x\"", "base64 -d payload | bash",
# "rm${IFS}-rf${IFS}/"). Tratados como suspeitos por si só durante audit sem
# apply aprovado — não tentamos fazer parsing completo do shell.
BASH_OBFUSCATION_REGEX='(^|[;&|[:space:]])eval([[:space:]]|$)|base64[[:space:]]+(-d|--decode)\b|\$\{?IFS\}?|(^|[;&|[:space:]])(/bin/|/usr/bin/)?(bash|sh)[[:space:]]+-c\b|\|[[:space:]]*(/bin/|/usr/bin/)?(bash|sh)([[:space:]]|$)'

# Marker de audit e ficheiros de modo não podem ser escritos/movidos/apagados
# a partir de dentro do próprio contexto de audit sem apply — senão o tool call
# gated conseguia auto-desactivar o guard (ex: "> ~/.prumo/audit-active").
#
# Os tokens de palavra (rm/mv/unlink/truncate/cp/sed -i/tee) exigem a mesma
# fronteira do RM_BINARY_REGEX acima (evita bater "confirm"/"committee" como
# substring). ">"/">>" não precisam de fronteira — não são letras, não há
# ambiguidade de substring dentro de outra palavra.
MARKER_PATH_REGEX='(~|\$\{?HOME\}?)/\.prumo/(audit-active|mode|lab-mode)\b'
MARKER_WRITE_REGEX="(^|[[:space:]]|/|\\\\)(rm|mv|unlink|truncate|cp|sed[[:space:]]+-i|tee)[^;&|]*${MARKER_PATH_REGEX}|>{1,2}[^;&|]*${MARKER_PATH_REGEX}"

case "$TOOL" in
  Bash)
    CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null || true)
    [ -z "$CMD" ] && exit 0

    # Dividir o comando em clauses por ; && || | e avaliar CADA clause
    # isoladamente. O short-circuit antigo saía do hook inteiro ao ver QUALQUER
    # referência a /tmp em qualquer parte do comando (ex: "rm -rf /tmp/x; rm -rf
    # ~/dados" passava). Agora só a clause cujo alvo é exclusivamente /tmp é
    # isenta; as restantes continuam a ser avaliadas normalmente.
    CLAUSES=$(printf '%s\n' "$CMD" | sed -E 's/(&&|\|\||;|\|)/\n/g')

    BLOCK_REASON=""
    BLOCK_CLAUSE=""
    while IFS= read -r CLAUSE; do
      TRIMMED=$(printf '%s' "$CLAUSE" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')
      [ -z "$TRIMMED" ] && continue

      # rm/mv cujo(s) único(s) alvo(s) são /tmp/* é benigno — mas só isenta
      # ESTA clause, nunca o comando inteiro. Exclui explicitamente clauses cujo
      # path contenha ".." — sem isto "rm -rf /tmp/../etc" batia a exempção por
      # começar textualmente por "/tmp/", escapando para fora de /tmp via
      # traversal enquanto era tratado como benigno.
      if printf '%s' "$TRIMMED" | grep -qiE '^(sudo[[:space:]]+)?(rm|mv)[[:space:]]+(-[^[:space:]]+[[:space:]]+)*/tmp/[^[:space:]]*([[:space:]]+/tmp/[^[:space:]]*)*[[:space:]]*$' \
         && ! printf '%s' "$TRIMMED" | grep -qF '..'; then
        continue
      fi

      if printf '%s' "$TRIMMED" | grep -qiE "$BASH_DESTRUCTIVE_REGEX"; then
        BLOCK_REASON="destructive"; BLOCK_CLAUSE="$TRIMMED"; break
      fi
      if printf '%s' "$TRIMMED" | grep -qiE "$SQL_DESTRUCTIVE_REGEX"; then
        BLOCK_REASON="sql"; BLOCK_CLAUSE="$TRIMMED"; break
      fi
      if printf '%s' "$TRIMMED" | grep -qiE "$BASH_OBFUSCATION_REGEX"; then
        BLOCK_REASON="obfuscation"; BLOCK_CLAUSE="$TRIMMED"; break
      fi
      if printf '%s' "$TRIMMED" | grep -qiE "$MARKER_WRITE_REGEX"; then
        BLOCK_REASON="marker"; BLOCK_CLAUSE="$TRIMMED"; break
      fi
    done <<< "$CLAUSES"

    case "$BLOCK_REASON" in
      destructive)
        prumo_fail_or_warn "$PLUGIN" "$HOOK" \
"Bash destrutivo durante contexto de audit sem apply aprovado.

Comando: $(echo "$BLOCK_CLAUSE" | head -c 200)

Para destrancar:
  1. A skill deve passar pelos Gates 1-3 de shared/safe-apply.md.
  2. Se aprovado, exportar PRUMO_AUDIT_APPLY=1 antes do tool call.
  3. Para sair de contexto de audit: rm -f ~/.prumo/audit-active."
        ;;
      sql)
        prumo_fail_or_warn "$PLUGIN" "$HOOK" \
"SQL destrutivo durante contexto de audit sem apply aprovado.

Comando: $(echo "$BLOCK_CLAUSE" | head -c 200)

DROP/ALTER/TRUNCATE/DELETE TABLE/FROM nunca são executados num audit a menos que
o utilizador tenha confirmado individualmente. Definir PRUMO_AUDIT_APPLY=1 só após
aprovação humana explícita da query específica."
        ;;
      obfuscation)
        prumo_fail_or_warn "$PLUGIN" "$HOOK" \
"Indicador de ofuscação de shell durante contexto de audit sem apply aprovado.

Comando: $(echo "$BLOCK_CLAUSE" | head -c 200)

eval, base64 -d/--decode, \${IFS} como separador, e bash/sh -c ou pipe directo
para um interpretador são bloqueados por defeito num audit — mesmo que o
conteúdo decodificado/embutido não seja em si reconhecido como destrutivo, pois
escondem o comando real da análise estática deste guard. Definir
PRUMO_AUDIT_APPLY=1 só após aprovação humana explícita do comando literal."
        ;;
      marker)
        prumo_fail_or_warn "$PLUGIN" "$HOOK" \
"Escrita/remoção do marker de audit ou ficheiro de modo durante contexto de
audit sem apply aprovado.

Comando: $(echo "$BLOCK_CLAUSE" | head -c 200)

~/.prumo/audit-active, ~/.prumo/mode e ~/.prumo/lab-mode nunca são alterados
pelo próprio tool call gated — isso permitiria auto-desactivar o guard. Sair de
contexto de audit é uma acção da skill/utilizador, não do comando em avaliação."
        ;;
    esac
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

#!/usr/bin/env bash
# prumo-base · PreToolUse · memory-scope
#
# Guarda de âmbito entre as camadas de memória (ver skill memory-doctor).
# Impede que uma camada invada o terreno da outra — a causa de memória contraditória.
#
# Matcher: Bash APENAS. Nunca Read/Glob — interceptar o caminho quente de leitura é
# exactamente a colisão (C2) que a skill denuncia no `graphify claude install`; seria
# incoerente cometê-la. Deny-list estreita, frequência baixa, zero custo no caminho quente.
#
# Modelo de confiança: defense-in-depth + audit trail, NÃO uma barreira inquebrável —
# assenta em env vars que o próprio agente gated consegue definir. A barreira humana real
# é o prompt de permissão da tool Bash do Claude Code.
#
# Bypass (audit-tracked): PRUMO_MEMORY_SCOPE_BYPASS=1

set -euo pipefail

HELPER="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}/lib/prumo-common.sh"
if [ -r "$HELPER" ]; then
  # shellcheck disable=SC1090
  source "$HELPER"
  prumo_telemetry_init "prumo-base" "memory-scope"
else
  prumo_log() { :; }
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
HOOK="memory-scope"

# Bypass explícito (audit-tracked)
if [ "${PRUMO_MEMORY_SCOPE_BYPASS:-}" = "1" ]; then
  prumo_log "$PLUGIN" "$HOOK" "bypass explícito · pass-through"
  exit 0
fi

INPUT=$(cat)

if ! command -v jq >/dev/null 2>&1; then
  prumo_fail_or_warn "$PLUGIN" "$HOOK" \
"jq não disponível — não é possível fazer parsing fiável do tool_input.
Em prod bloqueia por segurança (fail-closed); em dev/lab passa com aviso."
  exit 0
fi

TOOL=$(echo "$INPUT" | jq -r '.tool_name // empty' 2>/dev/null || true)
[ "$TOOL" != "Bash" ] && exit 0

CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null || true)
[ -z "$CMD" ] && exit 0

# ────────────────────────────────────────────────────────────────────────────
# Fronteira de palavra — MESMA classe endurecida do audit-guard.
# Sem "(" e backtick, um token embrulhado em $(...), subshell ou backticks escapa
# ao guard (família de bypass corrigida na v0.5.0). Não regredir.
# shellcheck disable=SC2016  # backtick é literal do regex, não expansão
B='(^|[[:space:]]|/|\\|\(|`)'

# C4 · ambições episódicas do graphify (pertencem ao MemPalace)
EPISODIC_REGEX="${B}graphify[[:space:]]+(reflect|save-result)\b|\.graphify_(learning|analysis)\.json"

# C1/C2 · graphify a escrever no CLAUDE.md + PreToolUse hook sobre Read/Glob
CLAUDE_INSTALL_REGEX="${B}graphify[[:space:]]+claude[[:space:]]+install\b"

# C7 · âmbito global (instalação é por-projecto)
GLOBAL_REGEX="${B}graphify[[:space:]]+global[[:space:]]+add\b|${B}graphify[[:space:]]+extract\b[^;&|]*--global\b"

# Typosquat · o pacote legítimo é graphifyy; graphify é slot por reclamar no PyPI.
# O "[^y]" garante que graphifyy NÃO bate.
TYPOSQUAT_REGEX="(uv[[:space:]]+tool[[:space:]]+install|pip[[:space:]]+install|pipx[[:space:]]+install)[[:space:]]+(-[^[:space:]]+[[:space:]]+)*graphify([^y[:alnum:]]|==|$)"

# C3 · mempalace mine tem DEFAULT --mode projects → indexa código.
# A camada episódica exige --mode convos. Tratado à parte (exige ausência de flag).
MINE_REGEX="${B}mempalace[[:space:]]+mine\b"

BLOCK_REASON=""
BLOCK_CLAUSE=""

CLAUSES=$(printf '%s\n' "$CMD" | sed -E 's/(&&|\|\||;|\|)/\n/g')

while [ -z "$BLOCK_REASON" ] && IFS= read -r CLAUSE; do
  TRIMMED=$(printf '%s' "$CLAUSE" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')
  [ -z "$TRIMMED" ] && continue

  if printf '%s' "$TRIMMED" | grep -qiE "$EPISODIC_REGEX"; then
    BLOCK_REASON="episodic"; BLOCK_CLAUSE="$TRIMMED"; break
  fi
  if printf '%s' "$TRIMMED" | grep -qiE "$CLAUDE_INSTALL_REGEX"; then
    BLOCK_REASON="claude-install"; BLOCK_CLAUSE="$TRIMMED"; break
  fi
  if printf '%s' "$TRIMMED" | grep -qiE "$GLOBAL_REGEX"; then
    BLOCK_REASON="global"; BLOCK_CLAUSE="$TRIMMED"; break
  fi
  if printf '%s' "$TRIMMED" | grep -qiE "$TYPOSQUAT_REGEX"; then
    BLOCK_REASON="typosquat"; BLOCK_CLAUSE="$TRIMMED"; break
  fi
  # mine sem --mode convos (o default do CLI é --mode projects → código)
  if printf '%s' "$TRIMMED" | grep -qiE "$MINE_REGEX"; then
    if ! printf '%s' "$TRIMMED" | grep -qiE -- '--mode[[:space:]=]+convos'; then
      BLOCK_REASON="corpus"; BLOCK_CLAUSE="$TRIMMED"; break
    fi
  fi
done <<< "$CLAUSES"

case "$BLOCK_REASON" in
  episodic)
    prumo_fail_or_warn "$PLUGIN" "$HOOK" \
"Ambição episódica na camada estrutural.

Comando: $(echo "$BLOCK_CLAUSE" | head -c 200)

'graphify reflect' e 'save-result' registam 'o que funcionou' — isso é memória
episódica e pertence ao MemPalace. Dois sistemas a registá-lo independentemente
produzem memória contraditória, sem forma de o agente arbitrar.

O graphify fica com a ESTRUTURA (AST); o MemPalace fica com o EPISÓDICO."
    ;;
  claude-install)
    prumo_fail_or_warn "$PLUGIN" "$HOOK" \
"'graphify claude install' escreve no CLAUDE.md E instala um PreToolUse hook sobre
Read/Glob.

Comando: $(echo "$BLOCK_CLAUSE" | head -c 200)

Isso cria um segundo mandato 'consulta-me primeiro' a competir com o do MemPalace,
e intercepta o caminho quente de leitura de ficheiros.

A regra de encaminhamento é escrita UMA vez, por nós: corre /memory-doctor --apply.
Se já foi instalado: graphify claude uninstall."
    ;;
  global)
    prumo_fail_or_warn "$PLUGIN" "$HOOK" \
"Âmbito global do graphify.

Comando: $(echo "$BLOCK_CLAUSE" | head -c 200)

A instalação é POR-PROJECTO. Um grafo global (~/.graphify/global-graph.json) mistura
corpus de projectos sem relação e dilui a precisão do 'affected'."
    ;;
  typosquat)
    prumo_fail_or_warn "$PLUGIN" "$HOOK" \
"TYPOSQUAT — o pacote legítimo é 'graphifyy' (dois y), não 'graphify'.

Comando: $(echo "$BLOCK_CLAUSE" | head -c 200)

'graphify' é um slot por reclamar no PyPI — alvo aberto de typosquat. Se algum dia
existir, é ALARME, não conveniência.

Correcto: uv tool install graphifyy==<versão>   (sempre pinado)"
    ;;
  corpus)
    prumo_fail_or_warn "$PLUGIN" "$HOOK" \
"'mempalace mine' sem --mode convos.

Comando: $(echo "$BLOCK_CLAUSE" | head -c 200)

O DEFAULT do CLI é '--mode projects', que indexa CÓDIGO — sobrepondo-se ao grafo AST
do graphify. O mesmo código em dois índices, com semânticas de retrieval diferentes,
e o agente sem saber qual é autoritativo.

A camada episódica é de CONVERSAS: mempalace mine <dir> --mode convos"
    ;;
esac

exit 0

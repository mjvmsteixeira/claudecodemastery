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
# Âmbito da deteção (fronteira deliberada, não omissão): casa correspondência TEXTUAL
# sobre as formas naturais e ofuscações leves — aspas, backslash, continuação de linha,
# `$(...)`/backtick/`<(...)`/`>(...)`, `${IFS}`, e execução via wrapper/alias. NÃO é um
# parser de shell: constructos que só produzem o separador em runtime a partir de estado
# arbitrário (ex.: `X=' '; graphify${X}reflect`, ou split de variável definida antes) não
# são cobertos — exigiriam reimplementar o shell, e caem no lado do modelo de confiança
# onde o prompt de permissão humano é a barreira. O alvo real é o agente a emitir a forma
# natural do comando errado, não um humano a forjar evasão (esse tem o bypass abaixo).
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
# Normalizar ANTES de procurar padrões multi-palavra.
#
# Continuação de linha (`graphify \` + newline + `reflect`) é UM comando lógico para
# o shell, mas o split por clauses abaixo via-o como duas linhas — e nenhum regex
# multi-palavra ("graphify[[:space:]]+reflect") chegava a casar. Um `graphify reflect`
# assim escrito EXECUTAVA de facto e o hook devolvia rc=0. Colapsar `\<newline>` num
# espaço fecha esse vector para os 5 regexes de uma vez.
# (awk e não sed: o sed do BSD/macOS rejeita um newline literal no pattern de substituição)
CMD=$(printf '%s\n' "$CMD" | awk '{ if (sub(/\\$/, "")) printf "%s ", $0; else print }')

# Despir aspas E backslashes ANTES de casar. O shell remove-os antes de executar,
# portanto `graphify "reflect"`, `graphify claude "install"`, `mempalace "mine"` e
# `g\raphify reflect` / `graphify re\flect` correm todos a acção proibida na mesma.
# A fronteira `B` só ancora o PRIMEIRO token, e o token embrulhado em aspas ou
# partido por backslash escapava a todos os regexes multi-palavra. Remover `"`,
# `'` e `\` fecha as duas famílias de uma vez.
# \042 = " · \047 = ' · \134 = \  (octal; o tr do BSD/macOS aceita escapes octais)
CMD=$(printf '%s' "$CMD" | tr -d '\042\047\134')

# ${IFS} / $IFS expandem para whitespace no shell, portanto `graphify${IFS}reflect`
# corre `graphify reflect`. Sem separador visível, nenhum regex multi-palavra
# casava. Normalizar essas expansões para um espaço fecha o vector.
# shellcheck disable=SC2016  # $IFS é literal no pattern do sed, não expansão do shell
CMD=$(printf '%s' "$CMD" | sed -E 's/\$\{IFS[^}]*\}/ /g; s/\$IFS/ /g')

# ────────────────────────────────────────────────────────────────────────────
# Fronteira de palavra — DENYLIST de caracteres de identificador, não allowlist
# de separadores. A versão anterior enumerava os separadores permitidos
# (espaço, `/`, `(`, backtick, aspas, `$`) e era incompleta por construção: cada
# novo contexto de invocação trazia um separador não listado que escapava —
# `$(...)` (v0.5.0), aspas, `$'...'` (ANSI-C), e por fim `alias.q=!graphify`
# (o `!`/`=` não estavam na lista). Negar `[A-Za-z0-9_]` apanha QUALQUER
# caractere não-identificador antes de `graphify`/`mempalace` — `!`, `=`, `:`,
# `$`, espaço, `(`, `/`, backtick, aspas — de uma só vez, sem enumerar.
# `mygraphify` continua a não casar (o `y`/letra antes é identificador); o sufixo
# `graphifyy` é tratado à parte pelo `[^y[:alnum:]]` de cada regex.
B='(^|[^A-Za-z0-9_])'

# C4 · ambições episódicas do graphify (pertencem ao MemPalace)
EPISODIC_REGEX="${B}graphify[[:space:]]+(reflect|save-result)\b|\.graphify_(learning|analysis)\.json"

# C1/C2 · graphify a escrever no CLAUDE.md + PreToolUse hook sobre Read/Glob
#
# São TRÊS caminhos de escrita, não um (derivado de install.py, não do --help):
#   - `graphify claude install`            → o óbvio
#   - `graphify install` (SEM argumentos)  → install.py:1894 `default_platform = "claude"`
#                                            → _PLATFORM_CONFIG["claude"]["claude_md"]=True
#                                            → escreve (e cria) ~/.claude/CLAUDE.md GLOBAL
#   - `graphify install --project`         → `--project` existe no parser (install.py:1904,
#                                            1941) apesar de NÃO estar no --help; muda o
#                                            alvo para ./.claude/CLAUDE.md
# `graphify install` é o comando mais natural que um agente escreveria — e era o que
# escapava. O segundo ramo apanha as três formas de uma vez.
#
# NÃO apanha (verificado): `graphify hook install` (há "hook" entre os tokens),
# `graphify uninstall`/`claude uninstall` (o \b exige "install" colado após o espaço,
# e "uninstall" começa por 'u'), nem `uv tool install graphifyy`.
CLAUDE_INSTALL_REGEX="${B}graphify[[:space:]]+claude[[:space:]]+install\b|${B}graphify[[:space:]]+install\b"

# C7 · âmbito global (instalação é por-projecto)
GLOBAL_REGEX="${B}graphify[[:space:]]+global[[:space:]]+add\b|${B}graphify[[:space:]]+extract\b[^;&|]*--global\b"

# Typosquat · o pacote legítimo é graphifyy; graphify é slot por reclamar no PyPI.
# `[^y[:alnum:]]` garante que graphifyy NÃO bate (é o prefixo do legítimo).
# `pip3?` porque pip3 é o alias por omissão em macOS/Linux com Python 3.
# As aspas já foram removidas do CMD acima; o `["']?` fica como cinto-e-suspensórios.
# Enumerar os gestores: uv (tool install/run, run, add), uvx, pip/pip3, pipx
# (install E run), poetry, conda, rye, pdm — qualquer um instala OU corre
# efemeramente o slot 'graphify'. `uvx`/`uv tool run`/`uv run --with`/`pipx run`
# fazem fetch+execução sem instalar — mesmo threat model (executa código do slot
# por-reclamar), por isso entram na mesma alternação. O grupo de flags
# `(-[^[:space:]]+[[:space:]]+)*` apanha o `--with` de `uv run --with graphify`.
TYPOSQUAT_REGEX="(uv[[:space:]]+tool[[:space:]]+install|uv[[:space:]]+tool[[:space:]]+run|uv[[:space:]]+run|uvx|uv[[:space:]]+add|pip3?[[:space:]]+install|pipx[[:space:]]+install|pipx[[:space:]]+run|poetry[[:space:]]+add|conda[[:space:]]+install|rye[[:space:]]+add|pdm[[:space:]]+add)[[:space:]]+(-[^[:space:]]+[[:space:]]+)*[\"']?graphify([^y[:alnum:]]|==|\$)"

# C3 · mempalace mine tem DEFAULT --mode projects → indexa código.
# A camada episódica exige --mode convos. Tratado à parte (exige ausência de flag).
MINE_REGEX="${B}mempalace[[:space:]]+mine\b"

BLOCK_REASON=""
BLOCK_CLAUSE=""

CLAUSES=$(printf '%s\n' "$CMD" | sed -E 's/(&&|\|\||;|\|)/\n/g')

while [ -z "$BLOCK_REASON" ] && IFS= read -r CLAUSE; do
  TRIMMED=$(printf '%s' "$CLAUSE" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')
  [ -z "$TRIMMED" ] && continue

  # Tirar comentário de fim-de-linha (` #...`) — em qualquer categoria, não só no
  # mine. Um token dentro de um comentário é DADO, não execução; mantê-lo gerava
  # falsos positivos e, no caso do mine, um `# --mode convos` colado satisfazia
  # indevidamente o check de convos.
  TRIMMED=$(printf '%s' "$TRIMMED" | sed -E 's/[[:space:]]+#.*$//')
  [ -z "$TRIMMED" ] && continue

  # Palavra-de-comando da clause (o 1º token, após env-assignments FOO=bar).
  # Se for um comando de TEXTO PURO (grep/echo/cat/…), o token graphify/mempalace
  # é DADO — nada executa — e bloquear seria falso positivo (`grep "graphify
  # install" docs/`). Nesses casos, saltar a clause.
  #
  # EXCEPÇÃO: se a clause contiver substituição de comando ou de processo
  # (`$(...)`, backtick, `<(...)`, `>(...)`), o comando interno EXECUTA
  # independentemente do comando externo — `cat <(graphify reflect)` corre
  # graphify — logo NÃO se pode saltar.
  #
  # A allowlist é deliberadamente SÓ comandos que tratam os argumentos como
  # dados e nunca os executam. Ficam DE FORA todos os programáveis, sem excepção:
  #   - awk/sed/perl/jq  → `awk 'BEGIN{system("graphify reflect")}'`
  #   - git              → `git -c alias.q='!graphify reflect' q` (e core.pager,
  #                        -x/--exec, foreach, bisect run, difftool -x) executam
  #                        comandos arbitrários. Custo de excluir git: o FP raro
  #                        `git commit -m "...graphify reflect..."` volta a
  #                        bloquear — aceitável (tem bypass), e é o MESMO custo
  #                        que já pagamos no awk/sed. O invariante fica de uma
  #                        linha: programável ⇒ fora da allowlist.
  CMDWORD=$(printf '%s' "$TRIMMED" | sed -E 's/^([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]*[[:space:]]+)*//' | awk '{print $1}')
  # shellcheck disable=SC2016  # '$(' '`' '<(' '>(' são literais do grep -F, não expansão
  if ! printf '%s' "$TRIMMED" | grep -qF '$(' && ! printf '%s' "$TRIMMED" | grep -qF '`' \
     && ! printf '%s' "$TRIMMED" | grep -qF '<(' && ! printf '%s' "$TRIMMED" | grep -qF '>('; then
    case "$CMDWORD" in
      grep|egrep|fgrep|rg|ag|echo|printf|cat|bat|head|tail|less|more|man|history) continue ;;
    esac
  fi

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
    # --help/--dry-run não indexam nada — é o próprio passo de detecção do C3
    # que o arbitro.md manda correr; bloqueá-lo tornava a skill incoerente.
    if printf '%s' "$TRIMMED" | grep -qiE -- '--(help|dry-run)\b'; then
      continue
    fi
    # (o comentário de fim-de-linha já foi removido de TRIMMED acima, portanto um
    # `# --mode convos` colado não satisfaz este check)
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

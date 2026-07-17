#!/usr/bin/env bash
# Wire SecOps · pre-tool · PII fail-closed gate

set -euo pipefail
# shellcheck source=_lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
prumo_telemetry_init "prumo-secops" "pii-redact"

INPUT=$(hook_tool_payload "${1:-}")

if [ "${PRUMO_PII_DISABLE:-}" = "1" ]; then
  # Um bypass é uma decisão distinta de um allow e tem de aparecer como tal na
  # telemetria — sem isto ficava indistinguível de um input limpo, e o
  # CLAUDE.md promete "audit-tracked". Mirror do pre-tool-second-opinion.sh.
  echo "[prumo-secops/pii-redact] PRUMO_PII_DISABLE=1 — bypass (NÃO recomendado em prod)" >&2
  prumo_log "prumo-secops" "bypass" "pii-redact: PRUMO_PII_DISABLE=1"
  prumo_telemetry_record "prumo-secops" "pii-redact" "bypass"
  # Marca o evento como já registado para o trap EXIT de prumo-common.sh
  # (_prumo_tm_on_exit) não escrever um 'allow' por cima deste 'bypass'.
  # shellcheck disable=SC2034  # consumida nesse trap, noutro ficheiro
  PRUMO_TM_RECORDED=1
  exit 0
fi

# Skip binário real (portável — BSD grep não tem -P). O heurístico antigo
# fazia tr-delete de \t\n\r + ASCII imprimível (\040-\176) e assumia binário
# se sobrasse QUALQUER byte — mas isso inclui os bytes >=0x80 de qualquer
# acento UTF-8 (ã, ç, é...), o que desligava o gate de PII em texto normal em
# português. Fix: também descartar a gama de bytes altos (\200-\377, cobre
# lead/continuation bytes UTF-8) antes de decidir — só resta algo se houver
# bytes de controlo C0 verdadeiros (excepto tab/lf/cr), que são o sinal real
# de conteúdo binário.
if [ "$(printf '%s' "$INPUT" | LC_ALL=C tr -d '\t\n\r\040-\176\200-\377' | wc -c | tr -d ' ')" != "0" ]; then
  exit 0
fi

# ── Allowlist estrutural ────────────────────────────────────────────────────
# Neutraliza construções que são formato-de-máquina e não dados de um titular,
# antes de classificar. Sem isto o gate colidia com trabalho legítimo garantido:
# o system prompt do Claude Code exige o trailer `Co-Authored-By:` em TODOS os
# commits, pelo que cada commit era um bloqueio — e a única saída era ofuscar o
# email, que é exactamente o comportamento que este gate existe para tornar
# visível. Um gate que treina evasão destrói o audit trail que produz.
#
# Substituição por token e não por linha: o trailer tanto aparece em linha
# própria (heredoc) como no meio de `git commit -m 'x' -m 'Co-Authored-By: ...'`.
#
# Classes de caracteres explícitas em vez do flag /I, e fronteira à esquerda
# feita à mão em vez de \b: o sed do macOS (BSD) não suporta nenhum dos dois e
# falharia em silêncio — mesma armadilha de portabilidade do grep -P acima.
#
# Risco residual aceite: um email formatado como trailer bem-formado passa. Isso
# é deliberado — o modelo de ameaça deste gate é fuga acidental, e quem queira
# mesmo contornar tem caminhos triviais (concatenação em shell) que nenhuma
# regex apanha. PII *fora* do trailer continua a ser classificada mesmo quando
# há um trailer na mesma linha (corpus: pii-16).
PRUMO_GIT_TRAILERS='[Cc][Oo]-[Aa][Uu][Tt][Hh][Oo][Rr][Ee][Dd]-[Bb][Yy]|[Ss][Ii][Gg][Nn][Ee][Dd]-[Oo][Ff][Ff]-[Bb][Yy]|[Rr][Ee][Vv][Ii][Ee][Ww][Ee][Dd]-[Bb][Yy]|[Aa][Cc][Kk][Ee][Dd]-[Bb][Yy]|[Tt][Ee][Ss][Tt][Ee][Dd]-[Bb][Yy]|[Rr][Ee][Pp][Oo][Rr][Tt][Ee][Dd]-[Bb][Yy]'
SCAN=$(printf '%s' "$INPUT" | sed -E \
  -e "s/(${PRUMO_GIT_TRAILERS}):[^<]*<[^>]*>/\\1: [git-trailer]/g" \
  -e 's#(^|[^A-Za-z0-9._%+-])git@[A-Za-z0-9._-]+:#\1[git-remote]:#g')

VIOLATIONS=()

# NIF (9 dígitos, primeiro 1-9). Separador opcional entre grupos — espaço ou
# traço (ou nenhum, ex: "NIF 123456789" contíguo). SEM ponto: um NIF PT é 9
# dígitos contíguos opcionalmente agrupados por espaço, nunca por ponto — o
# separador "." fazia esta regex false-match em números decimais/agrupados
# como "1.234.567.890".
if echo "$SCAN" | grep -qiE '\b[1-9][0-9]{2}[[:space:]-]?[0-9]{3}[[:space:]-]?[0-9]{3}\b'; then
  VIOLATIONS+=("NIF")
fi

# IBAN PT — -i para apanhar prefixo "pt" em minúsculas
if echo "$SCAN" | grep -qiE '\bPT[0-9]{2}[[:space:]]?[0-9]{4}[[:space:]]?[0-9]{4}[[:space:]]?[0-9]{4}[[:space:]]?[0-9]{4}[[:space:]]?[0-9]{3}[[:space:]]?[0-9]{2}\b'; then
  VIOLATIONS+=("IBAN-PT")
fi

# CC PT — espaço entre grupos agora opcional (nº CC surge frequentemente sem
# separador, ex: "12345678 9ZZ4" vs "123456789ZZ4")
if echo "$SCAN" | grep -qiE '\b[0-9]{8}[[:space:]]?[0-9][[:space:]]?[A-Z]{2}[0-9]\b'; then
  VIOLATIONS+=("CC-PT")
fi

# Email
if echo "$SCAN" | grep -qiE '\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b'; then
  VIOLATIONS+=("email")
fi

# Telefone PT — 9 dígitos começando em 2/3/9, opcionalmente +351.
# `(^|[^0-9])` à cabeça: sem âncora à esquerda a regex podia começar a meio de
# uma corrida de dígitos maior, e o \b final bastava-lhe — qualquer inteiro de
# 10+ dígitos cujos últimos 9 comecem em 2/3/9 dava falso positivo (ids, epochs
# em ms, contagens de bytes). Não se usa \b à cabeça porque o `+` de +351 não é
# word char e a fronteira não se aplicaria de forma consistente.
if echo "$SCAN" | grep -qiE '(^|[^0-9])(\+351[[:space:]]?)?[239][0-9]{2}[[:space:]]?[0-9]{3}[[:space:]]?[0-9]{3}\b'; then
  VIOLATIONS+=("telefone-PT")
fi

if [ "${#VIOLATIONS[@]}" -eq 0 ]; then
  exit 0
fi

LOG_DIR="$PRUMO_LOG_DIR"
mkdir -p "$LOG_DIR" 2>/dev/null || LOG_DIR=$(mktemp -d)
HASH=$(printf '%s' "$INPUT" | shasum -a 256 | awk '{print $1}')
TYPES=$(IFS=,; echo "${VIOLATIONS[*]}")
echo "$(date -u +%FT%TZ) | input_hash=${HASH} | types=${TYPES} | user=${USER:-unknown}" \
  >> "$LOG_DIR/pii-blocks.log" 2>/dev/null || true

# A remediação NÃO pode ser "PRUMO_PII_DISABLE=1 <comando>": este hook corre no
# ambiente do Claude Code e não no do comando, por isso um prefixo inline chega
# ao processo filho mas nunca ao hook — a instrução era impossível de seguir e o
# efeito prático era o agente ofuscar o input até passar. As saídas abaixo são
# as que existem de facto, e ambas são acções do humano, persistentes e visíveis.
cat >&2 <<EOF
[prumo-secops/pii-redact] PII detectado no input: ${TYPES}

Redact antes de re-enviar. Substitui com placeholder ([NIF], [IBAN], [EMAIL])
ou usa Vault para fetch dinâmico em vez de embedar.

Audit log: ${LOG_DIR}/pii-blocks.log

Se for falso positivo, o desbloqueio é do humano e persistente — um prefixo
inline não chega a este hook:
  /prumo-mode dev                        · warn-only nesta máquina
  settings.json → env.PRUMO_PII_DISABLE  · desliga o gate (audit-tracked)
EOF

prumo_fail_or_warn "prumo-secops" "pii-redact" "PII detectado no input: ${TYPES}"

#!/usr/bin/env bash
# prumo-secops · pre-tool · Approval gate (N1/N2/N3)
#
# Dois canais de autorização, ambos lidos antes do comando correr (nunca de um
# prefixo inline no comando: o hook corre antes dele e num processo diferente):
#   - por nível: ambiente do próprio hook (settings.json → env.PRUMO_APPROVE);
#   - por comando: ficheiro ~/.prumo/approvals/<sha256 do comando normalizado>,
#     escrito por acção humana (prumo-guard), com level/expires/scope.
#
# Robustez (v0.4.0):
#   - $CMD é normalizado: newlines→espaços, tabs→espaços. Defesa contra payloads
#     multi-line tipo "DROP\nTABLE foo" que escapariam regex line-oriented grep.
#   - flag-matchers em rm/git aceitam combinações (-rf, -fr, -rfv, --force-with-lease).
#   - DROP TABLE aceita SQL comments inline (DROP/**/TABLE).
#   - cap production deploy não é anchored ao fim de linha (aceita --branch X etc).

set -euo pipefail
# shellcheck source=_lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
prumo_telemetry_init "prumo-secops" "approval-gate"

# Normaliza whitespace: newlines+tabs viram espaços simples para que grep line-
# oriented veja o comando como uma única linha. Idempotente em comandos curtos.
RAW_CMD=$(hook_tool_payload "${1:-}")
CMD=$(printf '%s' "$RAW_CMD" | tr '\n\t' '  ')

# Id da aprovação por comando: sha256 do comando normalizado. Contrato com o
# prumo-guard, que lê "approval-id:" da mensagem de bloqueio e escreve
# ~/.prumo/approvals/<id>. Mesmo fallback do pii-redact: shasum é perl.
if command -v shasum >/dev/null 2>&1; then
  APPROVAL_ID=$(printf '%s' "$CMD" | shasum -a 256 | awk '{print $1}')
elif command -v sha256sum >/dev/null 2>&1; then
  APPROVAL_ID=$(printf '%s' "$CMD" | sha256sum | awk '{print $1}')
else
  APPROVAL_ID=""
fi

LEVEL=""

match() {
  # match <pattern> — true se $CMD bate o pattern extendido case-insensitive
  echo "$CMD" | grep -qiE "$1"
}

# ────────────────────────────────────────────────────────────────────────────
# N3 — catastrophic (parar no primeiro match)
# ────────────────────────────────────────────────────────────────────────────

# rm com flags variáveis (-rf, -fr, -rfv, --no-preserve-root etc) contra
# /forensics. Aceita zero ou mais grupos de flags antes do target.
#
# Fronteira de palavra obrigatória em todos os matchers "rm" deste ficheiro
# (mirror do fix em base/hooks/pre-tool-audit-guard.sh): o char antes do
# token "rm" tem de ser início-de-string, espaço, "/" ou "\" — nunca uma
# letra/dígito. Sem isto "rm" batia como substring de "confirm", "terraform",
# "platform", etc.
if [ -z "$LEVEL" ] && match '(^|[[:space:]]|/|\\|\(|`)rm[[:space:]]+([-][^/[:space:]]+[[:space:]]+)*/forensics(/|[[:space:]]|$)'; then
  LEVEL="N3"
fi
if [ -z "$LEVEL" ] && match 'systemctl[[:space:]]+(stop|disable)\b'; then
  LEVEL="N3"
fi
if [ -z "$LEVEL" ] && match 'vault[[:space:]]+secrets[[:space:]]+disable\b'; then
  LEVEL="N3"
fi
# cap production deploy SEM :rollback (esse cai em N2). Non-anchored — aceita
# args trailing como --branch main, --dry-run, etc. Negative-lookahead em ERE
# é simulado: matchar 'deploy' seguido de espaço/EOL e NÃO ':rollback' adjacente.
if [ -z "$LEVEL" ] && match 'cap[[:space:]]+production[[:space:]]+deploy([[:space:]]|$)' \
   && ! match 'cap[[:space:]]+production[[:space:]]+deploy:rollback\b'; then
  LEVEL="N3"
fi

# ────────────────────────────────────────────────────────────────────────────
# N2 — cross-tenant ou prod data
# ────────────────────────────────────────────────────────────────────────────

# DROP TABLE/DATABASE/SCHEMA aceita comments inline tipo DROP/**/TABLE.
# `.{0,40}` cobre comments curtos sem perder especificidade.
if [ -z "$LEVEL" ] && match 'DROP.{0,40}(TABLE|DATABASE|SCHEMA)\b'; then
  LEVEL="N2"
fi
if [ -z "$LEVEL" ] && match 'cap[[:space:]]+production[[:space:]]+deploy:rollback\b'; then
  LEVEL="N2"
fi
if [ -z "$LEVEL" ] && match 'vault[[:space:]]+token[[:space:]]+revoke[[:space:]]+-accessor\b'; then
  LEVEL="N2"
fi
# Mass-delete SQL — o `.{0,40}` livre do DROP acima batia em prosa como "echo
# delete rows from table" (qualquer texto entre DELETE e FROM, até 40 chars).
# Aqui exige-se contexto SQL genuíno: DELETE e FROM ligados só por espaço(s)
# ou um comment inline curto (DELETE/**/FROM) — nunca outras palavras no meio.
if [ -z "$LEVEL" ] && match 'DELETE([[:space:]]|/\*[^*]*\*/)+FROM\b'; then
  LEVEL="N2"
fi

# Inbox do prumo-guard: o valor capturado só sai dela com a pessoa a aprovar.
# Cobre a promoção (vault-promote.sh com uma referência da inbox), a leitura da
# inbox pelas formas comuns (kv get, kv get -mount=secret, vault read, curl/wget à
# API) e o seu apagamento. A captura (vault-write-field.sh) não entra: só escreve.
# Leituras e apagamentos fora da inbox não casam. Limites assumidos (modelo de
# confiança do gate): codificação em percentagem, variáveis, eval e base64 não
# são vistos.
# Cópia normalizada só para estas regras: `//` e `/./` num caminho valem `/`, e `dir/../` desaparece, em voltas
# até não mudar nada (a/b/c/../../../inbox fica inbox; `..` nunca conta como dir). Um `../` que sobre à cabeça
# do caminho depois de -mount=secret (`../inbox/x`) conta como a inbox: falha segura (ver INBOX_ARG).
SEG='([^./[:space:]][^/[:space:]]*|\.[^./[:space:]][^/[:space:]]*|\.\.[^/[:space:]]+)'
CMDN=$(printf '%s' "$CMD" | sed -E -e 's#//+#/#g' -e ':a' -e 's#/\./#/#g' -e "s#${SEG}/\\.\\./##g" -e 'ta')
matchn() { echo "$CMDN" | grep -qiE "$1"; }
MOUNT_RE='-mount[=[:space:]]+["'"'"']?secret["'"'"']?[[:space:]]'
INBOX_ARG='([^[:space:]]+[[:space:]]+)*["'"'"']?(\./|/|\.\./)*inbox/'
if [ -z "$LEVEL" ] && matchn 'vault-promote\.sh["'"'"']?[[:space:]]+["'"'"']?secret/inbox/'; then
  LEVEL="N2"
fi
if [ -z "$LEVEL" ] && matchn '(^|[[:space:]])kv[[:space:]]+(-[^[:space:]]+[[:space:]]+)*get[[:space:]].*secret/inbox/'; then
  LEVEL="N2"
fi
if [ -z "$LEVEL" ] && matchn '(^|[[:space:]])kv[[:space:]]+(metadata[[:space:]]+)?get[[:space:]].*'"$MOUNT_RE""$INBOX_ARG"; then
  LEVEL="N2"
fi
if [ -z "$LEVEL" ] && matchn 'vault[[:space:]]+read[[:space:]].*secret/data/inbox/'; then
  LEVEL="N2"
fi
if [ -z "$LEVEL" ] && matchn '(curl|wget)[[:space:]].*/v1/secret/(data|metadata)/inbox/'; then
  LEVEL="N2"
fi
if [ -z "$LEVEL" ] && matchn '(^|[[:space:]])kv[[:space:]]+(metadata[[:space:]]+)?(delete|destroy)[[:space:]].*secret/inbox/'; then
  LEVEL="N2"
fi
if [ -z "$LEVEL" ] && matchn '(^|[[:space:]])kv[[:space:]]+(metadata[[:space:]]+)?(delete|destroy)[[:space:]].*'"$MOUNT_RE""$INBOX_ARG"; then
  LEVEL="N2"
fi
if [ -z "$LEVEL" ] && matchn 'vault[[:space:]]+delete[[:space:]].*secret/(data|metadata)/inbox/'; then
  LEVEL="N2"
fi

# ────────────────────────────────────────────────────────────────────────────
# N1 — destrutivo local
# ────────────────────────────────────────────────────────────────────────────

if [ -z "$LEVEL" ] && match '(^|[[:space:]]|/|\\|\(|`|"|'"'"')truncate[[:space:]]+TABLE\b'; then
  LEVEL="N1"
fi
# git push aceita -f, --force, --force-with-lease (com ou sem =branch)
if [ -z "$LEVEL" ] && match 'git[[:space:]]+push[[:space:]]+([^[:space:]]+[[:space:]]+)*(-f\b|--force\b|--force-with-lease\b)'; then
  LEVEL="N1"
fi
# ────────────────────────────────────────────────────────────────────────────
# Scratchpad do Claude Code · apagar lá dentro não pede aprovação
# ────────────────────────────────────────────────────────────────────────────
# /private/tmp/claude-<uid>/… (ou /tmp/claude-<uid>/…) é o directório temporário
# privado de cada sessão. Apagar lá dentro é rotina e era o pedido de aprovação
# mais frequente (`rm -f $S/sessao.id`). Só conta quando TODOS os alvos de todos
# os `rm` do comando ficam lá dentro. Na dúvida, não conta, e as regras de rm
# abaixo aplicam-se como antes:
#   - lê o comando cru (as newlines separam comandos; no $CMD viram espaços e
#     `S=x<nl>rm $S` ficaria igual a `S=x rm $S`, onde $S não é o x);
#   - só resolve atribuições no início do comando, antes de qualquer outra coisa
#     (`false && S=…; rm $S/` deixa S por definir e o rm seria de /), com valor
#     literal, e cujo nome não volte a aparecer fora de `$S`/`${S}`;
#   - um rm que não seja o comando da sua cláusula (`xargs rm`, `bash -c "rm…"`,
#     `find -exec rm`) desqualifica, tal como `..`, `$`, `~`, chavetas e `\`;
#   - o rm segue symlinks nos componentes intermédios e no final com barra:
#     esses não podem ser symlinks nem ter globs.
rm_scratch_only() {
  local cmd subst head pair name val clause w root rest p comp i n
  local found=0 state opts_done skip_next
  local -a words comps
  cmd=$(printf '%s' "$RAW_CMD" | tr '\t\n' ' ;')
  # Com outro IFS, um $S/a sem aspas parte-se em nomes relativos ao cwd.
  case "$cmd" in *IFS*) return 1 ;; esac
  subst=$cmd
  head=$(printf '%s' "$cmd" | grep -oE '^([[:space:]]*(export[[:space:]]+)?[A-Za-z_][A-Za-z0-9_]*=[A-Za-z0-9_./@%+:,=-]+[[:space:]]*(;|&&))+' || true)
  while IFS= read -r pair; do
    [ -n "$pair" ] || continue
    name=${pair%%=*}; val=${pair#*=}
    [ "$(printf '%s' "$cmd" | sed -E 's/\$\{?[A-Za-z_][A-Za-z0-9_]*//g' | tr -c 'A-Za-z0-9_' '\n' | grep -cx "$name" || true)" = 1 ] || return 1
    subst=$(printf '%s' "$subst" | sed -E "s#\\\$\\{${name}\\}#${val}#g; s#\\\$${name}([^A-Za-z0-9_]|\$)#${val}\\1#g")
  done < <(printf '%s' "$head" | grep -oE '[A-Za-z_][A-Za-z0-9_]*=[A-Za-z0-9_./@%+:,=-]+' || true)
  while IFS= read -r clause; do
    read -ra words <<< "$clause"
    [ "${#words[@]}" -gt 0 ] || continue
    state='cmd'; opts_done=0; skip_next=0
    for w in "${words[@]}"; do
      w=${w//\"/}; w=${w//\'/}
      if [ "$state" = cmd ]; then
        case "$w" in
          rm|*/rm|\\rm) state='rm' ;;
          command) ;;
          *) state='other' ;;
        esac
        continue
      fi
      if [ "$state" = other ]; then
        case "$w" in rm|*/rm|\\rm) return 1 ;; esac
        continue
      fi
      if [ "$skip_next" = 1 ]; then skip_next=0; continue; fi
      if [[ "$w" =~ ^[0-9]*[\<\>]+$ ]]; then skip_next=1; continue; fi
      if [[ "$w" =~ ^[0-9]*[\<\>] ]]; then continue; fi
      if [ "$opts_done" = 0 ]; then
        case "$w" in --) opts_done=1; continue ;; -*) continue ;; esac
      fi
      found=1
      case "$w" in *..*|*'$'*|*\\*|*'~'*|*'{'*|*'}'*|*'['*) return 1 ;; esac
      [[ "$w" =~ ^((/private)?/tmp/claude-[0-9]+)/([^/].*)$ ]] || return 1
      root=${BASH_REMATCH[1]}; rest=${BASH_REMATCH[3]}
      [ -L "$root" ] && return 1
      IFS=/ read -ra comps <<< "$rest"
      n=${#comps[@]}; p=$root
      for ((i = 0; i < n; i++)); do
        comp=${comps[$i]}
        [ -n "$comp" ] || return 1
        p="$p/$comp"
        if [ "$i" -lt $((n - 1)) ] || [ "${w%/}" != "$w" ]; then
          case "$comp" in *'*'*|*'?'*) return 1 ;; esac
          [ -L "$p" ] && return 1
        fi
      done
    done
  done < <(printf '%s\n' "$subst" | tr ';&|()`' '\n')
  [ "$found" = 1 ]
}
RM_SCRATCH_ONLY=""
if match '(^|[[:space:]]|/|\\|\(|`)rm[[:space:]]' && rm_scratch_only; then
  RM_SCRATCH_ONLY=1
fi

# rm de $HOME ou /tmp com flags variáveis
# shellcheck disable=SC2016  # regex literal: casa a string '$HOME', não expande
if [ -z "$LEVEL" ] && [ -z "$RM_SCRATCH_ONLY" ] && match '(^|[[:space:]]|/|\\|\(|`)rm[[:space:]]+([-][^/[:space:]]+[[:space:]]+)*\$HOME(/|[[:space:]]|$)'; then
  LEVEL="N1"
fi
if [ -z "$LEVEL" ] && [ -z "$RM_SCRATCH_ONLY" ] && match '(^|[[:space:]]|/|\\|\(|`)rm[[:space:]]+([-][^/[:space:]]+[[:space:]]+)*/tmp(/|[[:space:]]|$)'; then
  LEVEL="N1"
fi
# Catch-all: rm com flag recursiva/força (-r, -f, -rf, -fr, --recursive,
# --force, ...) contra QUALQUER outro path não coberto pelas regras acima
# (/forensics já é N3; $HOME/.prumo e /tmp já são N1 acima). Sem isto,
# `rm -rf /qualquer/outro/caminho/prod` não batia nenhum pattern específico
# e passava sem aprovação (exit 0 silencioso).
#
# Fronteira de palavra obrigatória: sem ela, "deploy --confirm -f" e
# "terraform -force x" batiam falsamente porque "confirm"/"terraform" contêm
# "rm" como substring, seguido de "-f"/"-force" que a classe de flags aceita.
if [ -z "$LEVEL" ] && [ -z "$RM_SCRATCH_ONLY" ] && match '(^|[[:space:]]|/|\\|\(|`)rm[[:space:]]+(-[a-zA-Z]*[rf][a-zA-Z]*|--recursive|--force)\b'; then
  LEVEL="N1"
fi

# ────────────────────────────────────────────────────────────────────────────
# Exfiltração e escrita através de pipe.
#
# Estes dois padrões viviam no `pre-tool-vault-ttl.sh` — não por regra própria,
# mas como efeito colateral do desenho "não está na allowlist ⇒ exige token ⇒
# sem token, bloqueia". Um `curl` hostil era travado por não ter credenciais de
# Vault, e a mensagem dizia "VAULT_TOKEN ausente". Bloqueava pelo motivo errado
# e com o texto errado, e só em `prod` — em `dev` limitava-se a avisar.
#
# Aqui é um controlo com nome próprio, e o approval-gate bloqueia em `dev` tanto
# como em `prod` (ver a tabela de modos no secops/CLAUDE.md), portanto a
# cobertura aumenta em vez de diminuir.
#
# Corpus: vt-06 e vt-08, movidos de vault-ttl para approval-gate.
#
# N1 e não N2: é destrutivo/exfiltrante local, da mesma classe do `rm -rf`
# acima. O que se quer é o reconhecimento explícito, não uma escalada.
# ────────────────────────────────────────────────────────────────────────────

# Dados do pipeline para a rede: `... | curl`, `... | wget`, `... | nc`.
# Exige o pipe — um `curl https://api/x` a descarregar não é exfiltração.
if [ -z "$LEVEL" ] && match '\|[[:space:]]*(curl|wget|nc|ncat|socat)([[:space:]]|$)'; then
  LEVEL="N1"
fi

# Escrita de ficheiro no fim de um pipeline: `... | tee <path>`.
# `tee` sem argumento de ficheiro só duplica para stdout — não casa.
if [ -z "$LEVEL" ] && match '\|[[:space:]]*tee[[:space:]]+(-[a-zA-Z]+[[:space:]]+)*[^-[:space:]]'; then
  LEVEL="N1"
fi

# Não-destrutivo → passa
[ -z "$LEVEL" ] && exit 0

# ────────────────────────────────────────────────────────────────────────────
# Modo lab · bypass integral, registado
# ────────────────────────────────────────────────────────────────────────────
#
# Decisão explícita do dono (2026-08-01): em `lab` os três níveis passam,
# incluindo N3. Antes deste ponto o gate ignorava o modo por completo, o que
# tornava `lab` incoerente — silenciava o pii-redact e o second-opinion mas
# mantinha os DROPs bloqueados, o inverso do que a intuição sugere.
#
# O que isto NÃO é: uma redução de segurança real. Estes níveis sempre foram
# speed-bumps e audit-log dentro do domínio de confiança do agente — o próprio
# `secops/CLAUDE.md` o diz. A barreira efectiva contra execução não-autorizada
# continua a ser o prompt de permissão nativo da tool Bash do Claude Code, que
# `lab` não toca.
#
# O que se perde e é preciso assumir: o N3 cobre 4 padrões irreversíveis, e um
# deles (`rm` sobre o dir de forensics) destrói evidência de IR. Em `lab` deixa
# de ter travão próprio. O marker `~/.prumo/lab-mode` é a única fronteira, e é
# um ficheiro que o agente consegue criar — logo `lab` é uma decisão humana
# sobre a máquina, não uma garantia técnica.
#
# Contrapartida obrigatória: em `lab` o registo é MAIS detalhado, não menos.
# O bloqueio desaparece; o rasto não pode desaparecer com ele.
#
# NÃO escrever o log aqui. O caminho de escrita no fim do ficheiro faz `umask
# 077`, `chmod 600` e redacção de credenciais (user:pass@, Bearer, token=,
# VAULT_TOKEN=, Keychain -w). Um segundo caminho de escrita duplicaria a lógica
# e perderia essas garantias — e em lab o comando registado é MAIS provável de
# conter credenciais, não menos, porque se está a experimentar.
LAB_BYPASS=""
if [ "$(prumo_mode)" = "lab" ]; then
  LAB_BYPASS=1
fi

# ────────────────────────────────────────────────────────────────────────────
# Gate
# ────────────────────────────────────────────────────────────────────────────

# ────────────────────────────────────────────────────────────────────────────
# Aprovação por comando · ficheiro escrito por ação humana (prumo-guard)
# ────────────────────────────────────────────────────────────────────────────
# ~/.prumo/approvals/ é protegido pelo self-guard do prumo-base em todos os
# modos, mas no Bash essa proteção é best effort (indirecções como `cd ~ && cd
# .prumo` escapam). Por isso o ficheiro também se valida aqui: expirado, de
# outro nível ou com um expires para lá de 10 minutos (o máximo que o
# prumo-guard escreve) não serve e é limpo. Uma aprovação forjada nunca dura
# mais do que isso.
APPROVED_BY_FILE=""
APPROVAL_FILE="${PRUMO_HOME:-$HOME/.prumo}/approvals/${APPROVAL_ID}"
APPROVAL_MAX_TTL=600
if [ -z "$LAB_BYPASS" ] && [ "${PRUMO_APPROVE:-}" != "$LEVEL" ] && [ -n "$APPROVAL_ID" ] && [ -r "$APPROVAL_FILE" ]; then
  AF_LEVEL=$(sed -n 's/^level=//p' "$APPROVAL_FILE" | head -1)
  AF_EXP=$(sed -n 's/^expires=//p' "$APPROVAL_FILE" | head -1)
  AF_SCOPE=$(sed -n 's/^scope=//p' "$APPROVAL_FILE" | head -1)
  NOW=$(date +%s)
  if [ "$AF_LEVEL" = "$LEVEL" ] && [[ "$AF_EXP" =~ ^[0-9]{1,12}$ ]] && [ "$AF_EXP" -gt "$NOW" ] \
     && [ "$AF_EXP" -le $((NOW + APPROVAL_MAX_TTL)) ]; then
    APPROVED_BY_FILE=1
    [ "$AF_SCOPE" = "once" ] && rm -f "$APPROVAL_FILE"
  else
    rm -f "$APPROVAL_FILE"
  fi
fi

if [ -z "$LAB_BYPASS" ] && [ "${PRUMO_APPROVE:-}" != "$LEVEL" ] && [ -z "$APPROVED_BY_FILE" ]; then
  CMD_PREVIEW=$(printf '%s' "$CMD" | head -c 100)
  # `PRUMO_APPROVE=Nx <comando>` era a instrução antiga e é impossível de seguir:
  # este hook corre no ambiente do Claude Code, não no do comando, por isso um
  # prefixo inline aplica-se ao processo filho — que só arranca depois de o hook
  # aprovar — e nunca ao hook. Seguir a instrução dava exactamente o mesmo bloqueio,
  # e sem outra saída documentada o gate ficava intransponível dentro da sessão.
  # A autorização tem de vir por um canal que exista antes do hook correr.
  cat >&2 <<EOF
[prumo-secops/approval-gate] Operação ${LEVEL} detectada:
  ${CMD_PREVIEW}

approval-id: ${APPROVAL_ID:-indisponível}

Para autorizar só este comando (ação do humano):
  · com o prumo-guard: responde ao diálogo de aprovação (1: só esta · 2: 10 minutos)
Para autorizar todas as operações ${LEVEL} da sessão:
  · settings.json → env.PRUMO_APPROVE = ${LEVEL} (retirar no fim)
Em modo 'lab' (com o marker ~/.prumo/lab-mode) os três níveis passam e ficam
registados em approvals.log com via=lab-bypass.

Níveis (prumo-secops):
  N1 = destrutivo local
  N2 = cross-tenant ou prod data
  N3 = catastrophic

Audit log: ${PRUMO_LOG_DIR:-\$HOME/.prumo/log}/approvals.log
EOF
  exit 2
fi

# ────────────────────────────────────────────────────────────────────────────
# Autorizado — log (best-effort; falha de I/O não bloqueia decisão)
# ────────────────────────────────────────────────────────────────────────────

# umask 077 · approvals.log pode conter fragmentos de comandos com credenciais
# embutidas (URLs com user:pass, tokens) — nunca criar com permissões ambiente
# (umask por defeito pode deixar o ficheiro world/group-readable).
umask 077
LOG_DIR="$PRUMO_LOG_DIR"
if mkdir -p "$LOG_DIR" 2>/dev/null; then
  # Redacta formas comuns de credencial antes de persistir: URLs com
  # user:pass@, Bearer tokens, token=..., VAULT_TOKEN=..., e o valor de -w
  # SÓ no contexto Keychain (`security find-generic-password ... -w`) — um
  # `-w` genérico mangla logs benignos como `grep -w foo` sem essa condição.
  CMD_LOG=$(printf '%s' "$CMD" | head -c 200 | sed -E \
    -e 's#(://[^:/@[:space:]]+:)[^@[:space:]]+(@)#\1***\2#g' \
    -e 's/([Bb]earer)[[:space:]]+[^[:space:]]+/\1 ***/g' \
    -e 's/([Tt]oken=)[^[:space:]&]+/\1***/g' \
    -e 's/(VAULT_TOKEN=)[^[:space:]]+/\1***/g' \
    -e '/security/{
/find-generic-password/{
s/(-w)([[:space:]]+[^[:space:]]+)?/\1 ***/g
}
}')
  touch "$LOG_DIR/approvals.log" 2>/dev/null && chmod 600 "$LOG_DIR/approvals.log" 2>/dev/null || true
  # `via=` distingue as duas origens de autorização no mesmo formato de linha —
  # um audit log com dois formatos é mais difícil de ler e de parsear.
  # Condicional simples, não `${V:+a}${V:-b}`: com V=1 o segundo devolve o VALOR
  # ("1"), não o default, e a concatenação sai "lab-bypass1". Verificado.
  if [ -n "$LAB_BYPASS" ]; then VIA="lab-bypass"
  elif [ -n "$APPROVED_BY_FILE" ]; then VIA="approval-file"
  else VIA="approve-env"; fi
  echo "$(date -u +%FT%TZ) | level=$LEVEL | via=$VIA | user=${USER:-unknown} | cmd=${CMD_LOG}" \
    >> "$LOG_DIR/approvals.log" 2>/dev/null || true
fi
if [ -n "$LAB_BYPASS" ]; then
  prumo_telemetry_record prumo-secops approval-gate "bypass"
  # shellcheck disable=SC2034  # lido pelo trap _prumo_tm_on_exit em prumo-common.sh
  PRUMO_TM_RECORDED=1
  echo "[prumo-secops/approval-gate] ${LEVEL} IGNORADO — modo lab. Registado em approvals.log." >&2
else
  echo "[prumo-secops/approval-gate] ${LEVEL} autorizado (${VIA}) · registado." >&2
fi

exit 0

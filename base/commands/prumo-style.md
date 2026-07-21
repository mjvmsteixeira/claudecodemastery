---
name: prumo-style
description: Injecta/remove um bloco de regras de output conciso ("talk-normal") num CLAUDE.md, delimitado por marcadores, idempotente e versionado. Dois perfis — normal e focus. Sem argumentos = status. Scope projecto por default; --user para o ~/.claude/CLAUDE.md global.
allowed-tools: Bash, Read
---

# /prumo-style

Activa ou remove um estilo de output conciso e directo, injectando um bloco versionado e delimitado por marcadores num `CLAUDE.md` — o canal nativo que o Claude Code relê no arranque de cada sessão. Mesmo mecanismo do `install.sh` do talk-normal (MIT); as regras de execução multi-passo do perfil `focus` derivam do `ayghri/i-have-adhd` (MIT).

Uso:

```
/prumo-style                      # status: bloco, versão e perfil (projecto + user)
/prumo-style on                   # injecta no ./CLAUDE.md do PROJECTO (scope default)
/prumo-style on --profile focus   # perfil focus: acrescenta regras de execução multi-passo
/prumo-style on --user            # injecta no ~/.claude/CLAUDE.md (global)
/prumo-style off [--user]         # remove o bloco do scope indicado
```

**Scope default = projecto** de propósito: se já tens regras de estilo no `~/.claude/CLAUDE.md` global, não as queres duplicar. Per-projecto activa concisão num repo sem tocar no global. Usa `--user` para o efeito global.

**Perfil default = `normal`**. O `focus` acrescenta regras que só fazem sentido em execução de tarefas multi-turno (reafirmar estado, tornar visível o que já funciona, terminar com uma acção seguinte). Em Q&A puro essas regras contradizem "sem labels de fecho" — por isso ficam fora do perfil default.

## Passo único — parse, status e acção

Corre este bloco. É self-contained (status sempre; `on`/`off` só agem quando pedidos). Antes de qualquer escrita faz backup do `CLAUDE.md` em `~/.prumo/backups/` — nunca editamos um ficheiro do utilizador sem rede.

```bash
set -u
STYLE_VERSION="2"
BEGIN_RE='<!-- prumo-style BEGIN'
LEGACY_RE='<!-- wire-style BEGIN'  # marcador antigo (pré-rebrand); tratado como alias

# ── helpers (backup/log) da prumo-common.sh; fallback se a lib não estiver presente ──
LIB="${CLAUDE_PLUGIN_ROOT:-}/lib/prumo-common.sh"
[ -f "$LIB" ] && . "$LIB"
if ! declare -F prumo_backup >/dev/null 2>&1; then
  prumo_backup() {
    local l="${1}"; shift
    local d="${HOME}/.prumo/backups"; mkdir -p "$d" 2>/dev/null || true
    local o="$d/${l}-$(date -u +%Y%m%d-%H%M%S).tgz"
    tar czf "$o" "$@" 2>/dev/null && echo "$o"
  }
fi
declare -F prumo_log >/dev/null 2>&1 || prumo_log() { :; }

# ── parse $ARGUMENTS ──
# NB: dentro das funções auxiliares abaixo os parâmetros são SEMPRE escritos com
# chavetas — ${1}, nunca a forma nua. Num slash command o harness substitui as
# variáveis posicionais nuas (cifrão seguido de dígito) pelos argumentos da
# invocação antes do bloco correr; uma forma nua numa função passaria a valer o
# argumento do command (ex: "--profile") e a função operaria sobre um ficheiro
# inexistente. A forma com chavetas sobrevive (como ${1:-normal} no build_block).
# O $ARGUMENTS logo abaixo É a substituição desejada, essa fica.
ACTION="status"; SCOPE="project"; PROFILE="normal"; PROFILE_EXPLICIT=0; WANT_PROFILE=0
for a in $ARGUMENTS; do
  if [ "$WANT_PROFILE" = 1 ]; then
    case "$a" in
      normal|focus) PROFILE="$a"; PROFILE_EXPLICIT=1 ;;
      *) echo "perfil desconhecido: $a (usa normal|focus)" >&2 ;;
    esac
    WANT_PROFILE=0; continue
  fi
  case "$a" in
    --user|user)    SCOPE="user" ;;
    --project)      SCOPE="project" ;;
    --profile)      WANT_PROFILE=1 ;;
    --profile=*)    PROFILE="${a#--profile=}"; PROFILE_EXPLICIT=1 ;;
    on|off|status)  ACTION="$a" ;;
    *) echo "arg ignorado: $a" >&2 ;;
  esac
done
case "$PROFILE" in
  normal|focus) ;;
  *) echo "perfil desconhecido: $PROFILE — a usar normal" >&2; PROFILE="normal"; PROFILE_EXPLICIT=0 ;;
esac

target_for() { [ "${1}" = user ] && echo "${HOME}/.claude/CLAUDE.md" || echo "${PWD}/CLAUDE.md"; }
has_block() { grep -Eq "$BEGIN_RE|$LEGACY_RE" "${1}" 2>/dev/null; }
present_version() {
  [ -f "${1}" ] || { echo ""; return; }
  grep -Eo '<!-- (prumo|wire)-style BEGIN v[0-9][0-9]*' "${1}" 2>/dev/null | grep -o 'v[0-9][0-9]*' | head -1
}
present_profile() {
  [ -f "${1}" ] || { echo ""; return; }
  grep -Eo 'prumo-style BEGIN v[0-9][0-9]* profile=[a-z][a-z]*' "${1}" 2>/dev/null | sed 's/.*profile=//' | head -1
}
strip_block() {  # imprime ${1} sem o bloco prumo-style ou o legacy wire-style
  awk '
    /<!-- prumo-style BEGIN/ { skip=1 }
    /<!-- wire-style BEGIN/  { skip=1 }
    skip==0 { print }
    /<!-- prumo-style END -->/ { skip=0; next }
    /<!-- wire-style END -->/  { skip=0; next }
  ' "${1}"
}
build_block() {
  local p="${1:-normal}"
  cat <<EOF
<!-- prumo-style BEGIN v${STYLE_VERSION} profile=${p} -->
## Prumo Style — output conciso (gerido por /prumo-style · não editar à mão)
- Responde com a conclusão primeiro; contexto depois e só se necessário.
- Afirmações positivas: diz o que É, evita "não é X, é Y".
- Sem filler ("vale a pena notar", "com todo o gosto") nem labels de resumo/fecho.
- Yes/no numa frase + razão. Conceptual: 3-5 frases.
- Estrutura (bullets/numeração) só quando há sequência natural.
- Sem menus hipotéticos ("se quiseres, também posso…").
- Passos numerados: uma acção por passo, sem "e depois" dentro do mesmo passo.
- Listas com no máximo 5 itens; acima disso separa "agora" de "depois".
- Erros: causa e correcção directas, sem hedging nem dramatização.
EOF
  if [ "$p" = focus ]; then
    cat <<EOF
- Em execução multi-passo, reafirma o estado a cada turno ("3 de 5: schema actualizado").
- Torna visível o que já funciona, em termos concretos ("o login já aceita magic links").
- Fecha com UMA acção seguinte concreta, executável em menos de dois minutos.
- Estimativas de tempo em unidades concretas, nunca "rápido" ou "demora um pouco".
EOF
  fi
  echo '<!-- prumo-style END -->'
}

TARGET="$(target_for "$SCOPE")"

# ── STATUS (sempre) ──
echo "=== /prumo-style — estado ==="
for s in project user; do
  f="$(target_for "$s")"; v="$(present_version "$f")"; pp="$(present_profile "$f")"
  if   [ -n "$v" ];   then echo "  [$s] $f  → bloco presente ($v, perfil ${pp:-normal})"
  elif [ -f "$f" ];   then echo "  [$s] $f  → sem bloco"
  else                     echo "  [$s] $f  → ficheiro inexistente"
  fi
done
echo "Alvo desta invocação: $SCOPE → $TARGET"
echo

# ── ON ──
if [ "$ACTION" = "on" ]; then
  if [ "$PROFILE_EXPLICIT" = 0 ]; then
    keep="$(present_profile "$TARGET")"
    [ -n "$keep" ] && PROFILE="$keep"
  fi
  if [ -f "$TARGET" ]; then
    bk="$(prumo_backup "claude-md-$SCOPE" "$TARGET")"; [ -n "$bk" ] && echo "backup: $bk"
  else
    mkdir -p "$(dirname "$TARGET")" 2>/dev/null || true; : > "$TARGET"
    echo "criado $TARGET (não existia)"
  fi
  tmp="$(mktemp)"
  if has_block "$TARGET"; then
    printf '%s\n\n' "$(strip_block "$TARGET")" > "$tmp"
    build_block "$PROFILE" >> "$tmp"; mv "$tmp" "$TARGET"
    echo "OK · bloco actualizado para v${STYLE_VERSION} (perfil ${PROFILE}) em $TARGET"
  else
    [ -s "$TARGET" ] && printf '\n' >> "$TARGET"
    build_block "$PROFILE" >> "$TARGET"; rm -f "$tmp"
    echo "OK · bloco v${STYLE_VERSION} (perfil ${PROFILE}) injectado em $TARGET"
  fi
  prumo_log prumo-base style "on $SCOPE v${STYLE_VERSION} profile=${PROFILE}"
fi

# ── OFF ──
if [ "$ACTION" = "off" ]; then
  if [ ! -f "$TARGET" ] || ! has_block "$TARGET"; then
    echo "nada a remover · $TARGET não tem bloco prumo-style"
  else
    bk="$(prumo_backup "claude-md-$SCOPE" "$TARGET")"; [ -n "$bk" ] && echo "backup: $bk"
    tmp="$(mktemp)"; printf '%s\n' "$(strip_block "$TARGET")" > "$tmp"; mv "$tmp" "$TARGET"
    echo "OK · bloco prumo-style removido de $TARGET"
    prumo_log prumo-base style "off $SCOPE"
  fi
fi
```

## O que cada acção faz

| Acção | Efeito |
|-------|--------|
| `status` (default) | Reporta presença, versão e perfil do bloco em projecto e user. Não escreve. |
| `on` | Backup → injecta o bloco (ou substitui versão/perfil anterior). Idempotente: corre N vezes, resultado igual. Cria o `CLAUDE.md` se não existir. |
| `off` | Backup → remove só o bloco entre marcadores. O resto do ficheiro fica intacto. |

## Perfis

| Perfil | Regras | Quando |
|--------|--------|--------|
| `normal` (default) | 9 regras: conclusão primeiro, afirmações positivas, sem filler, respostas curtas, estrutura só quando natural, sem menus hipotéticos, um passo por acção, listas ≤ 5, erros directos. | Uso corrente — Q&A e trabalho normal. |
| `focus` | As 9 do `normal` + 4: reafirmar estado a cada turno, tornar visível o que já funciona, fechar com uma acção seguinte, estimativas de tempo concretas. | Execução agêntica longa, planos multi-fase, sessões em que o progresso precisa de ser legível. |

As 4 regras extra do `focus` ficam fora do default porque contradizem "sem labels de resumo/fecho" quando a resposta é só uma pergunta respondida. Em execução multi-passo deixam de ser filler e passam a ser o sinal de progresso.

## Notas

- O bloco é delimitado por `<!-- prumo-style BEGIN vN profile=X -->` / `<!-- prumo-style END -->`. Tudo fora dos marcadores nunca é tocado.
- Versionado: `on` com uma versão antiga presente substitui o bloco em vez de duplicar. Blocos `v1` (sem `profile=`) são lidos como `normal`.
- `on` sem `--profile` **preserva** o perfil já instalado; só muda de perfil quando o indicas explicitamente.
- Crédito: as regras extra do perfil `focus` são adaptadas de [`ayghri/i-have-adhd`](https://github.com/ayghri/i-have-adhd) (MIT).
- Migração: blocos legacy `<!-- wire-style BEGIN/END -->` (de antes do rebrand wire→prumo) são reconhecidos como alias — `on` substitui-os pelo bloco `prumo-style` actual, `off` remove-os na mesma.
- Backup automático antes de qualquer escrita → `~/.prumo/backups/claude-md-<scope>-<ts>.tgz`.
- O efeito é nativo e persistente: o Claude Code relê `CLAUDE.md` no arranque da próxima sessão. **Recarrega a sessão** para ver a mudança.
- Isto **não** é um hook nem reescreve output em runtime — é injecção de config. Não respeita `PRUMO_OPERATING_MODE` (não há decisão fail-closed; só toca num `CLAUDE.md`).
- Para reverter por completo: `/prumo-style off` (projecto) e/ou `/prumo-style off --user`.

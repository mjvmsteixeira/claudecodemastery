---
name: wire-style
description: Injecta/remove um bloco de regras de output conciso ("talk-normal") num CLAUDE.md, delimitado por marcadores, idempotente e versionado. Sem argumentos = status. Scope projecto por default; --user para o ~/.claude/CLAUDE.md global.
allowed-tools: Bash, Read
---

# /wire-style

Activa ou remove um estilo de output conciso e directo, injectando um bloco versionado e delimitado por marcadores num `CLAUDE.md` — o canal nativo que o Claude Code relê no arranque de cada sessão. Mesmo mecanismo do `install.sh` do talk-normal (MIT), mas no ficheiro certo do Claude Code.

Uso:

```
/wire-style                 # status: mostra se o bloco existe (projecto + user) e versão
/wire-style on              # injecta no ./CLAUDE.md do PROJECTO (scope default)
/wire-style on --user       # injecta no ~/.claude/CLAUDE.md (global)
/wire-style off [--user]    # remove o bloco do scope indicado
```

**Scope default = projecto** de propósito: se já tens regras de estilo no `~/.claude/CLAUDE.md` global, não as queres duplicar. Per-projecto activa concisão num repo sem tocar no global. Usa `--user` para o efeito global.

## Passo único — parse, status e acção

Corre este bloco. É self-contained (status sempre; `on`/`off` só agem quando pedidos). Antes de qualquer escrita faz backup do `CLAUDE.md` em `~/.wire/backups/` — nunca editamos um ficheiro do utilizador sem rede.

```bash
set -u
STYLE_VERSION="1"
BEGIN_RE='<!-- wire-style BEGIN'

# ── helpers (backup/log) da wire-common.sh; fallback se a lib não estiver presente ──
LIB="${CLAUDE_PLUGIN_ROOT:-}/lib/wire-common.sh"
[ -f "$LIB" ] && . "$LIB"
if ! declare -F wire_backup >/dev/null 2>&1; then
  wire_backup() {
    local l="$1"; shift
    local d="${HOME}/.wire/backups"; mkdir -p "$d" 2>/dev/null || true
    local o="$d/${l}-$(date -u +%Y%m%d-%H%M%S).tgz"
    tar czf "$o" "$@" 2>/dev/null && echo "$o"
  }
fi
declare -F wire_log >/dev/null 2>&1 || wire_log() { :; }

# ── parse $ARGUMENTS ──
ACTION="status"; SCOPE="project"
for a in $ARGUMENTS; do
  case "$a" in
    --user|user)    SCOPE="user" ;;
    --project)      SCOPE="project" ;;
    on|off|status)  ACTION="$a" ;;
    *) echo "arg ignorado: $a" >&2 ;;
  esac
done

target_for() { [ "$1" = user ] && echo "${HOME}/.claude/CLAUDE.md" || echo "${PWD}/CLAUDE.md"; }
present_version() {
  [ -f "$1" ] || { echo ""; return; }
  grep -o '<!-- wire-style BEGIN v[0-9][0-9]*' "$1" 2>/dev/null | grep -o 'v[0-9][0-9]*' | head -1
}
strip_block() {  # imprime $1 sem o bloco wire-style
  awk '
    /<!-- wire-style BEGIN/ { skip=1 }
    skip==0 { print }
    /<!-- wire-style END -->/ { skip=0; next }
  ' "$1"
}
build_block() {
  cat <<EOF
<!-- wire-style BEGIN v${STYLE_VERSION} -->
## Wire Style — output conciso (gerido por /wire-style · não editar à mão)
- Responde com a conclusão primeiro; contexto depois e só se necessário.
- Afirmações positivas: diz o que É, evita "não é X, é Y".
- Sem filler ("vale a pena notar", "com todo o gosto") nem labels de resumo/fecho.
- Yes/no numa frase + razão. Conceptual: 3-5 frases.
- Estrutura (bullets/numeração) só quando há sequência natural.
- Sem menus hipotéticos ("se quiseres, também posso…").
<!-- wire-style END -->
EOF
}

TARGET="$(target_for "$SCOPE")"

# ── STATUS (sempre) ──
echo "=== /wire-style — estado ==="
for s in project user; do
  f="$(target_for "$s")"; v="$(present_version "$f")"
  if   [ -n "$v" ];   then echo "  [$s] $f  → bloco presente ($v)"
  elif [ -f "$f" ];   then echo "  [$s] $f  → sem bloco"
  else                     echo "  [$s] $f  → ficheiro inexistente"
  fi
done
echo "Alvo desta invocação: $SCOPE → $TARGET"
echo

# ── ON ──
if [ "$ACTION" = "on" ]; then
  if [ -f "$TARGET" ]; then
    bk="$(wire_backup "claude-md-$SCOPE" "$TARGET")"; [ -n "$bk" ] && echo "backup: $bk"
  else
    mkdir -p "$(dirname "$TARGET")" 2>/dev/null || true; : > "$TARGET"
    echo "criado $TARGET (não existia)"
  fi
  tmp="$(mktemp)"
  if grep -q "$BEGIN_RE" "$TARGET" 2>/dev/null; then
    strip_block "$TARGET" > "$tmp"
    printf '\n' >> "$tmp"; build_block >> "$tmp"; mv "$tmp" "$TARGET"
    echo "OK · bloco actualizado para v${STYLE_VERSION} em $TARGET"
  else
    [ -s "$TARGET" ] && printf '\n' >> "$TARGET"
    build_block >> "$TARGET"; rm -f "$tmp"
    echo "OK · bloco v${STYLE_VERSION} injectado em $TARGET"
  fi
  wire_log wire-base style "on $SCOPE v${STYLE_VERSION}"
fi

# ── OFF ──
if [ "$ACTION" = "off" ]; then
  if [ ! -f "$TARGET" ] || ! grep -q "$BEGIN_RE" "$TARGET" 2>/dev/null; then
    echo "nada a remover · $TARGET não tem bloco wire-style"
  else
    bk="$(wire_backup "claude-md-$SCOPE" "$TARGET")"; [ -n "$bk" ] && echo "backup: $bk"
    tmp="$(mktemp)"; strip_block "$TARGET" > "$tmp"; mv "$tmp" "$TARGET"
    echo "OK · bloco wire-style removido de $TARGET"
    wire_log wire-base style "off $SCOPE"
  fi
fi
```

## O que cada acção faz

| Acção | Efeito |
|-------|--------|
| `status` (default) | Reporta presença + versão do bloco em projecto e user. Não escreve. |
| `on` | Backup → injecta o bloco (ou substitui versão antiga). Idempotente: corre N vezes, resultado igual. Cria o `CLAUDE.md` se não existir. |
| `off` | Backup → remove só o bloco entre marcadores. O resto do ficheiro fica intacto. |

## Notas

- O bloco é delimitado por `<!-- wire-style BEGIN vN -->` / `<!-- wire-style END -->`. Tudo fora dos marcadores nunca é tocado.
- Versionado: `on` com uma versão antiga presente substitui o bloco em vez de duplicar.
- Backup automático antes de qualquer escrita → `~/.wire/backups/claude-md-<scope>-<ts>.tgz`.
- O efeito é nativo e persistente: o Claude Code relê `CLAUDE.md` no arranque da próxima sessão. **Recarrega a sessão** para ver a mudança.
- Isto **não** é um hook nem reescreve output em runtime — é injecção de config. Não respeita `WIRE_OPERATING_MODE` (não há decisão fail-closed; só toca num `CLAUDE.md`).
- Para reverter por completo: `/wire-style off` (projecto) e/ou `/wire-style off --user`.

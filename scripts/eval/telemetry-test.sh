#!/usr/bin/env bash
# prumo · eval-harness · teste da telemetria dos guardrails
# Camada 1 (lib): record escreve a linha certa; summary agrega; fail_or_warn regista
#   warn/bypass. Camada 2 (hooks, Task 2) é acrescentada mais abaixo.
set -uo pipefail

EVAL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$EVAL_DIR/../.." && pwd)"
LIB="$REPO_ROOT/base/lib/prumo-common.sh"
FAILS=0
ok()  { printf '  ✓ %s\n' "$1"; }
bad() { printf '  ✗ %s\n' "$1"; FAILS=$((FAILS+1)); }

# Asserções sobre linhas TSV usam `$'\t'` (ANSI-C quoting: o bash expande para um
# tab real ANTES do grep), NUNCA `'\t'`: o GNU grep do CI (Linux) trata `\t` no
# pattern como literal, não como tab, e a asserção nunca casa. O BSD grep do
# macOS interpretava-o, por isso passava localmente e só rebentava no CI.

SANDBOX="$(mktemp -d "${TMPDIR:-/tmp}/prumo-tm.XXXXXX")"
cleanup() { rm -rf "$SANDBOX"; }
trap cleanup EXIT

# ── record escreve o schema certo, sem conteúdo de comando ────────────────────
( export HOME="$SANDBOX"; unset PRUMO_TM_RECORDED
  # shellcheck source=/dev/null
  source "$LIB"
  prumo_telemetry_record "prumo-secops" "approval-gate" "block"
  prumo_telemetry_record "prumo-secops" "approval-gate" "allow"
)
TSV="$SANDBOX/.prumo/log/telemetry.tsv"
if [ -f "$TSV" ] && [ "$(wc -l < "$TSV" | tr -d ' ')" = "2" ]; then ok "record: 2 linhas escritas"; else bad "record: telemetry.tsv não tem 2 linhas"; fi
if awk -F'\t' 'NF!=4{bad=1} END{exit bad+0}' "$TSV"; then ok "record: schema TSV de 4 campos"; else bad "record: schema TSV inválido"; fi
if grep -qE $'\tapproval-gate\tblock$' "$TSV"; then ok "record: linha block correcta"; else bad "record: linha block ausente"; fi

# ── summary agrega um tsv conhecido ───────────────────────────────────────────
KTSV="$SANDBOX/known.tsv"
{
  printf '2026-07-06T10:00:00Z\tprumo-secops\tapproval-gate\tblock\n'
  printf '2026-07-06T10:01:00Z\tprumo-secops\tapproval-gate\tallow\n'
  printf '2026-07-06T10:02:00Z\tprumo-secops\tapproval-gate\tallow\n'
  printf '2026-07-06T10:03:00Z\tprumo-secops\tpii-redact\twarn\n'
} > "$KTSV"
SUM=$( export HOME="$SANDBOX"; mkdir -p "$SANDBOX/.prumo/log"; cp "$KTSV" "$SANDBOX/.prumo/log/telemetry.tsv"
  # shellcheck source=/dev/null
  source "$LIB"; prumo_telemetry_summary )
if printf '%s\n' "$SUM" | grep -qE 'approval-gate .*block=1 .*allow=2 .*fire=1/3'; then ok "summary: approval-gate agregado"; else bad "summary: approval-gate errado — got: $(printf '%s' "$SUM" | tr '\n' '|')"; fi
if printf '%s\n' "$SUM" | grep -qE 'pii-redact .*warn=1 .*fire=1/1'; then ok "summary: pii-redact agregado"; else bad "summary: pii-redact errado"; fi

# ── fail_or_warn regista warn (dev) e bypass (lab) ────────────────────────────
run_fow() { # $1 = mode
  ( export HOME="$SANDBOX"; rm -f "$SANDBOX/.prumo/log/telemetry.tsv"
    mkdir -p "$SANDBOX/.prumo"; printf '%s\n' "$1" > "$SANDBOX/.prumo/mode"
    [ "$1" = lab ] && : > "$SANDBOX/.prumo/lab-mode"
    unset PRUMO_TM_RECORDED PRUMO_OPERATING_MODE
    # shellcheck source=/dev/null
    source "$LIB"; prumo_telemetry_init "prumo-base" "audit-guard"
    prumo_fail_or_warn "prumo-base" "audit-guard" "teste" ) >/dev/null 2>&1
  cat "$SANDBOX/.prumo/log/telemetry.tsv" 2>/dev/null
}
if run_fow dev | grep -qE $'\taudit-guard\twarn$'; then ok "fail_or_warn dev → warn"; else bad "fail_or_warn dev não registou warn"; fi
if run_fow lab | grep -qE $'\taudit-guard\tbypass$'; then ok "fail_or_warn lab → bypass"; else bad "fail_or_warn lab não registou bypass"; fi

# ── camada 2: integração — os hooks emitem telemetria ─────────────────────────
run_hook() { # $1 hook-path, $2 cmd, extra env via ambiente já exportado; imprime telemetry.tsv
  local sb; sb="$(mktemp -d "${TMPDIR:-/tmp}/prumo-tmh.XXXXXX")"
  mkdir -p "$sb/.claude/plugins/cache"
  # Provisiona um pseudo-install do prumo-base dentro do sandbox: sem isto,
  # secops/hooks/_lib.sh não encontra prumo-common.sh sob este $HOME isolado e
  # cai nos stubs no-op de prumo_telemetry_init/record (Task 1) — a asserção de
  # integração nunca poderia passar. Cópia (não symlink) porque _lib.sh faz
  # `find -type f`, que não bate em symlinks.
  mkdir -p "$sb/.claude/plugins/cache/prumo-base/0.0.0/lib" "$sb/.claude/plugins/cache/prumo-base/0.0.0/.claude-plugin"
  cp "$LIB" "$sb/.claude/plugins/cache/prumo-base/0.0.0/lib/prumo-common.sh"
  printf '{"name":"prumo-base"}' > "$sb/.claude/plugins/cache/prumo-base/0.0.0/.claude-plugin/plugin.json"
  local stdin; stdin=$(jq -cn --arg c "$2" '{tool_name:"Bash",tool_input:{command:$c}}')
  printf '%s' "$stdin" | env -u PRUMO_APPROVE -u PRUMO_SECOND_OPINION_BYPASS \
    HOME="$sb" PRUMO_OPERATING_MODE=prod bash "$1" >/dev/null 2>&1 || true
  cat "$sb/.prumo/log/telemetry.tsv" 2>/dev/null
  rm -rf "$sb"
}
AG="$REPO_ROOT/secops/hooks/pre-tool-approval-gate.sh"
# bloqueio: N-level sem PRUMO_APPROVE → exit 2 (negação) → trap regista block
if run_hook "$AG" "git push -f origin main" | grep -qE $'\tapproval-gate\tblock$'; then ok "hook: approval-gate block registado"; else bad "hook: approval-gate block não registado"; fi
# allow: comando trivial → exit 0 → trap regista allow
if run_hook "$AG" "ls -la" | grep -qE $'\tapproval-gate\tallow$'; then ok "hook: approval-gate allow registado"; else bad "hook: approval-gate allow não registado"; fi
# anti-PII: um marcador único do comando NUNCA aparece no telemetry.tsv
MARK="ZZUNIQUEMARKER42"
if run_hook "$AG" "git push -f origin $MARK" | grep -q "$MARK"; then bad "anti-PII: conteúdo do comando vazou para telemetry.tsv"; else ok "anti-PII: telemetry.tsv sem conteúdo de comando"; fi

echo
if [ "$FAILS" -eq 0 ]; then echo "✓ telemetry-test (lib) passou."; else echo "✗ $FAILS falha(s)."; exit 1; fi

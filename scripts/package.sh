#!/usr/bin/env bash
# scripts/package.sh — empacotador unificado dos 4 plugins prumo.
#
# Substitui o antigo secops/package.sh (asymmetric — só existia um).
# Corre validate.sh antes para apanhar problemas estruturais; salta com --no-validate.
#
# Uso:
#   ./scripts/package.sh                   # empacota os 4
#   ./scripts/package.sh base              # só prumo-base
#   ./scripts/package.sh base secops       # subset
#   ./scripts/package.sh --no-validate     # salta a validação prévia
#   ./scripts/package.sh --out /caminho    # outdir alternativo (default /tmp)
#
# Para cada plugin produz:
#   <outdir>/<plugin-name>.plugin (zip)
#
# Saída:
#   exit 0  — todos empacotados
#   exit 1  — validate.sh falhou
#   exit 2  — erro de packaging / argumento inválido

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
cd "$REPO_ROOT" || { echo "✗ cd para REPO_ROOT falhou: $REPO_ROOT" >&2; exit 2; }

# ──────────────────────── args ────────────────────────
OUT_DIR="/tmp"
SKIP_VALIDATE=0
SELECTED=()

while [ $# -gt 0 ]; do
  case "$1" in
    --no-validate) SKIP_VALIDATE=1; shift ;;
    --out) OUT_DIR="${2:-}"; shift 2 ;;
    -h|--help)
      grep -E '^# ' "$0" | sed 's/^# \{0,1\}//' | head -20
      exit 0
      ;;
    base|secops|devkit|design) SELECTED+=("$1"); shift ;;
    *) echo "package.sh: argumento desconhecido: $1" >&2; exit 2 ;;
  esac
done

[ "${#SELECTED[@]}" -eq 0 ] && SELECTED=(base secops devkit design)
mkdir -p "$OUT_DIR"

# ──────────────────────── 1. validação prévia ────────────────────────
if [ $SKIP_VALIDATE -eq 0 ]; then
  echo "── validação prévia ──"
  if ! ./scripts/validate.sh --skip-shellcheck >/dev/null 2>&1; then
    echo "✗ validate.sh falhou — corre './scripts/validate.sh' para detalhe ou usa --no-validate" >&2
    exit 1
  fi
  echo "✓ validate.sh OK"
  echo
fi

# ──────────────────────── 2. empacotar ────────────────────────
for p in "${SELECTED[@]}"; do
  plugin_name="prumo-$p"
  zip_path="${OUT_DIR}/${plugin_name}.plugin"

  echo "── ${plugin_name} ──"
  rm -f "$zip_path"

  # Garantir bit de execução em hooks/*.sh antes de empacotar
  if [ -d "$p/hooks" ]; then
    chmod +x "$p"/hooks/*.sh 2>/dev/null || true
  fi

  if ! ( cd "$p" && zip -r -q "$zip_path" . \
      -x "*.DS_Store" \
      -x "__MACOSX*" \
      -x "package.sh" \
      -x "smoke.sh" \
      -x ".orphaned_at" \
      -x "*.env" \
      -x "*.env.*" \
      -x ".env" \
      -x "*.pem" \
      -x "*.key" \
      -x "*.secret" \
      -x "secrets.json" \
      -x "*credentials.json" \
      -x ".credentials" \
      -x "vault-init.json" \
      -x "*.orig" ); then
    echo "✗ zip falhou para ${plugin_name}" >&2
    exit 2
  fi

  size=$(du -h "$zip_path" | awk '{print $1}')
  echo "  → ${zip_path} (${size})"
done

# ──────────────────────── 3. resumo ────────────────────────
echo
echo "── pronto ──"
for p in "${SELECTED[@]}"; do
  echo "  /plugin install ${OUT_DIR}/prumo-${p}.plugin"
done

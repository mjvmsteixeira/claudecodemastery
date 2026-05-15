#!/usr/bin/env bash
# Wire SecOps · empacotamento do plugin (v0.1.0)
# Executa este script na máquina do Marco (jump2new) para gerar o .plugin instalável.
set -euo pipefail

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PLUGIN_NAME="wire-secops"
OUT_DIR="${SCRIPT_DIR}/.."
TMP_ZIP="/tmp/${PLUGIN_NAME}.plugin"

echo "[1/4] Limpa zip anterior em ${TMP_ZIP}"
rm -f "${TMP_ZIP}"

echo "[2/4] Garante permissões dos hooks"
chmod +x "${SCRIPT_DIR}/hooks/"*.sh

echo "[3/4] Gera ${TMP_ZIP}"
( cd "${SCRIPT_DIR}" && zip -r "${TMP_ZIP}" . -x "*.DS_Store" -x "__MACOSX*" -x "package.sh" )

echo "[4/4] Copia para ${OUT_DIR}/${PLUGIN_NAME}.plugin"
cp "${TMP_ZIP}" "${OUT_DIR}/${PLUGIN_NAME}.plugin"

echo ""
echo "OK · plugin pronto em:"
echo "  ${OUT_DIR}/${PLUGIN_NAME}.plugin"
echo ""
echo "Instalar no Claude Code:"
echo "  /plugin install ${OUT_DIR}/${PLUGIN_NAME}.plugin"

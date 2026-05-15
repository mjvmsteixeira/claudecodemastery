#!/usr/bin/env bash
# wire-devkit · SessionStart · verifica plugins recomendados em falta.
# Não bloqueia — apenas emite nota de contexto.

set -u

# Procura wire-base na cache de plugins do Claude Code.
if ! find ~/.claude/plugins/cache -path "*/wire-base/*/.claude-plugin/plugin.json" -print -quit 2>/dev/null | grep -q .; then
  cat <<EOF
[wire-devkit] Note: o plugin recomendado wire-base não está instalado.
  Sem ele, /ngrok-expose não funciona (precisa de lib/vault-env.sh do base).
  Instalar: /plugin install wire-base@jump2new
  Os 5 audits (security/infra/ux/code-quality/performance) e o local-reviewer continuam a funcionar.
EOF
fi

exit 0

#!/usr/bin/env bash
# Wire SecOps · pre-tool · Gate de aprovação humana N1/N2/N3.
# Avalia o comando proposto e decide se exige confirmação.
# N1: alterações em config aplicacional. N2: contenção parcial / cross-tenant. N3: desligar produto / Vault root.
set -euo pipefail

CMD="${1:-$(cat)}"
LEVEL="0"

# N3 — desligar produto wire* completo, rollback prod, root Vault, ou rm em /forensics
if echo "$CMD" | grep -qE '(systemctl (stop|disable) puma-wire|cap production deploy:rollback|vault operator (seal|step-down)|DROP TABLE.*tenant|rm -rf /forensics)'; then
  LEVEL="N3"
fi

# N2 — cross-tenant queries, contenção parcial, rotação de keys, deploy em produção
if [ "$LEVEL" = "0" ] && echo "$CMD" | grep -qE '(cross-tenant|all-tenants|cap production deploy|psql.*-c.*WHERE.*tenant_id IS NULL|vault write transit/keys.*rotate|DELETE FROM)'; then
  LEVEL="N2"
fi

# N1 — restart de serviço, alteração de config Rails, rm em /tmp/wire
if [ "$LEVEL" = "0" ] && echo "$CMD" | grep -qE '(systemctl restart puma-wire|cap staging deploy|nginx -s reload|rm -rf /tmp/wire|vault kv put|bundle exec rails db:migrate)'; then
  LEVEL="N1"
fi

if [ "$LEVEL" = "0" ]; then
  exit 0  # operação read-only ou benigna, segue
fi

echo "[hook] APROVAÇÃO ${LEVEL} REQUERIDA para o comando:" >&2
echo "  $CMD" >&2
echo "" >&2
echo "Confirme com 'yes ${LEVEL}' para prosseguir (ou Enter/Ctrl+C para abortar):" >&2

read -r CONFIRM
if [ "$CONFIRM" != "yes ${LEVEL}" ]; then
  echo "[hook] Aprovação ${LEVEL} negada. Operação bloqueada." >&2
  exit 2
fi

# Regista no audit log local antes de prosseguir
echo "$(date -Iseconds) ${LEVEL} APPROVED: $CMD" >> /var/log/wire-secops-approvals.log 2>/dev/null || true
exit 0

#!/usr/bin/env bash
# shellcheck disable=SC2016  # patterns de allowlist são regex literais com '$' (não expandir)
# Wire SecOps · pre-tool · Vault TTL guard
#
# Política · "fail-open para diagnóstico, fail-closed para ops privilegiadas":
#
#   1) ALLOWLIST · comandos diagnósticos (health checks, doctors, token lookup,
#      ops sobre ficheiros locais) NÃO precisam de VAULT_TOKEN. Razão: precisam
#      de correr exactamente quando o token está ausente/expirado para
#      diagnosticar o problema. Sem allowlist criava-se um deadlock:
#      "doctor não corre porque não há token; token não pode ser obtido porque
#      doctor não corre."
#
#   2) Tudo o resto · exige VAULT_TOKEN com TTL >= 60s. Se ausente/expirado,
#      o hook bloqueia (fail-closed) com mensagem accionável.
#
# Mensagens de erro são pedagógicas — dizem ao engineer EXACTAMENTE como
# destrancar (login AppRole, renovar token, correr doctor, etc.).

set -euo pipefail
# shellcheck source=_lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

RAW_CMD=$(hook_tool_payload "${1:-}")
# Normaliza whitespace (newlines/tabs → espaço) — mirror de pre-tool-approval-gate.sh.
# Necessário para que a defesa anti-chaining abaixo veja payloads multi-line
# como uma única string.
CMD=$(printf '%s' "$RAW_CMD" | tr '\n\t' '  ')

# ────────────────────────────────────────────────────────────────────────────
# ALLOWLIST · padrões de comandos que não precisam de auth Vault.
# Estes são "públicos" (sys/health, sys/seal-status), introspectivos
# (token lookup do próprio token) ou diagnósticos do plugin.
# ────────────────────────────────────────────────────────────────────────────
ALLOWLIST_PATTERNS=(
  # Vault subcommands que não exigem token
  'vault[[:space:]]+(--version|version|status|-v|-h|--help)'
  'vault[[:space:]]+token[[:space:]]+lookup'
  'vault[[:space:]]+token[[:space:]]+renew'

  # Endpoints HTTP públicos do Vault (sem auth)
  '/v1/sys/health'
  '/v1/sys/seal-status'
  '/v1/sys/init'

  # Ollama health (não envolve Vault)
  '/api/tags\b'
  '/api/version\b'
  '/api/generate\b'

  # Doctors do plugin · existem precisamente para diagnosticar
  'prumo-vault-doctor'
  'prumo-ollama-doctor'
  'prumo-stack-doctor'

  # Bootstraps · precisam de correr quando ainda não há AppRole token.
  # Lêem root de vault-init.json internamente via lib/vault-env.sh.
  # Defesa em profundidade: cada comando valida policy='root' antes de
  # qualquer escrita — a allowlist não autoriza nada destrutivo sozinha.
  # Origem: plano docs/superpowers/plans/2026-05-19-wire-vault-bootstraps/
  'prumo-vault-bootstrap'
  'prumo-secops-bootstrap'
  'prumo-vault-kv-migrate'

  # Setup inicial · ler ficheiros de init/credentials (não usa Vault)
  'vault-init\.json'
  'approle-credentials\.json'

  # Operações puramente locais que não tocam Vault
  '^[[:space:]]*(ls|cat|head|tail|grep|find|stat|file|wc|cut|sort|uniq|tr|sed|awk)[[:space:]]+'
  '^[[:space:]]*(echo|printf|pwd|date|uname|whoami|env|true|false)[[:space:]]*'
  '^[[:space:]]*(which|type|command|hash)[[:space:]]+'
  '^[[:space:]]*(brew|docker|systemctl)[[:space:]]+(list|ls|ps|status|info|--help)'

  # Manipulação de arquivos locais · não envolve Vault nem tenants
  '^[[:space:]]*(unzip|zip|tar|gunzip|bunzip2|xz|gzip|bzip2)[[:space:]]'
  '^[[:space:]]*(mkdir|cp|mv|chmod|chown|ln|touch)[[:space:]]'
  # rm é split — permitido em /tmp/, $HOME/.prumo/, ou paths relativos puros.
  # Pattern 3 exige que o primeiro char do target NÃO seja '/' (system path),
  # NÃO seja '-' (flag solto a contar como target), NÃO seja '$' (qualquer
  # $HOME/<x> excepto $HOME/.prumo/ vai pelo approval-gate). Operações
  # destrutivas em system paths exigem VAULT_TOKEN; cross-tenant exige N2.
  '^[[:space:]]*rm[[:space:]]+(-[^[:space:]/]+[[:space:]]+)?/tmp(/|[[:space:]]|$)'
  '^[[:space:]]*rm[[:space:]]+(-[^[:space:]/]+[[:space:]]+)?\$HOME/\.prumo(/|[[:space:]]|$)'
  '^[[:space:]]*rm[[:space:]]+(-[^[:space:]/]+[[:space:]]+)?[^/$[:space:]-]'

  # Navegação git read-only e tooling local
  '^[[:space:]]*git[[:space:]]+(status|log|diff|show|branch|tag|remote|fetch|ls-files|rev-parse|config[[:space:]]+--get)'
  '^[[:space:]]*(jq|yq|xmllint|md5|sha256sum|shasum|base64)[[:space:]]'
)

# Defesa anti-chaining: um comando com metacharacters de shell (;, &&, ||,
# backtick, $() pode "esconder" uma ops privilegiada atrás de um prefixo
# inofensivo (ex: "vault status; rm -rf /prod"). A allowlist só é um fast-path
# válido para um comando simples único — se houver chaining deste tipo, cai
# sempre para a exigência de VAULT_TOKEN abaixo, independentemente do que a
# allowlist diria.
#
# Pipe (|) é tratado à parte (ver bloco abaixo): um pipeline read-only de
# diagnóstico (ex: "vault status | grep sealed", "git log | head -5") não deve
# perder o fast-path só por ter um pipe — mas só é permitido se CADA segmento,
# avaliado isoladamente, for ele próprio allowlisted ou um filtro read-only
# puro. Isto evita o buraco simétrico de validar a string inteira sem split
# (um pattern allowlist como '^...vault status' bateria como prefixo de
# "vault status | curl evil" mesmo sem o segmento "curl evil" ser seguro).
HAS_CHAIN=0
case "$CMD" in
  *';'*|*'&&'*|*'||'*|*'`'*|*'$('*) HAS_CHAIN=1 ;;
esac

HAS_PIPE=0
case "$CMD" in
  *'|'*) HAS_PIPE=1 ;;
esac

# Filtros read-only puros aceites como segmento de pipeline mesmo sem baterem
# num pattern da allowlist geral (ex: "grep sealed", "head -5", "jq .field").
PIPE_FILTER_REGEX='^(grep|head|tail|awk|sed|cut|sort|uniq|wc|jq|less|cat)([[:space:]]|$)'

if [ "$HAS_CHAIN" -eq 0 ] && [ "$HAS_PIPE" -eq 1 ]; then
  ALLOWED_PIPE=1
  IFS='|' read -ra PIPE_SEGMENTS <<< "$CMD"
  for seg in "${PIPE_SEGMENTS[@]}"; do
    SEG_TRIMMED=$(printf '%s' "$seg" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')
    if [ -z "$SEG_TRIMMED" ]; then
      ALLOWED_PIPE=0
      break
    fi
    SEG_OK=0
    if printf '%s' "$SEG_TRIMMED" | grep -qE "$PIPE_FILTER_REGEX"; then
      SEG_OK=1
    else
      for pattern in "${ALLOWLIST_PATTERNS[@]}"; do
        if printf '%s' "$SEG_TRIMMED" | grep -qE "$pattern"; then
          SEG_OK=1
          break
        fi
      done
    fi
    if [ "$SEG_OK" -eq 0 ]; then
      ALLOWED_PIPE=0
      break
    fi
  done

  if [ "$ALLOWED_PIPE" -eq 1 ]; then
    echo "[hook] vault-ttl · pipeline allowlisted (todos os segmentos são allowlisted ou filtros read-only)" >&2
    exit 0
  else
    echo "[hook] vault-ttl · pipeline contém segmento não-allowlisted — allowlist ignorada, exige VAULT_TOKEN" >&2
  fi
elif [ "$HAS_CHAIN" -eq 0 ]; then
  for pattern in "${ALLOWLIST_PATTERNS[@]}"; do
    if echo "$CMD" | grep -qE "$pattern"; then
      echo "[hook] vault-ttl · allowlisted ($pattern)" >&2
      exit 0
    fi
  done
else
  echo "[hook] vault-ttl · comando contém chaining/substituição de shell — allowlist ignorada, exige VAULT_TOKEN" >&2
fi

# ────────────────────────────────────────────────────────────────────────────
# Para tudo o resto · exige VAULT_TOKEN
# ────────────────────────────────────────────────────────────────────────────
if [ -z "${VAULT_TOKEN:-}" ]; then
  cat >&2 <<'EOF'
[hook] vault-ttl · VAULT_TOKEN ausente — bloqueia (fail-closed).

Diagnóstico (não exige token, está em allowlist):
  /prumo-vault-doctor      # verifica server + descobre porque falta token
  /prumo-stack-doctor      # diagnóstico global

Destrancar via AppRole (preferível, TTL curto):
  export VAULT_ADDR=https://127.0.0.1:8200
  export VAULT_CACERT=~/.prumo/vault-ca.pem
  export VAULT_ROLE_ID=$(security find-generic-password \
    -a wire-secops -s vault-role-id -w)
  export VAULT_SECRET_ID=$(security find-generic-password \
    -a wire-secops -s vault-secret-id -w)
  export VAULT_TOKEN=$(vault write -field=token \
    auth/approle/login \
    role_id="$VAULT_ROLE_ID" secret_id="$VAULT_SECRET_ID")

Modo dev (formação, Vault em Docker):
  export VAULT_ADDR=http://127.0.0.1:8200
  export VAULT_TOKEN=dev-only-root
EOF
  prumo_fail_or_warn "prumo-secops" "vault-ttl" "VAULT_TOKEN ausente"
fi

# ────────────────────────────────────────────────────────────────────────────
# Valida TTL · só se 'vault' CLI estiver disponível
# ────────────────────────────────────────────────────────────────────────────
if command -v vault >/dev/null 2>&1; then
  TTL=$(vault token lookup -format=json 2>/dev/null | jq -r '.data.ttl // 0' 2>/dev/null || echo 0)

  if [ "$TTL" -lt 60 ]; then
    cat >&2 <<EOF
[hook] vault-ttl · TTL remanescente = ${TTL}s (mínimo 60s).

Renovar (preserva o mesmo token):
  vault token renew

Re-login completo (novo token, TTL fresco):
  /prumo-vault-doctor

Diagnóstico (se renew falhar):
  /prumo-vault-doctor
EOF
    prumo_fail_or_warn "prumo-secops" "vault-ttl" "TTL=${TTL}s abaixo do mínimo 60s"
  fi

  echo "[hook] vault-ttl · OK (TTL=${TTL}s)" >&2
fi

exit 0

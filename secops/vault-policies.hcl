# ============================================================================
# SecOps · Vault Policies HCL
# TEMPLATE: {{PREFIX}} é substituído por `prumo_org prefix` antes de aplicar.
# ============================================================================
# Sete AppRoles: 6 com subagent local (prumo-monitor-01, prumo-ir-saas-01, prumo-tenant-01,
# prumo-srv-saas-01, prumo-deploy-01, prumo-compliance-01) + Cowork `{{PREFIX}}-cowork-reporting`
# externo (Cowork agent `ai-rep-01`, sem subagent neste plugin). TTLs deliberadamente curtos.
# Os comandos de criação dos AppRoles estão no fim do ficheiro.
# ============================================================================

# ----------------------------------------------------------------------------
# {{PREFIX}}-monitor — prumo-monitor-01 (read-only sobre observabilidade)
# ----------------------------------------------------------------------------
path "secret/data/observability/wazuh/*" {
  capabilities = ["read"]
}
path "secret/data/observability/zabbix/*" {
  capabilities = ["read"]
}
path "secret/data/observability/prometheus/*" {
  capabilities = ["read"]
}
path "secret/data/observability/otel/*" {
  capabilities = ["read"]
}

# ----------------------------------------------------------------------------
# {{PREFIX}}-ir — prumo-ir-saas-01 (IR multi-tenant, mais permissivo, TTL curto)
# ----------------------------------------------------------------------------
path "secret/data/ir/*" {
  capabilities = ["read", "create", "update"]
}
path "ssh/sign/{{PREFIX}}-ir-role" {
  capabilities = ["create", "update"]
}
path "transit/encrypt/forensics" {
  capabilities = ["create", "update"]
}
path "transit/decrypt/forensics" {
  capabilities = ["create", "update"]
}
# audit-hash: necessário para correlation evidence em IR (HMAC dos audit log entries
# para cross-reference sem expor o input cleartext). Wide scope deliberado — prumo-ir-saas-01
# é o único AppRole que precisa de assinar evidência durante uma investigação.
path "sys/audit-hash/*" {
  capabilities = ["create", "update"]
}

# ----------------------------------------------------------------------------
# {{PREFIX}}-tenant — prumo-tenant-01 (auditoria de isolamento)
# ----------------------------------------------------------------------------
path "secret/data/tenants/metadata/*" {
  capabilities = ["read"]
}
path "secret/data/db/schemas/*" {
  capabilities = ["read"]
}
# NÃO tem acesso a chaves transit por tenant — só metadados.
# sys/policies/acl: read-only para audit cross-tenant (validar que outras policies
# não dão acesso indevido a tenant data). Apenas introspecção, sem escrita.
path "sys/policies/acl/*" {
  capabilities = ["read"]
}

# ----------------------------------------------------------------------------
# {{PREFIX}}-srv — prumo-srv-saas-01 (operações servidor, SSH CA)
# ----------------------------------------------------------------------------
path "ssh/sign/{{PREFIX}}-srv-role" {
  capabilities = ["create", "update"]
}
path "secret/data/srv/inventory/*" {
  capabilities = ["read"]
}
path "secret/data/srv/winrm/*" {
  capabilities = ["read"]
}
path "secret/data/srv/ansible/*" {
  capabilities = ["read"]
}

# ----------------------------------------------------------------------------
# {{PREFIX}}-deploy — prumo-deploy-01 (release gate, CI/CD reads)
# ----------------------------------------------------------------------------
path "secret/data/cicd/gitlab/*" {
  capabilities = ["read"]
}
path "secret/data/cicd/cosign/*" {
  capabilities = ["read"]
}
path "secret/data/cicd/sbom/*" {
  capabilities = ["read"]
}
path "secret/data/registry/credentials" {
  capabilities = ["read"]
}

# ----------------------------------------------------------------------------
# {{PREFIX}}-compliance — prumo-compliance-01 (read-only sobre compliance)
# ----------------------------------------------------------------------------
path "secret/data/compliance/*" {
  capabilities = ["read"]
}
path "secret/data/contracts/*" {
  capabilities = ["read"]
}
path "secret/data/dpia/*" {
  capabilities = ["read"]
}

# ----------------------------------------------------------------------------
# {{PREFIX}}-cowork-reporting — Cowork ai-rep-01 (confinado, leitura inbox + escrita output)
# ----------------------------------------------------------------------------
path "secret/data/reports/inbox/*" {
  capabilities = ["read"]
}
path "secret/data/reports/output/*" {
  capabilities = ["read", "create", "update"]
}

# ============================================================================
# Configuração dos AppRoles — executar uma vez após criação das policies acima
# ============================================================================
#
# vault write auth/approle/role/{{PREFIX}}-monitor \
#     token_ttl=30m token_max_ttl=1h \
#     token_policies="{{PREFIX}}-monitor" \
#     secret_id_ttl=5m secret_id_num_uses=1
#
# vault write auth/approle/role/{{PREFIX}}-ir \
#     token_ttl=15m token_max_ttl=1h \
#     token_policies="{{PREFIX}}-ir" \
#     secret_id_ttl=5m secret_id_num_uses=1
#
# vault write auth/approle/role/{{PREFIX}}-tenant \
#     token_ttl=15m token_max_ttl=30m \
#     token_policies="{{PREFIX}}-tenant" \
#     secret_id_ttl=5m secret_id_num_uses=1
#
# vault write auth/approle/role/{{PREFIX}}-srv \
#     token_ttl=15m token_max_ttl=30m \
#     token_policies="{{PREFIX}}-srv" \
#     secret_id_ttl=5m secret_id_num_uses=1
#
# vault write auth/approle/role/{{PREFIX}}-deploy \
#     token_ttl=15m token_max_ttl=30m \
#     token_policies="{{PREFIX}}-deploy" \
#     secret_id_ttl=5m secret_id_num_uses=1
#
# vault write auth/approle/role/{{PREFIX}}-compliance \
#     token_ttl=30m token_max_ttl=1h \
#     token_policies="{{PREFIX}}-compliance" \
#     secret_id_ttl=5m secret_id_num_uses=1
#
# vault write auth/approle/role/{{PREFIX}}-cowork-reporting \
#     token_ttl=60m token_max_ttl=2h \
#     token_policies="{{PREFIX}}-cowork-reporting" \
#     secret_id_ttl=10m secret_id_num_uses=1
#
# ============================================================================
# SSH CA roles (criados nos paths ssh/sign/`<prefixo>-*`-role)
# ============================================================================
#
# vault write ssh/roles/{{PREFIX}}-srv-role \
#     key_type=ca \
#     algorithm_signer=rsa-sha2-256 \
#     allowed_users="{{PREFIX}}-srv,{{PREFIX}}-deploy" \
#     default_user="{{PREFIX}}-srv" \
#     ttl=15m max_ttl=15m
#
# vault write ssh/roles/{{PREFIX}}-ir-role \
#     key_type=ca \
#     algorithm_signer=rsa-sha2-256 \
#     allowed_users="{{PREFIX}}-ir" \
#     default_user="{{PREFIX}}-ir" \
#     ttl=15m max_ttl=15m
#
# ============================================================================

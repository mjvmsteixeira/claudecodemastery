# ============================================================================
# Wiremaze SecOps · Vault Policies HCL
# ============================================================================
# Seis AppRoles dedicados, um por subagent. TTLs deliberadamente curtos.
# Os comandos de criação dos AppRoles estão no fim do ficheiro.
# ============================================================================

# ----------------------------------------------------------------------------
# wiremaze-monitor — wiremaze-monitor-01 (read-only sobre observabilidade)
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
# wiremaze-ir — wiremaze-ir-saas-01 (IR multi-tenant, mais permissivo, TTL curto)
# ----------------------------------------------------------------------------
path "secret/data/ir/*" {
  capabilities = ["read", "create", "update"]
}
path "ssh/sign/wmz-ir-role" {
  capabilities = ["create", "update"]
}
path "transit/encrypt/forensics" {
  capabilities = ["create", "update"]
}
path "transit/decrypt/forensics" {
  capabilities = ["create", "update"]
}
path "sys/audit-hash/*" {
  capabilities = ["create", "update"]
}

# ----------------------------------------------------------------------------
# wiremaze-tenant — wiremaze-tenant-01 (auditoria de isolamento)
# ----------------------------------------------------------------------------
path "secret/data/tenants/metadata/*" {
  capabilities = ["read"]
}
path "secret/data/db/schemas/*" {
  capabilities = ["read"]
}
# NÃO tem acesso a chaves transit por tenant — só metadados.
path "sys/policies/acl/*" {
  capabilities = ["read"]
}

# ----------------------------------------------------------------------------
# wiremaze-srv — wiremaze-srv-saas-01 (operações servidor, SSH CA)
# ----------------------------------------------------------------------------
path "ssh/sign/wmz-srv-role" {
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
# wiremaze-deploy — wiremaze-deploy-01 (release gate, CI/CD reads)
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
# wiremaze-compliance — wiremaze-compliance-01 (read-only sobre compliance)
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
# wiremaze-cowork-reporting — Cowork ai-rep-01 (confinado, leitura inbox + escrita output)
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
# vault write auth/approle/role/wiremaze-monitor \
#     token_ttl=30m token_max_ttl=1h \
#     token_policies="wiremaze-monitor" \
#     secret_id_ttl=5m secret_id_num_uses=1
#
# vault write auth/approle/role/wiremaze-ir \
#     token_ttl=15m token_max_ttl=1h \
#     token_policies="wiremaze-ir" \
#     secret_id_ttl=5m secret_id_num_uses=1
#
# vault write auth/approle/role/wiremaze-tenant \
#     token_ttl=15m token_max_ttl=30m \
#     token_policies="wiremaze-tenant" \
#     secret_id_ttl=5m secret_id_num_uses=1
#
# vault write auth/approle/role/wiremaze-srv \
#     token_ttl=15m token_max_ttl=30m \
#     token_policies="wiremaze-srv" \
#     secret_id_ttl=5m secret_id_num_uses=1
#
# vault write auth/approle/role/wiremaze-deploy \
#     token_ttl=15m token_max_ttl=30m \
#     token_policies="wiremaze-deploy" \
#     secret_id_ttl=5m secret_id_num_uses=1
#
# vault write auth/approle/role/wiremaze-compliance \
#     token_ttl=30m token_max_ttl=1h \
#     token_policies="wiremaze-compliance" \
#     secret_id_ttl=5m secret_id_num_uses=1
#
# vault write auth/approle/role/wiremaze-cowork-reporting \
#     token_ttl=60m token_max_ttl=2h \
#     token_policies="wiremaze-cowork-reporting" \
#     secret_id_ttl=10m secret_id_num_uses=1
#
# ============================================================================
# SSH CA roles (criados nos paths ssh/sign/wmz-*-role)
# ============================================================================
#
# vault write ssh/roles/wmz-srv-role \
#     key_type=ca \
#     algorithm_signer=rsa-sha2-256 \
#     allowed_users="wmz-srv,wmz-deploy" \
#     default_user="wmz-srv" \
#     ttl=15m max_ttl=15m
#
# vault write ssh/roles/wmz-ir-role \
#     key_type=ca \
#     algorithm_signer=rsa-sha2-256 \
#     allowed_users="wmz-ir" \
#     default_user="wmz-ir" \
#     ttl=15m max_ttl=15m
#
# ============================================================================

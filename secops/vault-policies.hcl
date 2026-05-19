# ============================================================================
# Wire SecOps · Vault Policies HCL
# ============================================================================
# Sete AppRoles: 6 com subagent local (wire-monitor-01, wire-ir-saas-01, wire-tenant-01,
# wire-srv-saas-01, wire-deploy-01, wire-compliance-01) + Cowork `wire-cowork-reporting`
# externo (Cowork agent `ai-rep-01`, sem subagent neste plugin). TTLs deliberadamente curtos.
# Os comandos de criação dos AppRoles estão no fim do ficheiro.
# ============================================================================

# ----------------------------------------------------------------------------
# wire-monitor — wire-monitor-01 (read-only sobre observabilidade)
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
# wire-ir — wire-ir-saas-01 (IR multi-tenant, mais permissivo, TTL curto)
# ----------------------------------------------------------------------------
path "secret/data/ir/*" {
  capabilities = ["read", "create", "update"]
}
path "ssh/sign/wire-ir-role" {
  capabilities = ["create", "update"]
}
path "transit/encrypt/forensics" {
  capabilities = ["create", "update"]
}
path "transit/decrypt/forensics" {
  capabilities = ["create", "update"]
}
# audit-hash: necessário para correlation evidence em IR (HMAC dos audit log entries
# para cross-reference sem expor o input cleartext). Wide scope deliberado — wire-ir
# é o único AppRole que precisa de assinar evidência durante uma investigação.
path "sys/audit-hash/*" {
  capabilities = ["create", "update"]
}

# ----------------------------------------------------------------------------
# wire-tenant — wire-tenant-01 (auditoria de isolamento)
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
# wire-srv — wire-srv-saas-01 (operações servidor, SSH CA)
# ----------------------------------------------------------------------------
path "ssh/sign/wire-srv-role" {
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
# wire-deploy — wire-deploy-01 (release gate, CI/CD reads)
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
# wire-compliance — wire-compliance-01 (read-only sobre compliance)
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
# wire-cowork-reporting — Cowork ai-rep-01 (confinado, leitura inbox + escrita output)
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
# vault write auth/approle/role/wire-monitor \
#     token_ttl=30m token_max_ttl=1h \
#     token_policies="wire-monitor" \
#     secret_id_ttl=5m secret_id_num_uses=1
#
# vault write auth/approle/role/wire-ir \
#     token_ttl=15m token_max_ttl=1h \
#     token_policies="wire-ir" \
#     secret_id_ttl=5m secret_id_num_uses=1
#
# vault write auth/approle/role/wire-tenant \
#     token_ttl=15m token_max_ttl=30m \
#     token_policies="wire-tenant" \
#     secret_id_ttl=5m secret_id_num_uses=1
#
# vault write auth/approle/role/wire-srv \
#     token_ttl=15m token_max_ttl=30m \
#     token_policies="wire-srv" \
#     secret_id_ttl=5m secret_id_num_uses=1
#
# vault write auth/approle/role/wire-deploy \
#     token_ttl=15m token_max_ttl=30m \
#     token_policies="wire-deploy" \
#     secret_id_ttl=5m secret_id_num_uses=1
#
# vault write auth/approle/role/wire-compliance \
#     token_ttl=30m token_max_ttl=1h \
#     token_policies="wire-compliance" \
#     secret_id_ttl=5m secret_id_num_uses=1
#
# vault write auth/approle/role/wire-cowork-reporting \
#     token_ttl=60m token_max_ttl=2h \
#     token_policies="wire-cowork-reporting" \
#     secret_id_ttl=10m secret_id_num_uses=1
#
# ============================================================================
# SSH CA roles (criados nos paths ssh/sign/wire-*-role)
# ============================================================================
#
# vault write ssh/roles/wire-srv-role \
#     key_type=ca \
#     algorithm_signer=rsa-sha2-256 \
#     allowed_users="wire-srv,wire-deploy" \
#     default_user="wire-srv" \
#     ttl=15m max_ttl=15m
#
# vault write ssh/roles/wire-ir-role \
#     key_type=ca \
#     algorithm_signer=rsa-sha2-256 \
#     allowed_users="wire-ir" \
#     default_user="wire-ir" \
#     ttl=15m max_ttl=15m
#
# ============================================================================

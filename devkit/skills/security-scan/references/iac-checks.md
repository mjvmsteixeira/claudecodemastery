# Infrastructure as Code — verificações de segurança

Referência carregada pela skill `security-scan` quando o scope inclui `iac`.
Para auditoria de infra operacional (não-segurança), ver a skill `infra-audit`.

**Terraform:**
- `tflint`, `checkov -d .`
- `trivy config .`  (Terraform/IaC misconfig; substitui o `tfsec` deprecado — absorvido pelo Trivy)
- Recursos públicos sem necessidade (S3 ACL public, RDS publicly_accessible)
- Encryption at rest desactivada
- IAM policies com `Action: "*"` ou `Resource: "*"`

**Ansible:**
- Plaintext passwords em vars (devia estar em vault)
- `become: yes` desnecessário
- `validate_certs: no` em módulos HTTP/URI
- Roles sem `meta/main.yml`

**Kubernetes:**
- `kubesec scan deployment.yaml`
- `kube-score score *.yaml`
- Secrets como ConfigMap/env vars (devia ser Secret + mounted)
- Sem ResourceQuota, sem LimitRange

**Docker Compose:**
- Auditoria operacional de Docker Compose delegada à skill `infra-audit`.

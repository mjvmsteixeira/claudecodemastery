# Kubernetes — auditoria de manifests

Referência carregada pela skill `infra-audit` quando o scope inclui `k8s`.

Se há manifests K8s:

**Pod security:**
- `securityContext.runAsNonRoot: true`
- `runAsUser` ≥ 1000
- `readOnlyRootFilesystem: true` quando viável
- `allowPrivilegeEscalation: false`
- `capabilities.drop: [ALL]`
- `seccompProfile.type: RuntimeDefault`

**Resources:**
- `resources.requests` e `resources.limits` em todos os containers
- ResourceQuota e LimitRange por namespace

**Network:**
- NetworkPolicies para isolar namespaces
- Ingress com TLS (cert-manager / manual)
- Sem `hostNetwork: true`, `hostPID: true`, `hostIPC: true`

**Secrets:**
- Secrets como `Secret` (não ConfigMap)
- External Secrets Operator ou Sealed Secrets para versionamento
- Sem secrets em `env:` directamente (preferir `envFrom: secretRef`)

**RBAC:**
- ServiceAccounts dedicados (não `default`)
- ClusterRoleBindings minimizados
- Sem `rules.resources: ["*"]` + `verbs: ["*"]`

**Probes:**
- `livenessProbe` e `readinessProbe` em todos os Deployments
- `startupProbe` em apps com boot longo

Ferramentas: `kubesec scan`, `kube-score score`, `kubeaudit all`, `polaris audit`.

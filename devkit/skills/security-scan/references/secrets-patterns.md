# Secrets e credenciais — patterns de detecção

Referência carregada pela skill `security-scan` quando o scope inclui `secrets`.

Pesquisar (excluir `node_modules/`, `vendor/`, `.git/`, `.env.example`, comentários, testes):

| Provider | Pattern |
|----------|---------|
| AWS | `AKIA[0-9A-Z]{16}`, `aws_secret_access_key` |
| GCP | `AIza[0-9A-Za-z_-]{35}` |
| Azure | `DefaultEndpointsProtocol=https;AccountKey=` |
| GitHub | `ghp_[A-Za-z0-9]{36}`, `gho_`, `ghs_`, `ghr_` |
| GitLab | `glpat-[A-Za-z0-9_-]{20}` |
| Slack | `xox[baprs]-[A-Za-z0-9-]+` |
| Stripe | `sk_live_[A-Za-z0-9]{24}` |
| OpenAI | `sk-[A-Za-z0-9]{48}` |
| Anthropic | `sk-ant-[A-Za-z0-9_-]+` |
| SendGrid | `SG\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+` |
| JWT | `eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+` |
| Private keys | `-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----` |

Ferramentas: `gitleaks detect`, `trufflehog filesystem .`, `detect-secrets scan`.

Verificar git history: `git log --all --full-history -- "*.env" "*.pem" "*.key" "credentials*"`.

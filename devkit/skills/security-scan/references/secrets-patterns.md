# Secrets — deteção

**Primário: scanners verificados.** Quando presentes, `gitleaks` e
`trufflehog --only-verified` são a fonte de verdade — validam a credencial (menos
falsos-positivos que regex). Todo o secret confirmado é `severity:critical`,
`cwe:CWE-798`, e **nunca** auto-corrigido (rotação + remoção do git history é ação humana).

```bash
gitleaks detect --no-banner --redact --report-format json --report-path /tmp/gl.json
trufflehog filesystem . --only-verified --json
git log --all --full-history -- "*.env" "*.pem" "*.key" "credentials*"
```

**Entropia (complemento):** blobs de alta entropia base64/hex (≥ 20 chars, entropia
Shannon > 4.5) que não batem em nenhum regex conhecido são candidatos — reportar como
`medium`/`low` para revisão, nunca como critical sem confirmação.

**Fallback: tabela de regexes.** Só quando os scanners estão ausentes. Mais ruidosa —
cada match exige confirmação manual (placeholder? exemplo? chave revogada?) antes de
reportar. Excluir sempre `node_modules/`, `vendor/`, `.git/`, `*.example`, testes.

| Provider | Pattern |
|----------|---------|
| AWS Access Key | `(A3T[A-Z0-9]\|AKIA\|AGPA\|AIDA\|AROA\|AIPA\|ANPA\|ANVA\|ASIA)[A-Z0-9]{16}` |
| GCP API key | `AIza[0-9A-Za-z_-]{35}` |
| Azure | `DefaultEndpointsProtocol=https;AccountKey=[A-Za-z0-9+/=]{88}` |
| GitHub token | `gh[pousr]_[A-Za-z0-9]{36,255}` |
| GitHub fine-grained | `github_pat_[A-Za-z0-9_]{82}` |
| GitLab PAT | `glpat-[A-Za-z0-9_-]{20}` |
| Slack | `xox[baprs]-[A-Za-z0-9-]{10,}` |
| Stripe secret | `sk_live_[A-Za-z0-9]{24,}` |
| Stripe restricted | `rk_live_[A-Za-z0-9]{24,}` |
| OpenAI (legacy) | `sk-[A-Za-z0-9]{48}` |
| OpenAI (projeto) | `sk-proj-[A-Za-z0-9_-]{48,}` |
| OpenAI (service) | `sk-svcacct-[A-Za-z0-9_-]{48,}` |
| Anthropic | `sk-ant-[A-Za-z0-9_-]{80,}` |
| SendGrid | `SG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}` |
| JWT | `eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+` |
| Private key | `-----BEGIN (RSA \|EC \|OPENSSH \|DSA \|PGP )?PRIVATE KEY-----` |

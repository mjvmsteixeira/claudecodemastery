# Configuração de runtime — verificações de segurança

Referência carregada pela skill `security-scan` quando o scope inclui `config`.

- HTTPS forçado, redirect HTTP→HTTPS
- Rate limiting em endpoints de auth
- Security headers (HSTS com preload, CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy)
- `.env`, `*.pem`, `*.key`, `secrets/` no `.gitignore`
- Pre-commit hooks de secret scanning

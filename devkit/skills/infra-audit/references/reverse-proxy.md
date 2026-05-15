# Reverse proxy — nginx / Traefik / Caddy / HAProxy

Referência carregada pela skill `infra-audit` quando o scope inclui `proxy`.

**TLS:**
- Configurado e forçado (HTTP→HTTPS redirect)
- TLS 1.2 mínimo (ideal 1.3 only)
- Cipher suite moderna (Mozilla "Modern" ou "Intermediate")
- HSTS com `max-age` ≥ 1 ano + `includeSubDomains` + `preload`
- OCSP stapling

**Headers:**
- `X-Frame-Options: DENY` (ou CSP frame-ancestors)
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Content-Security-Policy` com directivas restritivas
- `Permissions-Policy` (ex-Feature-Policy)
- Server header escondido (`server_tokens off`)

**Operacional:**
- Rate limiting em endpoints sensíveis (login, API)
- Body size limits (`client_max_body_size`)
- Timeouts adequados (não 0)
- Buffer sizes proporcionais ao backend
- `/metrics`, `/debug`, `/docs`, `/openapi.json` bloqueados ou com auth

**Proxy:**
- `X-Forwarded-For`, `X-Real-IP`, `X-Forwarded-Proto` configurados
- `proxy_redirect` correcto

**Traefik específico:**
- Dashboard em prod: desactivado ou com auth
- Middlewares de rate-limit, IPWhitelist em rotas administrativas
- Providers file watch desactivado em prod (declarativo only)

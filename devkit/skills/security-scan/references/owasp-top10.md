# OWASP Top 10 — patterns de detecção

Referência carregada pela skill `security-scan` quando o scope inclui `code`.
Os patterns adaptam-se à linguagem detectada (Python, Node.js, Go, Java, PHP, Ruby, .NET).

> **Este ficheiro é o _fallback_.** Quando `semgrep` está disponível, é ele o motor
> primário (regras AST). Usar os patterns abaixo só quando `semgrep` estiver ausente.
> A coluna CWE é o identificador canónico a colocar no campo `cwe` do finding.

**A01 – Broken Access Control (CWE-284/CWE-639):**
- Endpoints sem auth middleware (Flask/Express/Gin/Spring/Rails/Laravel/ASP.NET)
- IDOR: rotas com `{id}`/`:id` sem verificação de ownership
- Admin routes sem role check

**A02 – Cryptographic Failures (CWE-327/CWE-798):**
- Secrets hardcoded: `password\s*=\s*["'][^"']+["']`, `secret\s*=\s*["']`, `api[_-]?key`
- Hashes fracos: MD5/SHA1 para passwords (`hashlib.md5`, `crypto.createHash('md5')`, `MessageDigest.getInstance("MD5")`)
- HTTP em produção, TLS desactivado, certificate verification disabled
- Random fraco para tokens: `Math.random()`, `random.random()` (usar `secrets`/`crypto.randomBytes`/`SecureRandom`)

**A03 – Injection (CWE-89/CWE-78/CWE-94):**
- SQL: f-strings, concatenação, `text()` sem params, `db.Query(\"SELECT...\" + var)`, `Statement` em vez de `PreparedStatement`
- Command: `subprocess(shell=True)`, `os.system()`, `exec.Command(\"sh\",\"-c\",...)`, `Runtime.exec`, `shell_exec`
- Code: `eval()`, `Function()`, `unserialize()`, `pickle.loads`, `yaml.load` sem SafeLoader, `xml.etree` sem `defusedxml`
- LDAP/NoSQL/XPath injection
- Template injection: SSTI em Jinja2/Twig/Freemarker

**A04 – Insecure Design (CWE-352/CWE-770):**
- Rate limiting ausente em auth, password reset, upload
- CSRF protection ausente em forms (Django/Express/Rails/Spring)
- Predictable IDs (sequenciais em vez de UUIDs)

**A05 – Security Misconfiguration (CWE-16/CWE-1188):**
- CORS `*` ou `allow_origins=["*"]` em prod
- CSP com `unsafe-eval`/`unsafe-inline`
- Debug mode: `DEBUG=True`, `NODE_ENV=development`, `app.run(debug=True)`, `display_errors=On`
- Docker: `:latest`, `privileged: true`, sem `USER`
- K8s: `runAsRoot`, `privileged`, `hostNetwork: true`, sem NetworkPolicy
- Cabeçalhos ausentes: HSTS, X-Frame-Options, X-Content-Type-Options

**A06 – Vulnerable Components (CWE-1035):** coberto por `references/dependency-scanners.md`

**A07 – Auth Failures (CWE-287/CWE-384):**
- JWT sem `exp`, sem signature verification, `algorithm: none`
- Tokens em `localStorage` (vulnerável a XSS — usar httpOnly cookies)
- Sem invalidação de sessão no logout
- Password policy fraca, sem rate limit no login

**A08 – Data Integrity Failures (CWE-345/CWE-502):**
- Manifests sem versões pinned (`flask` em vez de `flask==3.0.0`, `*` em package.json)
- Lockfiles ausentes (`package-lock.json`, `Cargo.lock`, `go.sum`, `poetry.lock`)
- Deserialization sem validação
- CI sem signature verification (containers, packages)

**A09 – Logging Failures (CWE-778):**
- Falhas de auth sem logging
- PII em logs: `log.*email|log.*password|log.*token|log.*ssn`
- Stack traces expostos em respostas API (`traceback`, `Throwable.printStackTrace`)
- Logs sem rotation/retention

**A10 – SSRF (CWE-918):**
- `requests.get(url)`, `fetch(url)`, `http.Get(url)`, `URL.openStream()` com URL controlada
- Sem allowlist de domínios
- Metadata endpoints (169.254.169.254) acessíveis

# OWASP API Security Top 10 (2023)

Carregar quando o projeto expõe uma API (rotas REST, controllers, schema GraphQL,
OpenAPI/Swagger). Complementa `owasp-top10.md` com falhas específicas de API.

- **API1 — BOLA / Broken Object Level Authorization (CWE-639):** endpoint `GET /orders/{id}`
  sem verificar `order.owner_id == current_user.id`. A falha nº1 de APIs.
- **API2 — Broken Authentication (CWE-287):** JWT `alg:none`, sem `exp`, refresh tokens
  sem rotação, credential stuffing sem rate-limit.
- **API3 — Broken Object Property Level Authorization (CWE-915):** mass assignment
  (`User(**request.json)` deixa setar `is_admin`), excessive data exposure (serializer
  devolve `password_hash`/campos internos).
- **API4 — Unrestricted Resource Consumption (CWE-770):** sem rate-limit, sem paginação,
  sem limite de tamanho de payload/upload; queries GraphQL sem depth/complexity limit.
- **API5 — Broken Function Level Authorization (CWE-285):** rota admin acessível a user
  normal por falta de role check.
- **API6 — Unrestricted Access to Sensitive Business Flows (CWE-840):** fluxos (compra,
  registo) sem anti-automação.
- **API7 — SSRF (CWE-918):** ver `owasp-top10.md` A10.
- **API8 — Security Misconfiguration (CWE-16):** CORS `*` com credenciais, verbos HTTP
  não usados abertos, stack traces em respostas.
- **API9 — Improper Inventory Management (CWE-1059):** endpoints `/v1` deprecados ainda
  vivos, hosts de staging expostos, docs a revelar rotas internas.
- **API10 — Unsafe Consumption of APIs (CWE-918/CWE-502):** confiar cegamente em respostas
  de APIs de terceiros (deserialização, redirects) sem validação.

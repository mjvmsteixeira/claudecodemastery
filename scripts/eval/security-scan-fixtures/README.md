# Fixtures — eval do security-scan

Projetos-mini propositadamente vulneráveis (e um limpo) para o runner determinístico
`../security-scan-test.sh`. **Nenhuma credencial aqui é real** — os secrets são padrões
sintáticos fake que disparam por forma, nunca por validação viva.

- `vuln-python/` — SQLi (CWE-89), command injection (CWE-78), eval (CWE-94) + dep com CVE.
- `secrets-sample/` — chaves fake (AWS/GitHub/OpenAI) para deteção por gitleaks/regex.
- `clean-sample/` — controlo negativo: nada deve disparar.
- `expected.jsonl` — verdade-base: `{fixture,rule,cwe,should_fire,engine}` por expectativa.

Estas fixtures estão excluídas do gitleaks do próprio repo via `.gitleaks.toml`
(allowlist por directório, resiliente a mudanças de conteúdo).

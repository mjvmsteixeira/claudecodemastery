# Dependency scanners — multi-stack

Referência carregada pela skill `security-scan` quando o scope inclui `dependencies`.

## Scanners por stack

Correr o scanner adequado para cada stack detectado:

```bash
# Python
pip-audit -r requirements.txt --format columns
safety check -r requirements.txt
# (se não instalados: pip install pip-audit safety)

# Node.js
npm audit --json
# ou: yarn audit --json / pnpm audit --json

# Go
govulncheck ./...
# (go install golang.org/x/vuln/cmd/govulncheck@latest)

# Rust
cargo audit
# (cargo install cargo-audit)

# Java/Maven
mvn dependency-check:check
# Java/Gradle
./gradlew dependencyCheckAnalyze

# Ruby
bundle audit check --update
# (gem install bundler-audit)

# PHP
composer audit

# .NET
dotnet list package --vulnerable --include-transitive

# Docker images
trivy image <image:tag>
grype <image:tag>

# Genérico (multi-stack)
trivy fs .
```

Para cada vulnerability: pacote, versão afectada, CVE, CVSS score, versão corrigida.
Com `--auto-fix-safe`: correr update sem flags de force/breaking
(`npm audit fix`, `cargo update`, etc.).

## Dependências fantasma (não usadas)

**Python:** Para cada pacote em requirements.txt, grep o nome no código:
```bash
grep -r "import <pacote>" app/ --include="*.py" | grep -v __pycache__ | wc -l
```
Se 0 resultados → dependência fantasma, candidata a remoção.

**Node.js:** Usar `npx depcheck` se disponível, ou grep manual.

## Classificação de risco e correcção

Para cada vulnerabilidade:

| Risco | Acção |
|-------|-------|
| Patch version disponível (x.y.Z) | Actualizar directamente |
| Minor version (x.Y.z) | Actualizar, verificar changelog |
| Major version (X.y.z) | Avaliar breaking changes, testar |
| Sem fix disponível | Reportar e avaliar alternativas |

Após aplicar fixes: regenerar lockfiles (`uv lock` / `npm install`), re-auditar para
confirmar resolução, e verificar que o projecto ainda compila (ex: `python3 -c "import ast; ast.parse(open('file').read())"`, `npx tsc --noEmit`).

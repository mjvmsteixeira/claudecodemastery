# Cobertura de testes

Referência carregada pela skill `code-quality` quando o scope inclui `test-coverage`.

## 1. Detectar a framework de testes

| Stack | Indicadores | Comando de cobertura |
|-------|-------------|----------------------|
| Python | `pytest.ini`, `tox.ini`, `tests/`, `pyproject.toml` com `[tool.pytest.ini_options]` | `pytest --cov --cov-report=term-missing` |
| Node (Jest) | `jest.config.*`, `jest` em `package.json` | `npx jest --coverage` |
| Node (Vitest) | `vitest.config.*`, `vitest` em deps | `npx vitest run --coverage` |
| Go | `*_test.go` | `go test -cover ./...` |
| Rust | `#[test]` / `tests/` | `cargo tarpaulin` (ou `cargo test` se tarpaulin ausente) |
| Ruby | `spec/`, `.rspec` | `bundle exec rspec` com SimpleCov |
| PHP | `phpunit.xml*` | `vendor/bin/phpunit --coverage-text` |
| .NET | `*.Tests.csproj` | `dotnet test --collect:"XPlat Code Coverage"` |

Se não houver framework de testes detectada, reportar como finding **HIGH**:
"projecto sem suite de testes".

## 2. Correr cobertura

Correr o comando da stack detectada. Se a execução falhar (deps em falta, testes
quebrados), reportar isso como finding e **não** inventar números de cobertura.

## 3. Avaliar

| Situação | Severidade |
|----------|------------|
| Sem framework de testes | HIGH |
| Cobertura global < 40% | HIGH |
| Cobertura global 40–60% | MEDIUM |
| Cobertura global 60–80% | LOW |
| Caminho crítico sem testes (auth, pagamentos, persistência, dados sensíveis) | HIGH por caminho |
| Ficheiro novo/modificado sem teste correspondente | MEDIUM |

"Caminho crítico" é inferido por nome/path (`auth`, `payment`, `billing`, `security`,
`crypto`, `tenant`) ou pelas regras do projecto se `rules/audit/*.md` as definir.

Reportar cobertura global, ficheiros abaixo do limiar com `%`, e caminhos críticos sem testes.

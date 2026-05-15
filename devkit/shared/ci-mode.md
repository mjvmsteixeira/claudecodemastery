# Modo CI (`--ci`)

Comportamento de `--ci`, idêntico em todos os audits do `wiremaze-devkit`.
As `SKILL.md` referenciam este ficheiro — não redefinem o comportamento.

## Regras

1. **Sem auto-fix.** Nenhuma correcção é aplicada, nem as "safe".
2. **Sem prompts interactivos.** Nada que espere input do utilizador.
3. **Output máquina-legível:**
   - JSON sempre, em stdout, com a estrutura abaixo.
   - SARIF adicionalmente nos audits de código (`security-scan`, `code-quality`),
     gravado em `docs/<domínio>/<DOMÍNIO>_<YYYY-MM-DD>.sarif` para integração com GitHub code scanning.
4. **Exit code:**

   | Código | Significado |
   |--------|-------------|
   | `0` | Nenhum finding, ou apenas LOW |
   | `1` | Há findings MEDIUM (e nenhum CRITICAL/HIGH) |
   | `2` | Há findings CRITICAL ou HIGH |

## Estrutura JSON

```json
{
  "audit": "security-scan",
  "timestamp": "2026-05-14T12:00:00Z",
  "score": { "total": 7.5, "dimensions": { "dependencies": 8.0, "code": 7.0 } },
  "findings": [
    {
      "severity": "CRITICAL",
      "dimension": "code",
      "file": "app/api.py",
      "line": 42,
      "issue": "endpoint /admin sem auth",
      "fix": "adicionar @require_role('admin')"
    }
  ],
  "counts": { "critical": 1, "high": 0, "medium": 3, "low": 5 }
}
```

## Detecção

Um audit corre em modo CI quando recebe a flag `--ci`. Em modo CI, o relatório
humano de `shared/report-format.md` é suprimido — só sai o JSON (e o SARIF quando aplicável).

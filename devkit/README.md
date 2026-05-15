# wiremaze-devkit

Toolkit de auditoria de developer para Claude Code · v0.1.0

Terceiro plugin do marketplace `jump2new`, ao lado de `wiremaze-base` e `wiremaze-secops`.

## O que faz

| Componente | Tipo | Domínio |
|------------|------|---------|
| **full-audit** | command + skill | Orquestrador — corre os audits em paralelo, consolida, faz scoring unificado e (fora de `--ci`) auto-fix |
| **security-scan** | command + skill | OWASP Top 10, secrets, IaC, dependências vulneráveis (multi-stack) |
| **infra-audit** | command + skill | Docker, Kubernetes, systemd, reverse proxy, Ansible, Terraform, CI/CD |
| **ux-audit** | command + skill | WCAG 2.1 AA, heurísticas Nielsen, responsividade, design system |
| **code-quality** | command + skill | Dead code, arquitectura, complexidade, cobertura de testes |
| **performance-audit** | command + skill | Bundle size, N+1 queries, I/O bloqueante, resource leaks |
| **local-reviewer** | agent + skill | Segunda opinião via Ollama qwen3-coder local — read-only, sem cloud |
| **ngrok-expose** | command + skill | Túnel ngrok HTTPS (authtoken via Vault do wiremaze-base) |

Cada audit tem um command explícito (`/security-scan --scope=secrets`) e uma skill que
auto-dispara por intenção ("audita a segurança disto"). O material de referência pesado
está em `references/` com progressive disclosure.

## Instalação

```
/plugin marketplace add mjvmsteixeira/claudecodemastery
/plugin install wiremaze-devkit@jump2new
```

Opcional mas recomendado para o `ngrok-expose`:

```
/plugin install wiremaze-base@jump2new
```

## Modo CI

Todos os audits aceitam `--ci`: sem auto-fix, output JSON (e SARIF nos audits de código),
exit code `0`/`1`/`2` conforme a severidade máxima encontrada. Para usar em pre-commit
hooks e pipelines.

## Convenções

Scoring, formato de relatório e comportamento `--ci` são uniformes — definidos uma vez
em `shared/` e referenciados por todas as skills. Ver `CLAUDE.md`.

## Dependências

- **Soft** do `wiremaze-base` — apenas o `ngrok-expose` o usa. O resto funciona standalone.
- `local-reviewer` requer Ollama local; degrada para análise própria se indisponível.

---

© 2026 jump2new · geral@jump2new.pt · Repositório privado

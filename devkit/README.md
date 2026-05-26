# wire-devkit

Toolkit de auditoria de developer para Claude Code · v0.2.2

Terceiro plugin do marketplace `jump2new`, ao lado de `wire-base` e `wire-secops`.

## O que faz

**Read-only por defeito.** Cada audit gera relatório consolidado com scoring; não toca em ficheiros. Correcção é opt-in via `--apply` (`--auto-fix-safe` no `security-scan`), passa por gates de modo operacional (`WIRE_OPERATING_MODE=dev` degrada), sample/empty-shell detection (marcadores `.dev-shell`/`SAMPLE.md`/comentário em CLAUDE.md degradam), e confirmação humana individual com diff para acções destrutivas (apagar/mover ficheiros, mexer em `.gitignore`/`.env*`/`config/initializers/`/`spec/`/`test/`/workflows CI, drop SQL). Se `wire-base ≥ 0.2.1` estiver instalado, ganha defense-in-depth via `pre-tool-audit-guard.sh` que enforça em runtime mesmo se a skill falhar. Ver `shared/safe-apply.md` e `CLAUDE.md` (Safety convention).

| Componente | Tipo | Domínio |
|------------|------|---------|
| **full-audit** | command + skill | Orquestrador — corre os audits em paralelo, consolida e gera relatório unificado. Default report-only; `--apply` para correcção (gated). |
| **security-scan** | command + skill | OWASP Top 10, secrets, IaC, dependências vulneráveis (multi-stack). `--auto-fix-safe` para updates de patch + headers em falta (não inclui `.gitignore`/`.env*`). |
| **infra-audit** | command + skill | Docker, Kubernetes, systemd, reverse proxy, Ansible, Terraform, CI/CD |
| **ux-audit** | command + skill | WCAG 2.1 AA, heurísticas Nielsen, responsividade, design system |
| **code-quality** | command + skill | Dead code, arquitectura, complexidade, cobertura de testes |
| **performance-audit** | command + skill | Bundle size, N+1 queries, I/O bloqueante, resource leaks |
| **local-reviewer** | agent + skill | Segunda opinião via Ollama qwen3-coder local — read-only, sem cloud |
| **ngrok-expose** | command + skill | Túnel ngrok HTTPS (authtoken via Vault do wire-base) |
| **chrome-live** | command + skill | Inspecção/interacção da sessão Chrome real via CDP (sem extensão). Read-only por defeito; verbos activos gateados por modo. Consumido por `ux-audit`/`security-scan` para verificação ao vivo. Motor `cdp.mjs` vendorado (MIT © pasky). Requer Node 22+. **Novidade v0.3.0.** |

Cada audit tem um command explícito (`/security-scan --scope=secrets`) e uma skill que
auto-dispara por intenção ("audita a segurança disto"). O material de referência pesado
está em `references/` com progressive disclosure.

## Instalação

```
/plugin marketplace add mjvmsteixeira/claudecodemastery
/plugin install wire-devkit@jump2new
```

Opcional mas recomendado para o `ngrok-expose`:

```
/plugin install wire-base@jump2new
```

## Modo CI

Todos os audits aceitam `--ci`: sem auto-fix, output JSON (e SARIF nos audits de código),
exit code `0`/`1`/`2` conforme a severidade máxima encontrada. Para usar em pre-commit
hooks e pipelines.

## Convenções

Scoring, formato de relatório e comportamento `--ci` são uniformes — definidos uma vez
em `shared/` e referenciados por todas as skills. Ver `CLAUDE.md`.

## Dependências

Recomenda **`wire-base ≥ 0.2.1`** por dois motivos:

1. **`/ngrok-expose`** precisa do `lib/vault-env.sh` para obter o authtoken do Vault.
2. **Defense-in-depth dos audits**: o hook PreToolUse `pre-tool-audit-guard.sh` (em `wire-base ≥ 0.2.1`) bloqueia operações destrutivas (`rm`/SQL `DROP`/Edit a `.gitignore`/`.env*`/`config/initializers/`/etc.) durante contexto de audit a menos que `WIRE_AUDIT_APPLY=1` esteja definida — protege mesmo se a skill ignorar a metodologia. Sem o `wire-base`, a disciplina é só contractual.

Os 5 audits e o `local-reviewer` funcionam standalone (sem `wire-base`), mas perdem a camada de enforcement.

```
/plugin install wire-base@jump2new      # recomendado (para ngrok-expose)
/plugin install wire-devkit@jump2new
```

Outras runtime deps (opcionais):
- `local-reviewer` requer **Ollama local** (qwen3-coder); degrada para análise própria se indisponível.
- Integração MemPalace do `/full-audit` é opt-in, gated em `.mempalace/` existir no projecto auditado.

---

© 2026 jump2new · geral@jump2new.pt · Repositório privado

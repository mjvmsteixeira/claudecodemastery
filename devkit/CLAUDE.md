# wire-devkit

Toolkit de auditoria de developer. Cada audit existe em três camadas:

- **`skills/<nome>/SKILL.md`** — o cérebro. Metodologia + orquestração. Auto-dispara
  por intenção do utilizador. Carrega `references/*.md` on-demand (progressive disclosure).
- **`skills/<nome>/references/*.md`** — material pesado (tabelas OWASP, checklists K8s/WCAG,
  scanners). Não é carregado até a `SKILL.md` o pedir.
- **`commands/<nome>.md`** — wrapper fino. Parseia flags (`--scope`, `--ci`,
  `--export-report`, etc.) e invoca a skill correspondente. Não duplica metodologia.

## Convenções cross-cutting — `shared/`

Três ficheiros são a fonte de verdade, referenciados por todas as skills via
`${CLAUDE_PLUGIN_ROOT}/shared/`:

- `shared/scoring.md` — rubrica de scoring X.X/10.
- `shared/ci-mode.md` — comportamento de `--ci` (exit codes, JSON/SARIF).
- `shared/report-format.md` — estrutura do relatório e naming de `--export-report`.

Uma skill **nunca** redefine scoring, formato de relatório ou comportamento CI —
referencia sempre `shared/`.

## Regras do projecto auditado

As skills lêem `rules/audit/<domínio>.md` do projecto auditado **se existir** —
para incorporar convenções específicas (paths de Vault, componentes canónicos, etc.).
O devkit **não** empacota templates nem oferece `--update-rules`.

## Dependências

- Dependência **soft** do `wire-base`: só o `ngrok-expose` usa
  `lib/vault-env.sh` do base. Os 5 audits individuais e o `local-reviewer` funcionam standalone.
- `local-reviewer` precisa de Ollama local; degrada para análise própria se offline.
- A integração MemPalace do `full-audit` é opcional, gated em `.mempalace/` existir.

# wire-devkit

Toolkit de auditoria de developer. Cada audit existe em três camadas:

- **`skills/<nome>/SKILL.md`** — o cérebro. Metodologia + orquestração. Auto-dispara
  por intenção do utilizador. Carrega `references/*.md` on-demand (progressive disclosure).
- **`skills/<nome>/references/*.md`** — material pesado (tabelas OWASP, checklists K8s/WCAG,
  scanners). Não é carregado até a `SKILL.md` o pedir.
- **`commands/<nome>.md`** — wrapper fino. Parseia flags (`--scope`, `--ci`,
  `--export-report`, etc.) e invoca a skill correspondente. Não duplica metodologia.

## Convenções cross-cutting — `shared/`

Quatro ficheiros são a fonte de verdade, referenciados por todas as skills via
`${CLAUDE_PLUGIN_ROOT}/shared/`:

- `shared/scoring.md` — rubrica de scoring X.X/10.
- `shared/ci-mode.md` — comportamento de `--ci` (exit codes, JSON/SARIF).
- `shared/report-format.md` — estrutura do relatório e naming de `--export-report`.
- `shared/safe-apply.md` — gates obrigatórios antes de aplicar correcções (Gate 1
  modo operacional, Gate 2 sample/empty-shell detection, Gate 3 acções destrutivas
  com confirmação humana). Toda a skill que possa mutar ficheiros referencia este
  documento na secção "Correcções".

Uma skill **nunca** redefine scoring, formato de relatório, comportamento CI ou
política de safe-apply — referencia sempre `shared/`.

## Safety convention — read-only por defeito

Esta é a regra mais importante deste plugin e a única que não pode regredir:

1. **Nenhuma skill de audit pode prometer auto-fix sem confirmação no `description:` do
   frontmatter.** O `description:` é o que sub-agentes lêem antes de qualquer outra
   coisa — uma promessa "corrige TODOS sem perguntar" autoriza acções destrutivas mesmo
   quando o CLAUDE.md do projecto auditado diz o contrário (incidente real em 2026-05).
   `scripts/validate.sh` falha o build se detectar `sem perguntar|corrige TODOS|auto-?fix de tudo|automaticamente sem|without asking|without confirmation` em qualquer
   `SKILL.md` ou `commands/*.md`.

2. **Default = report-only.** Skills emitem o relatório e param. Correcção é opt-in:
   `--apply` no `full-audit`, `--auto-fix-safe` no `security-scan`, prompt humano
   nos restantes.

3. **Antes de aplicar, executar os 3 gates de `shared/safe-apply.md`:**
   - Gate 1: lê `WIRE_OPERATING_MODE` (ou `~/.wire/mode`); em `dev` degrada para
     report-only.
   - Gate 2: detecta sample/empty-shell via marcadores (`.dev-shell`, `SAMPLE.md`,
     comentário em CLAUDE.md, `WIRE_AUDIT_PROFILE=dev-shell`); se positivo, degrada.
   - Gate 3: acções destrutivas (apagar/mover, `.gitignore`, `.env*`, initializers,
     spec/test, drop SQL, etc.) pedem confirmação humana individual com diff.

4. **Defense-in-depth via `wire-base`:** se o `wire-base` estiver instalado, o hook
   `pre-tool-audit-guard.sh` (PreToolUse) bloqueia tools destrutivos durante contexto
   de audit (marker file `~/.wire/audit-active` ou env `WIRE_AUDIT_ACTIVE=1`) a menos
   que `WIRE_AUDIT_APPLY=1` esteja exportada. Skills devem fazer set/unset destes
   sinais ao entrar/sair da Fase 4 com `apply` aprovado.

Quando adicionar nova skill que possa mutar ficheiros, replicar a estrutura das skills
existentes: secção "## 6. Correcções" começa com a referência a `shared/safe-apply.md`.
Resistir à tentação de prometer "corrige automaticamente" para tornar a skill mais
"útil" — utilidade que não respeita o utilizador é prejuízo.

## Regras do projecto auditado

As skills lêem `rules/audit/<domínio>.md` do projecto auditado **se existir** —
para incorporar convenções específicas (paths de Vault, componentes canónicos, etc.).
O devkit **não** empacota templates nem oferece `--update-rules`.

## Dependências

- Dependência **soft** do `wire-base`: só o `ngrok-expose` usa
  `lib/vault-env.sh` do base. Os 5 audits individuais e o `local-reviewer` funcionam standalone.
- `local-reviewer` precisa de Ollama local; degrada para análise própria se offline.
- A integração MemPalace do `full-audit` é opcional, gated em `.mempalace/` existir.
